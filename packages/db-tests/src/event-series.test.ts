import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, runConcurrently } from './concurrency';
import {
  actAs,
  catalog,
  codeOf,
  eventInput,
  onboardedUser,
  rpc,
  type Catalog,
} from './event-fixtures';
import { closeDb, db, deleteCreatedUsers, rest } from './helpers';

/**
 * Phase 11 / M1 (ADR-0032): recurring events through the real API, and the two races that matter: the same event made
 * into a series twice at once, and two runs of the hourly job at once. The rules in detail are in pgTAP 44_event_series.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  // Deleting the Auth user leaves a stopped series without owner or details; nothing references it any more.
  await db().query(
    `delete from public.event_series s where s.organizer_id is null
        and not exists (select 1 from public.events e where e.series_id = s.id)`,
  );
  await closeDb();
});

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

async function published(token: string, startsInDays: number) {
  const made = await rpc(
    'create_event',
    {
      p_client_request_id: randomUUID(),
      p_input: eventInput(c, { title: 'Salı maçı', starts_at: days(startsInDays) }),
      p_publish: true,
    },
    token,
  );
  expect(made.status).toBe(200);
  return made.body as string;
}

describe('event series', () => {
  it('opens the next week, lists it for the organizer and shows a player that the event repeats', async () => {
    const organizer = await onboardedUser(c, 'Seri Düzenleyen');
    const player = await onboardedUser(c, 'Seri Oyuncu');
    const event = await published(organizer.token, 2);

    const made = await rpc(
      'create_event_series',
      { p_event_id: event, p_interval_weeks: 1 },
      organizer.token,
    );
    expect(made.status).toBe(200);
    const mine = await rpc('list_my_event_series', {}, organizer.token);
    expect(mine.status).toBe(200);
    const [series] = mine.body as { id: string; status: string; upcoming: { id: string }[] }[];
    expect(series?.id).toBe(made.body);
    expect(series?.status).toBe('ACTIVE');
    expect(series?.upcoming).toHaveLength(2);

    const seen = await rpc('get_event_series', { p_event_id: event }, player.token);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      interval_weeks: 1,
      status: 'ACTIVE',
      is_mine: false,
      next_at: null,
    });
  });

  it('is refused to others and to guests, and is not readable through the Data API', async () => {
    const organizer = await onboardedUser(c, 'Seri Sahibi');
    const other = await onboardedUser(c, 'Seri Yabancı');
    const event = await published(organizer.token, 3);

    const foreign = await rpc(
      'create_event_series',
      { p_event_id: event, p_interval_weeks: 1 },
      other.token,
    );
    expect(foreign.status).toBe(400);
    expect(codeOf(foreign.body)).toBe('NOT_FOUND');
    const guest = await rpc('create_event_series', { p_event_id: event, p_interval_weeks: 1 });
    expect([401, 403]).toContain(guest.status);
    expect(
      (await rest('/event_series?select=*', { token: organizer.token })).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it('makes one series when the same event is turned into a series twice at once', async () => {
    const organizer = await onboardedUser(c, 'Seri Çift');
    const event = await published(organizer.token, 4);

    const results = await runConcurrently(2, async ({ client, barrier }) => {
      await actAs(client, organizer.user.id);
      await barrier();
      const { rows } = await client.query<{ id: string }>(
        'select public.create_event_series($1, 1) as id',
        [event],
      );
      return rows[0]!.id;
    });
    const ids = fulfilled(results);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    const { rows } = await db().query<{ n: string }>(
      'select count(*) as n from public.event_series where organizer_id = $1',
      [organizer.user.id],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('opens a week once when two runs of the job overlap', async () => {
    const organizer = await onboardedUser(c, 'Seri Yarış');
    const event = await published(organizer.token, 12);
    const made = await rpc(
      'create_event_series',
      { p_event_id: event, p_interval_weeks: 1 },
      organizer.token,
    );
    expect(made.status).toBe(200);
    // The next week is beyond two weeks; bring a free start inside the horizon so both runs see it due.
    await db().query(
      `update public.event_series set next_at = now() + interval '8 days' where id = $1`,
      [made.body],
    );

    const results = await runConcurrently(2, async ({ client, barrier }) => {
      await barrier();
      await client.query(`select private.open_series_events()`);
    });
    expect(fulfilled(results)).toHaveLength(2);
    const { rows } = await db().query<{ n: string; starts: string }>(
      'select count(*) as n, count(distinct starts_at) as starts from public.events where series_id = $1',
      [made.body],
    );
    expect(rows[0]).toEqual({ n: '2', starts: '2' });
  });
});
