import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalog, eventInput, onboardedUser, rpc, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 8 / M5 (ADR-0028): who is sent "events for you" and reminders, and how often. Badminton keeps these events apart
 * from the football ones other tests create; the queueing functions take the time as an argument, so day and night,
 * today and tomorrow, are chosen by the test. Each case runs in a transaction that is rolled back.
 */
let c: Catalog;
let badminton: { sport: string; format: string };
let noon: Date;
beforeAll(async () => {
  c = await catalog();
  const { rows } = await db().query<{ sport: string; format: string }>(
    `select s.id as sport, f.id as format from public.sports s
       join public.sport_formats f on f.sport_id = s.id and f.slug = 'singles' where s.slug = 'badminton'`,
  );
  badminton = rows[0]!;
  const t = await db().query<{ noon: Date }>(
    `select (date_trunc('day', now() at time zone 'Europe/Istanbul') + interval '12 hours')
              at time zone 'Europe/Istanbul' as noon`,
  );
  noon = t.rows[0]!.noon;
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

const at = (base: Date, hours: number) =>
  new Date(base.getTime() + hours * 3_600_000).toISOString();

/** An onboarded badminton player in Ankara; `push` gives the consent and a phone. */
async function player(
  name: string,
  options: {
    level?: number;
    recommendations?: boolean;
    reminders?: boolean;
    device?: boolean;
    lastSeenDaysAgo?: number;
  } = {},
) {
  const person = await onboardedUser(c, name);
  const id = person.user.id;
  await db().query(
    `insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level) values ($1, $2, $3)`,
    [id, badminton.sport, options.level ?? 3],
  );
  await db().query(
    `update public.user_settings
        set push_recommendations_at = case when $2 then now() end,
            push_reminders_at = case when $3 then now() end
      where user_id = $1`,
    [id, options.recommendations ?? false, options.reminders ?? false],
  );
  if (options.device ?? true) {
    await db().query(
      `insert into public.push_devices (user_id, token, platform, last_seen_at)
       values ($1, $2, 'ios', now() - make_interval(days => $3))`,
      [
        id,
        `ExponentPushToken[p${randomUUID().replace(/-/g, '').slice(0, 16)}]`,
        options.lastSeenDaysAgo ?? 0,
      ],
    );
  }
  return person;
}

/** Moves a person to another province (no district), so a case can have its events to itself. */
async function moveTo(userId: string, city: string) {
  await db().query(
    `update public.profiles set city_id = (select id from public.cities where slug = $2), district_id = null
      where id = $1`,
    [userId, city],
  );
}

async function badmintonEvent(
  organizerToken: string,
  skill?: { min: number; max: number },
  city?: string,
) {
  const place = city
    ? (
        await db().query<{ city_id: string; district_id: string }>(
          `select c.id as city_id, d.id as district_id from public.cities c
             join public.districts d on d.city_id = c.id where c.slug = $1 order by d.slug limit 1`,
          [city],
        )
      ).rows[0]!
    : { city_id: c.city, district_id: c.district };
  const made = await rpc(
    'create_event',
    {
      p_client_request_id: randomUUID(),
      p_input: eventInput(c, {
        sport_id: badminton.sport,
        sport_format_id: badminton.format,
        capacity: 2,
        ...place,
      }),
      p_publish: true,
    },
    organizerToken,
  );
  expect(made.status).toBe(200);
  const id = made.body as string;
  if (skill) {
    await db().query(`update public.events set skill_min = $2, skill_max = $3 where id = $1`, [
      id,
      skill.min,
      skill.max,
    ]);
  }
  return id;
}

async function inTransaction(run: (client: pg.PoolClient) => Promise<void>) {
  const client = await db().connect();
  try {
    await client.query('begin');
    await run(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

const queued = async (client: pg.PoolClient, kind: string, users: string[]) =>
  (
    await client.query<{ user_id: string; event_id: string | null; args: Record<string, unknown> }>(
      `select user_id::text, event_id::text, args from public.push_outbox
        where kind = $1 and user_id = any($2::uuid[]) order by created_at, id`,
      [kind, users],
    )
  ).rows;

describe('events for you', () => {
  it('goes to players of the sport in the province, within the level range, never the organizer', async () => {
    const organizer = await player('Düzenleyen', { recommendations: true });
    const fits = await player('Uyan', { recommendations: true });
    const noConsent = await player('Rızasız');
    const noPhone = await player('Telefonsuz', { recommendations: true, device: false });
    const elsewhere = await player('Uzakta', { recommendations: true });
    await moveTo(elsewhere.user.id, 'izmir');
    const strong = await player('Güçlü', { recommendations: true, level: 4.5 });
    const open = await badmintonEvent(organizer.token);
    const advanced = await badmintonEvent(organizer.token, { min: 4, max: 5 });
    await db().query(
      `update public.events set starts_at = starts_at + interval '1 day' where id = $1`,
      [open],
    );
    const everyone = [organizer, fits, noConsent, noPhone, elsewhere, strong].map((p) => p.user.id);

    await inTransaction(async (client) => {
      await client.query(`select private.queue_recommendations($1)`, [noon.toISOString()]);
      const rows = await queued(client, 'RECOMMENDATION', everyone);
      expect(rows.map((r) => [r.user_id, r.event_id])).toEqual(
        expect.arrayContaining([
          [fits.user.id, open],
          // The soonest match first: the advanced game starts a day before the open one.
          [strong.user.id, advanced],
        ]),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!.args).toMatchObject({
        sport: { tr: 'Badminton' },
        district: { tr: 'Çankaya' },
      });
    });
  });

  it('skips someone already in the event or blocked with its organizer', async () => {
    const organizer = await player('Düzenleyen 2');
    const joined = await player('Katılan', { recommendations: true });
    const blocked = await player('Engelli', { recommendations: true });
    // A province of its own: the other cases' Ankara games stay out.
    await moveTo(joined.user.id, 'bursa');
    await moveTo(blocked.user.id, 'bursa');
    const event = await badmintonEvent(organizer.token, undefined, 'bursa');
    expect((await rpc('request_join', { p_event_id: event }, joined.token)).status).toBe(200);
    await rpc('block_user', { p_user_id: blocked.user.id }, organizer.token);
    await inTransaction(async (client) => {
      await client.query(`select private.queue_recommendations($1)`, [noon.toISOString()]);
      expect(await queued(client, 'RECOMMENDATION', [joined.user.id, blocked.user.id])).toEqual([]);
    });
  });

  it('at most one a day, never the same event twice, and nothing in quiet hours', async () => {
    const organizer = await player('Düzenleyen 3');
    const fan = await player('Hevesli', { recommendations: true });
    await moveTo(fan.user.id, 'eskisehir');
    const first = await badmintonEvent(organizer.token, undefined, 'eskisehir');
    const second = await badmintonEvent(organizer.token, undefined, 'eskisehir');
    await db().query(
      `update public.events set starts_at = starts_at + interval '1 day' where id = $1`,
      [second],
    );
    await inTransaction(async (client) => {
      for (const hour of [23, 8.98]) {
        const night = at(new Date(noon.getTime() - 12 * 3_600_000), hour);
        expect(
          (
            await client.query<{ n: number }>(`select private.queue_recommendations($1) as n`, [
              night,
            ])
          ).rows[0]!.n,
        ).toBe(0);
      }
      await client.query(`select private.queue_recommendations($1)`, [noon.toISOString()]);
      await client.query(`select private.queue_recommendations($1)`, [at(noon, 2)]);
      expect(
        (await queued(client, 'RECOMMENDATION', [fan.user.id])).map((r) => r.event_id),
      ).toEqual([first]);
      // The next day: the other game, not the first one again.
      await client.query(`select private.queue_recommendations($1)`, [at(noon, 24)]);
      await client.query(`select private.queue_recommendations($1)`, [at(noon, 48)]);
      expect(
        (await queued(client, 'RECOMMENDATION', [fan.user.id])).map((r) => r.event_id),
      ).toEqual([first, second]);
    });
  });

  it('is written in the person’s language, with the sport and district only', async () => {
    const { rows } = await db().query<{
      tr: { title: string; body: string };
      en: { title: string; body: string };
    }>(
      `select private.push_text('RECOMMENDATION', 'tr', a) as tr, private.push_text('RECOMMENDATION', 'en', a) as en
         from (select jsonb_build_object('sport', '{"tr":"Badminton","en":"Badminton"}'::jsonb,
                                         'district', '{"tr":"Çankaya","en":"Çankaya"}'::jsonb) a) x`,
    );
    expect(rows[0]).toEqual({
      tr: { title: 'Sana uygun yeni bir maç', body: 'Badminton · Çankaya. Görmek için dokun.' },
      en: { title: 'A new game for you', body: 'Badminton · Çankaya. Tap to see it.' },
    });
  });
});

describe('reminders', () => {
  it('after a week away, if the province has games: at most two in seven days, 48 hours apart', async () => {
    const organizer = await player('Düzenleyen 4');
    await badmintonEvent(organizer.token);
    const away = await player('Uzun süredir yok', { reminders: true, lastSeenDaysAgo: 8 });
    const recent = await player('Yeni girdi', { reminders: true, lastSeenDaysAgo: 3 });
    const quiet = await player('Sessiz il', { reminders: true, lastSeenDaysAgo: 8 });
    await db().query(
      `update public.profiles set city_id = (select id from public.cities where slug = 'adana'), district_id = null
        where id = $1`,
      [quiet.user.id],
    );
    await db().query(
      `delete from public.events where city_id = (select id from public.cities where slug = 'adana')`,
    );
    const ids = [away.user.id, recent.user.id, quiet.user.id];
    await inTransaction(async (client) => {
      await client.query(`select private.queue_reminders($1)`, [noon.toISOString()]);
      const first = await queued(client, 'REMINDER', ids);
      expect(first.map((r) => r.user_id)).toEqual([away.user.id]);
      expect(Number(first[0]!.args.count)).toBeGreaterThan(0);
      expect(first[0]!.args).toMatchObject({ city: { tr: 'Ankara' } });
      expect(first[0]!.event_id).toBeNull();

      for (const hours of [1, 47])
        await client.query(`select private.queue_reminders($1)`, [at(noon, hours)]);
      expect(await queued(client, 'REMINDER', [away.user.id])).toHaveLength(1);
      await client.query(`select private.queue_reminders($1)`, [at(noon, 49)]);
      expect(await queued(client, 'REMINDER', [away.user.id])).toHaveLength(2);
      // A third within the same seven days is over the limit.
      await client.query(`select private.queue_reminders($1)`, [at(noon, 100)]);
      expect(await queued(client, 'REMINDER', [away.user.id])).toHaveLength(2);
      // Nothing at night.
      expect(
        (
          await client.query<{ n: number }>(`select private.queue_reminders($1) as n`, [
            at(noon, 11),
          ])
        ).rows[0]!.n,
      ).toBe(0);
    });
  });

  it('stops at sending time when the consent is withdrawn after queueing', async () => {
    const away = await player('Vazgeçen', { reminders: true, lastSeenDaysAgo: 8 });
    const { rows } = await db().query<{ before: boolean; after: boolean }>(
      `select private.push_allowed($1, 'REMINDER') as before,
              (select private.push_allowed($1, 'REMINDER')
                 from (select 1 from public.user_settings where user_id = $1) x) as after`,
      [away.user.id],
    );
    expect(rows[0]!.before).toBe(true);
    await rpc('set_push_consents', { p_recommendations: false, p_reminders: false }, away.token);
    const after = await db().query<{ ok: boolean }>(
      `select private.push_allowed($1, 'REMINDER') as ok`,
      [away.user.id],
    );
    expect(after.rows[0]!.ok).toBe(false);
  });
});
