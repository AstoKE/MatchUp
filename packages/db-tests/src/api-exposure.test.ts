import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDb,
  createUser,
  deleteCreatedUsers,
  rest,
  signedInClient,
  type TestUser,
} from './helpers';

/**
 * What can a hostile HTTP client reach through the public Data API? (SECURITY §11: S-4…S-7, S-10, S-11, S-21)
 * These tests talk to PostgREST directly, exactly as an attacker with the public anon key would.
 */
describe('Data API exposure (guest and signed-in)', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceToken: string;

  beforeAll(async () => {
    alice = await createUser();
    bob = await createUser();
    aliceToken = (await signedInClient(alice)).accessToken;
  });
  afterAll(async () => {
    await deleteCreatedUsers();
    await closeDb();
  });

  describe('guests (anon key only)', () => {
    it('can read public operational config', async () => {
      const response = await rest('/app_config?select=key');
      expect(response.status).toBe(200);
      const rows = (await response.json()) as { key: string }[];
      expect(rows.map((r) => r.key)).toContain('min_supported_app_version');
    });

    it.each(['profiles', 'user_settings', 'user_consents', 'platform_admins'])(
      'cannot read %s',
      async (table) => {
        const response = await rest(`/${table}?select=*`);
        expect([401, 403]).toContain(response.status);
        const body = (await response.json()) as { code?: string };
        expect(body.code).toBe('42501');
      },
    );

    it('cannot write anything, not even config', async () => {
      const response = await rest('/app_config', {
        method: 'POST',
        body: JSON.stringify({ key: 'evil', value: true }),
      });
      expect([401, 403]).toContain(response.status);
    });

    it('cannot call account RPCs', async () => {
      const response = await rest('/rpc/get_my_account', { method: 'POST', body: '{}' });
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('signed-in users', () => {
    it('see only their own profile row', async () => {
      const response = await rest('/profiles?select=id', { token: aliceToken });
      expect(response.status).toBe(200);
      const rows = (await response.json()) as { id: string }[];
      expect(rows).toEqual([{ id: alice.id }]);
    });

    it("cannot read another user's profile by id (S-4/IDOR)", async () => {
      const response = await rest(`/profiles?select=id&id=eq.${bob.id}`, { token: aliceToken });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it('cannot update their own profile or status through the API (writes are RPC-only)', async () => {
      for (const body of [{ display_name: 'hacked' }, { account_status: 'ACTIVE' }]) {
        const response = await rest(`/profiles?id=eq.${alice.id}`, {
          method: 'PATCH',
          token: aliceToken,
          body: JSON.stringify(body),
        });
        expect([401, 403]).toContain(response.status);
      }
    });

    it('cannot grant themselves admin (S-6)', async () => {
      const response = await rest('/platform_admins', {
        method: 'POST',
        token: aliceToken,
        body: JSON.stringify({ user_id: alice.id }),
      });
      expect([401, 403]).toContain(response.status);
      const check = await rest('/platform_admins?select=user_id', { token: aliceToken });
      expect(await check.json()).toEqual([]);
    });

    it('cannot forge consent records or settings', async () => {
      const consent = await rest('/user_consents', {
        method: 'POST',
        token: aliceToken,
        body: JSON.stringify({ user_id: alice.id, kind: 'TERMS', version: 'v9' }),
      });
      expect([401, 403]).toContain(consent.status);
      const settings = await rest(`/user_settings?user_id=eq.${alice.id}`, {
        method: 'PATCH',
        token: aliceToken,
        body: JSON.stringify({ profile_visibility: 'EVERYONE' }),
      });
      expect([401, 403]).toContain(settings.status);
    });

    it('can call get_my_account and get only their own state', async () => {
      const response = await rest('/rpc/get_my_account', {
        method: 'POST',
        token: aliceToken,
        body: '{}',
      });
      expect(response.status).toBe(200);
      const rows = (await response.json()) as { user_id: string; is_admin: boolean }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: alice.id, is_admin: false });
    });
  });

  describe('private helpers are not part of the API surface', () => {
    const helpers = [
      'is_admin',
      'assert_active_verified_user',
      'handle_new_user',
      'set_updated_at',
    ];

    it.each(helpers)('rpc/%s is not routable for guests', async (name) => {
      const response = await rest(`/rpc/${name}`, { method: 'POST', body: '{}' });
      expect([401, 403, 404]).toContain(response.status);
      expect(response.status).not.toBe(200);
    });

    it.each(helpers)('rpc/%s is not routable for signed-in users', async (name) => {
      const response = await rest(`/rpc/${name}`, {
        method: 'POST',
        token: aliceToken,
        body: '{}',
      });
      expect(response.status).toBe(404);
    });

    it('the guest OpenAPI document does not advertise private objects', async () => {
      const response = await rest('/');
      if (!response.ok) return; // not served to guests at all: even better
      const spec = JSON.stringify(await response.json());
      expect(spec).not.toContain('is_admin');
      expect(spec).not.toContain('handle_new_user');
      expect(spec).not.toContain('platform_admins');
      expect(spec).not.toContain('/profiles');
    });
  });
});
