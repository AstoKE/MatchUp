import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import { catalog, codeOf, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { anonClient, closeDb, db, deleteCreatedUsers, type TestUser } from './helpers';

/**
 * Phase 6 / M4 through the real API: an administrator is only one with a second factor in the token (S-14), a suspension
 * really ends the sessions (S-13), and two administrators deciding one report at once leave one decision.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await db()
    .query(`delete from public.moderation_actions where actor_id = any($1)`, [admins])
    .catch(() => undefined);
  await db().query(`delete from public.reports where reporter_id = any($1)`, [reporters]);
  await deleteCreatedUsers();
  await closeDb();
});
const admins: string[] = [];
const reporters: string[] = [];

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** RFC 6238: the six digits an authenticator app shows for this secret now. */
function totp(secret: string, at = Date.now()) {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase())
    bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Signs in, enrolls an authenticator and answers its challenge: a token that says aal2, and the one that did not. */
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
  return { client, aal1, aal2: verified.data!.access_token };
}

async function admin(name: string) {
  const person = await onboardedUser(c, name);
  await db().query(`insert into public.platform_admins (user_id) values ($1)`, [person.user.id]);
  admins.push(person.user.id);
  return { ...person, ...(await withSecondFactor(person.user)) };
}

async function publicEvent() {
  const organizer = await onboardedUser(c, 'Düzenleyen');
  const made = await rpc(
    'create_event',
    { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
    organizer.token,
  );
  expect(made.status).toBe(200);
  return made.body as string;
}

describe('the second factor, end to end', () => {
  it('an administrator is refused with the first factor only, and admitted with the second', async () => {
    const boss = await admin('Yönetici');
    const first = await rpc('admin_list_reports', {}, boss.aal1);
    expect(first.status).toBe(400);
    expect((first.body as { message: string }).message).toBe('MFA_REQUIRED');
    const second = await rpc('admin_list_reports', {}, boss.aal2);
    expect(second.status).toBe(200);
    expect(Array.isArray((second.body as { items: unknown }).items)).toBe(true);
  });

  it('someone who is no administrator is refused with either, and learns nothing about the role', async () => {
    const person = await onboardedUser(c, 'Sıradan');
    const both = await withSecondFactor(person.user);
    for (const token of [both.aal1, both.aal2]) {
      const answer = await rpc('admin_list_reports', {}, token);
      expect(answer.status).toBe(400);
      expect((answer.body as { message: string }).message).toBe('NOT_ALLOWED');
    }
  });

  it('a guest cannot call any of them', async () => {
    const answer = await rpc('admin_list_reports', {});
    expect([401, 403]).toContain(answer.status);
  });
});

describe('suspending', () => {
  it('ends the sessions of the person, so even a refresh token stops working', async () => {
    const boss = await admin('Yönetici');
    const target = await onboardedUser(c, 'Askıya Alınacak');
    const client = anonClient();
    const signed = await client.auth.signInWithPassword({
      email: target.user.email,
      password: target.user.password,
    });
    const refresh = signed.data.session!.refresh_token;
    const done = await rpc(
      'admin_suspend_user',
      { p_user_id: target.user.id, p_note: 'Deneme' },
      boss.aal2,
    );
    expect(done.status).toBe(204);
    const again = await anonClient().auth.refreshSession({ refresh_token: refresh });
    expect(again.error).not.toBeNull();
    const act = await rpc('request_join', { p_event_id: randomUUID() }, target.token);
    expect((act.body as { message: string }).message).toBe('ACCOUNT_RESTRICTED');
  });
});

describe('deciding under concurrency', () => {
  it('two administrators closing one report with different outcomes leave one decision', async () => {
    const eventId = await publicEvent();
    const reporter = await onboardedUser(c, 'Rapor Eden');
    reporters.push(reporter.user.id);
    const made = await rpc(
      'report',
      { p_target_type: 'EVENT', p_target_id: eventId, p_reason: 'SPAM' },
      reporter.token,
    );
    const reportId = made.body as string;
    const boss = await admin('Yönetici');
    const results = await runConcurrently(2, async ({ client, index, barrier }) => {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: boss.user.id, role: 'authenticated', aal: 'aal2' }),
      ]);
      await client.query('set local role authenticated');
      await barrier();
      const { rows } = await client.query<{ n: number }>(
        `select public.admin_resolve_report($1, $2) as n`,
        [reportId, index === 0 ? 'ACTIONED' : 'DISMISSED'],
      );
      return rows[0]!.n;
    });
    expect(fulfilled(results)).toEqual([1]);
    expect(rejected(results).map(codeOf)).toEqual(['INVALID_TRANSITION']);
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.moderation_actions where report_id = $1`,
      [reportId],
    );
    expect(rows[0]!.n).toBe(1);
  });
});
