import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { anonClient, closeDb, db, deleteCreatedUsers, type TestUser } from './helpers';

let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** RFC 6238, as in admin-api.test.ts; exercise real enrollment and verification. */
function totp(secret: string, at = Date.now()) {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase())
    bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const offset = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
async function withSecondFactor(user: TestUser) {
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(signed.error).toBeNull();
  const aal1 = signed.data.session!.access_token;
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
  expect(enrolled.error).toBeNull();
  const factorId = enrolled.data!.id;
  const challenge = await client.auth.mfa.challenge({ factorId });
  expect(challenge.error).toBeNull();
  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data!.id,
    code: totp(enrolled.data!.totp.secret),
  });
  expect(verified.error).toBeNull();
  return { aal1, aal2: verified.data!.access_token };
}

describe('admin dashboard through the local Data API', () => {
  it('requires the second factor and returns only the documented shape', async () => {
    const person = await onboardedUser(c, 'Pano yönetici');
    await db().query('insert into public.platform_admins (user_id) values ($1)', [person.user.id]);
    const tokens = await withSecondFactor(person.user);
    const denied = await rpc('admin_dashboard_summary', {}, tokens.aal1);
    expect(denied.status).toBe(400);
    expect(denied.body).toMatchObject({ message: 'MFA_REQUIRED' });
    const result = await rpc('admin_dashboard_summary', {}, tokens.aal2);
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'generated_at',
        'reports',
        'organization_requests',
        'business_requests',
        'feedback',
        'disputes',
        'flags',
        'recent_actions',
      ].sort(),
    );
    expect(typeof body.generated_at).toBe('string');
    expect(Number.isNaN(Date.parse(body.generated_at as string))).toBe(false);
    for (const name of [
      'reports',
      'organization_requests',
      'business_requests',
      'feedback',
      'disputes',
    ]) {
      const queue = body[name] as Record<string, unknown>;
      expect(Object.keys(queue).sort()).toEqual(
        (name === 'reports' ? ['count', 'oldest_at', 'by_type'] : ['count', 'oldest_at']).sort(),
      );
      expect(typeof queue.count).toBe('number');
      expect(Number(queue.count)).toBeGreaterThanOrEqual(0);
      expect(queue.oldest_at === null || typeof queue.oldest_at === 'string').toBe(true);
    }
    const types = (body.reports as { by_type: Record<string, unknown> }).by_type;
    expect(Object.keys(types).sort()).toEqual(['EVENT', 'ORGANIZATION', 'USER', 'VENUE']);
    for (const count of Object.values(types)) expect(typeof count).toBe('number');
    expect(Object.keys(body.flags as object)).toEqual(['count']);
    expect(typeof (body.flags as { count: unknown }).count).toBe('number');
    expect(Array.isArray(body.recent_actions)).toBe(true);
    const actions = body.recent_actions as Record<string, unknown>[];
    expect(actions.length).toBeLessThanOrEqual(10);
    for (const action of actions) {
      expect(Object.keys(action).sort()).toEqual(['action', 'created_at', 'note', 'target_type']);
      for (const key of ['action', 'created_at', 'target_type'])
        expect(typeof action[key]).toBe('string');
      expect(action.note === null || typeof action.note === 'string').toBe(true);
    }
    expect(JSON.stringify(result.body)).not.toMatch(/display_name|actor_id|email/);
  });
  it('refuses a player even with a second factor', async () => {
    const player = await onboardedUser(c, 'Pano oyuncu');
    const tokens = await withSecondFactor(player.user);
    for (const token of [tokens.aal1, tokens.aal2]) {
      const result = await rpc('admin_dashboard_summary', {}, token);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ message: 'NOT_ALLOWED' });
    }
  });
  it('refuses a guest at the API boundary', async () => {
    const result = await rpc('admin_dashboard_summary', {});
    expect([401, 403]).toContain(result.status);
  });
});
