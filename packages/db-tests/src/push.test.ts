import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 8 / M4 (ADR-0028): devices, consents and the sender. The sender's network call is pg_net's; these tests check
 * what is queued for it (inside a transaction that is rolled back, so nothing leaves the machine) and how Expo's answers
 * are read (answers inserted as pg_net would store them).
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

let counter = 0;
const token = () =>
  `ExponentPushToken[test${Date.now().toString(36)}${(counter++).toString(36)}xx]`;

describe('devices', () => {
  it('registers a well-formed token for the caller, and moves a token to whoever signs in on that device', async () => {
    const a = await onboardedUser(c, 'Cihaz A');
    const b = await onboardedUser(c, 'Cihaz B');
    const shared = token();
    expect(
      (await rpc('register_push_device', { p_token: 'not-a-token', p_platform: 'ios' }, a.token))
        .body,
    ).toMatchObject({ message: 'VALIDATION_FAILED' });
    expect(
      (await rpc('register_push_device', { p_token: shared, p_platform: 'web' }, a.token)).body,
    ).toMatchObject({ message: 'VALIDATION_FAILED' });
    expect(
      (await rpc('register_push_device', { p_token: shared, p_platform: 'ios' }, a.token)).status,
    ).toBe(204);
    expect(
      (await rpc('register_push_device', { p_token: shared, p_platform: 'ios' }, b.token)).status,
    ).toBe(204);
    const { rows } = await db().query<{ user_id: string }>(
      `select user_id from public.push_devices where token = $1`,
      [shared],
    );
    expect(rows).toEqual([{ user_id: b.user.id }]);
  });

  it('unregisters only one’s own token, and keeps at most ten devices', async () => {
    const a = await onboardedUser(c, 'Çok cihaz');
    const b = await onboardedUser(c, 'Başka');
    const mine = token();
    await rpc('register_push_device', { p_token: mine, p_platform: 'android' }, a.token);
    await rpc('unregister_push_device', { p_token: mine }, b.token);
    expect(
      (await db().query(`select 1 from public.push_devices where token = $1`, [mine])).rowCount,
    ).toBe(1);
    await rpc('unregister_push_device', { p_token: mine }, a.token);
    expect(
      (await db().query(`select 1 from public.push_devices where token = $1`, [mine])).rowCount,
    ).toBe(0);

    for (let i = 0; i < 12; i++) {
      await rpc('register_push_device', { p_token: token(), p_platform: 'ios' }, a.token);
    }
    const { rows } = await db().query<{ n: string }>(
      `select count(*)::text as n from public.push_devices where user_id = $1`,
      [a.user.id],
    );
    expect(rows[0]!.n).toBe('10');
  });

  it('is not reachable through the Data API', async () => {
    const a = await onboardedUser(c, 'Meraklı');
    const { rest } = await import('./helpers');
    for (const table of ['push_devices', 'push_outbox', 'push_deliveries']) {
      const response = await rest(`/${table}?select=*`, { token: a.token });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('consents', () => {
  it('records both choices and that the person was asked; withdrawing revokes', async () => {
    const a = await onboardedUser(c, 'Rıza');
    expect(
      (await rpc('set_push_consents', { p_recommendations: true, p_reminders: false }, a.token))
        .status,
    ).toBe(204);
    const settings = () =>
      db().query<{ rec: boolean; rem: boolean; asked: boolean }>(
        `select push_recommendations_at is not null as rec, push_reminders_at is not null as rem,
                push_prompted_at is not null as asked
           from public.user_settings where user_id = $1`,
        [a.user.id],
      );
    expect((await settings()).rows[0]).toEqual({ rec: true, rem: false, asked: true });
    await rpc('set_push_consents', { p_recommendations: false, p_reminders: false }, a.token);
    expect((await settings()).rows[0]).toEqual({ rec: false, rem: false, asked: true });
    const { rows } = await db().query<{ kind: string; revoked: boolean }>(
      `select kind::text, revoked_at is not null as revoked from public.user_consents
        where user_id = $1 and kind::text like 'PUSH_%'`,
      [a.user.id],
    );
    expect(rows).toEqual([{ kind: 'PUSH_RECOMMENDATIONS', revoked: true }]);
  });

  it('"my events" starts on, is saved with the other two, and is no recorded consent (P-20)', async () => {
    const a = await onboardedUser(c, 'Sevgi');
    const activity = async () =>
      (
        await db().query<{ on: boolean }>(
          `select push_activity as on from public.user_settings where user_id = $1`,
          [a.user.id],
        )
      ).rows[0]?.on;
    expect(await activity()).toBe(true);
    const off = { p_recommendations: true, p_reminders: false, p_activity: false };
    expect((await rpc('set_push_preferences', off, a.token)).status).toBe(204);
    expect(await activity()).toBe(false);
    const { rows } = await db().query<{ kind: string }>(
      `select kind::text from public.user_consents where user_id = $1 and kind::text like 'PUSH_%'`,
      [a.user.id],
    );
    expect(rows).toEqual([{ kind: 'PUSH_RECOMMENDATIONS' }]);
    // Installed apps still send two choices: "my events" stays as it is.
    await rpc('set_push_consents', { p_recommendations: false, p_reminders: false }, a.token);
    expect(await activity()).toBe(false);
    expect([401, 403]).toContain((await rpc('set_push_preferences', off)).status);
  });
});

describe('the test message', () => {
  it('needs a device, and is limited to three a day', async () => {
    const a = await onboardedUser(c, 'Deneme');
    expect((await rpc('send_test_push', {}, a.token)).body).toBe(false);
    await rpc('register_push_device', { p_token: token(), p_platform: 'ios' }, a.token);
    for (let i = 0; i < 3; i++) expect((await rpc('send_test_push', {}, a.token)).body).toBe(true);
    expect((await rpc('send_test_push', {}, a.token)).body).toMatchObject({
      message: 'QUOTA_EXCEEDED',
    });
  });
});

describe('the sender', () => {
  it('queues one message per device, localized, with no personal data, in requests of at most 100', async () => {
    const tr = await onboardedUser(c, 'Gizli İsim');
    const en = await onboardedUser(c, 'Secret Name');
    const suspended = await onboardedUser(c, 'Askıda');
    await db().query(`update public.user_settings set locale = 'en' where user_id = $1`, [
      en.user.id,
    ]);
    const client = await db().connect();
    try {
      await client.query('begin');
      // Expo's limit is 100 messages a request: 101 devices make two requests.
      await client.query(
        `insert into public.push_devices (user_id, token, platform)
         select $1, 'ExponentPushToken[bulk' || g || 'xxxxxx]', 'ios' from generate_series(1, 100) g`,
        [tr.user.id],
      );
      await client.query(
        `insert into public.push_devices (user_id, token, platform) values
           ($1, 'ExponentPushToken[englishxxxx]', 'android'),
           ($2, 'ExponentPushToken[suspendedxx]', 'ios')`,
        [en.user.id, suspended.user.id],
      );
      await client.query(`update public.profiles set account_status = 'SUSPENDED' where id = $1`, [
        suspended.user.id,
      ]);
      await client.query(
        `insert into public.push_outbox (user_id, kind) values ($1, 'TEST'), ($2, 'TEST'), ($3, 'TEST')`,
        [tr.user.id, en.user.id, suspended.user.id],
      );
      await client.query(
        `update public.app_config set value = 'true'::jsonb where key = 'push.enabled'`,
      );
      // Other tests' messages wait in the same outbox: out of this batch.
      await client.query(
        `update public.push_outbox set dispatched_at = now()
          where dispatched_at is null and user_id <> all($1::uuid[])`,
        [[tr.user.id, en.user.id, suspended.user.id]],
      );
      const sent = await client.query<{ n: number }>(`select private.push_dispatch() as n`);
      expect(sent.rows[0]!.n).toBe(2);

      const queued = await client.query<{ body: string }>(
        `select convert_from(q.body, 'UTF8') as body from net.http_request_queue q
          where q.id in (select distinct request_id from public.push_deliveries d
                          join public.push_outbox o on o.id = d.outbox_id
                         where o.user_id in ($1, $2))
          order by q.id`,
        [tr.user.id, en.user.id],
      );
      const batches = queued.rows.map((r) => JSON.parse(r.body) as Record<string, unknown>[]);
      expect(batches.map((b) => b.length)).toEqual([100, 1]);
      const all = batches.flat();
      const english = all.find((m) => m.to === 'ExponentPushToken[englishxxxx]');
      expect(english).toMatchObject({ title: 'Notifications are on', data: { kind: 'TEST' } });
      expect(all[0]).toMatchObject({ title: 'Bildirimler açık', body: 'Bu bir deneme bildirimi.' });
      expect(all.some((m) => m.to === 'ExponentPushToken[suspendedxx]')).toBe(false);
      const text = JSON.stringify(all);
      expect(text).not.toContain('Gizli');
      expect(text).not.toContain('Secret');

      const closed = await client.query<{ open: string }>(
        `select count(*)::text as open from public.push_outbox
          where user_id in ($1, $2, $3) and dispatched_at is null`,
        [tr.user.id, en.user.id, suspended.user.id],
      );
      expect(closed.rows[0]!.open).toBe('0');
      const positions = await client.query<{ max: number; n: string }>(
        `select max(position) as max, count(*)::text as n from public.push_deliveries d
           join public.push_outbox o on o.id = d.outbox_id where o.user_id = $1`,
        [tr.user.id],
      );
      expect(positions.rows[0]).toEqual({ max: 99, n: '100' });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('sends nothing while switched off', async () => {
    const { rows } = await db().query<{ n: number }>(`select private.push_dispatch() as n`);
    expect(rows[0]!.n).toBe(0);
  });

  it('reads Expo’s tickets in order, deletes tokens Expo no longer knows, and closes unanswered batches', async () => {
    const a = await onboardedUser(c, 'Biletler');
    const client = await db().connect();
    try {
      await client.query('begin');
      const devices = await client.query<{ id: string }>(
        `insert into public.push_devices (user_id, token, platform) values
           ($1, 'ExponentPushToken[okayxxxxxxx]', 'ios'),
           ($1, 'ExponentPushToken[gonexxxxxxx]', 'ios'),
           ($1, 'ExponentPushToken[failxxxxxxx]', 'ios')
         returning id`,
        [a.user.id],
      );
      const outbox = await client.query<{ id: string }>(
        `insert into public.push_outbox (user_id, kind, dispatched_at) values ($1, 'TEST', now()) returning id`,
        [a.user.id],
      );
      const [ok, gone, fail] = devices.rows.map((r) => r.id);
      const o = outbox.rows[0]!.id;
      // Request -9001 answered with three tickets; -9002 answered 500; -9003 never answered, sent two hours ago.
      await client.query(
        `insert into public.push_deliveries (outbox_id, device_id, request_id, position, created_at) values
           ($1, $2, -9001, 0, now()), ($1, $3, -9001, 1, now()), ($1, $4, -9001, 2, now()),
           ($1, $2, -9002, 0, now()), ($1, $2, -9003, 0, now() - interval '2 hours')`,
        [o, ok, gone, fail],
      );
      await client.query(
        `insert into net._http_response (id, status_code, content, created) values
           (-9001, 200, $1, now()), (-9002, 500, 'oops', now())`,
        [
          JSON.stringify({
            data: [
              { status: 'ok', id: 'a' },
              { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
              { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } },
            ],
          }),
        ],
      );
      await client.query(`select private.push_collect()`);
      const result = await client.query<{
        request_id: string;
        position: number;
        status: string;
        error: string | null;
      }>(
        `select request_id::text, position, status, error from public.push_deliveries
          where outbox_id = $1 order by push_deliveries.request_id desc, position`,
        [o],
      );
      expect(result.rows).toEqual([
        { request_id: '-9001', position: 0, status: 'SENT', error: null },
        { request_id: '-9001', position: 1, status: 'ERROR', error: 'DeviceNotRegistered' },
        { request_id: '-9001', position: 2, status: 'ERROR', error: 'MessageRateExceeded' },
        { request_id: '-9002', position: 0, status: 'ERROR', error: 'HTTP_500' },
        { request_id: '-9003', position: 0, status: 'ERROR', error: 'NO_RESPONSE' },
      ]);
      const left = await client.query<{ token: string }>(
        `select token from public.push_devices where user_id = $1 order by token`,
        [a.user.id],
      );
      expect(left.rows.map((r) => r.token)).toEqual([
        'ExponentPushToken[failxxxxxxx]',
        'ExponentPushToken[okayxxxxxxx]',
      ]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

describe('export and purge', () => {
  it('exports the devices and messages, and the purge removes them', async () => {
    const a = await onboardedUser(c, 'Dışa aktaran');
    await rpc('register_push_device', { p_token: token(), p_platform: 'ios' }, a.token);
    await rpc('send_test_push', {}, a.token);
    const exported = await rpc('export_my_data', {}, a.token);
    expect(exported.body).toMatchObject({
      push_devices: [{ platform: 'ios' }],
      push_messages: [{ kind: 'TEST' }],
    });
    await db().query(
      `update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days'
        where id = $1`,
      [a.user.id],
    );
    await db().query(`select private.purge_account($1)`, [a.user.id]);
    const { rows } = await db().query<{ devices: string; messages: string }>(
      `select (select count(*)::text from public.push_devices where user_id = $1) as devices,
              (select count(*)::text from public.push_outbox where user_id = $1) as messages`,
      [a.user.id],
    );
    expect(rows[0]).toEqual({ devices: '0', messages: '0' });
  });
});
