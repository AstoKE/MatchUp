import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, signedInClient } from './helpers';

/**
 * Phase 8 (ADR-0029): verifying a phone through Supabase Auth's own phone change, as the app does. The local stack has
 * fixed codes for +90 555 000 00 01–80 (supabase/config.toml), so no SMS is sent. This file uses 10–19; E2E uses 40–59.
 * The requirement switch itself is tested in pgTAP (31_phone), where it can be flipped inside one transaction.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

const number = (n: number) => `+9055500000${String(n).padStart(2, '0')}`;

describe('phone verification', () => {
  it('confirms a number only with the right code, and the account says so', async () => {
    const me = await onboardedUser(c, 'Telefonlu');
    const { client, accessToken } = await signedInClient(me.user);
    const before = await rpc('get_my_account', {}, accessToken);
    expect((before.body as { phone_verified: boolean }[])[0]).toMatchObject({
      phone_verified: false,
      phone_required: false,
    });

    expect((await client.auth.updateUser({ phone: number(10) })).error).toBeNull();
    // Not yet: a number waiting for its code is not verified.
    const { rows: pending } = await db().query<{ phone: string | null; confirmed: boolean }>(
      `select phone, phone_confirmed_at is not null as confirmed from auth.users where id = $1`,
      [me.user.id],
    );
    expect(pending[0]!.confirmed).toBe(false);

    const wrong = await client.auth.verifyOtp({
      phone: number(10),
      token: '000000',
      type: 'phone_change',
    });
    expect(wrong.error).not.toBeNull();
    const right = await client.auth.verifyOtp({
      phone: number(10),
      token: '123456',
      type: 'phone_change',
    });
    expect(right.error).toBeNull();

    const token = right.data.session?.access_token ?? accessToken;
    const after = await rpc('get_my_account', {}, token);
    expect((after.body as { phone_verified: boolean }[])[0]).toMatchObject({
      phone_verified: true,
    });
    const exported = await rpc('export_my_data', {}, token);
    expect(exported.body).toMatchObject({ account: { phone: '905550000010' } });
  });

  it('keeps a number on one account only', async () => {
    const first = await onboardedUser(c, 'İlk');
    const second = await onboardedUser(c, 'İkinci');
    const a = (await signedInClient(first.user)).client;
    await a.auth.updateUser({ phone: number(11) });
    expect(
      (await a.auth.verifyOtp({ phone: number(11), token: '123456', type: 'phone_change' })).error,
    ).toBeNull();

    const b = (await signedInClient(second.user)).client;
    const taken = await b.auth.updateUser({ phone: number(11) });
    expect(taken.error?.code).toBe('phone_exists');
  });

  it('a verified foreign number does not count', async () => {
    const me = await onboardedUser(c, 'Yabancı numara');
    await db().query(
      `update auth.users set phone = '447700900123', phone_confirmed_at = now() where id = $1`,
      [me.user.id],
    );
    const account = await rpc('get_my_account', {}, me.token);
    expect((account.body as { phone_verified: boolean }[])[0]).toMatchObject({
      phone_verified: false,
    });
  });
});
