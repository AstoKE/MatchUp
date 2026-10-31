import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import {
  actAs,
  catalog,
  eventInput,
  onboardedUser,
  rpc,
  startedEvent,
  type Catalog,
} from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 5 / M3a. The daily XP cap reads what other events already paid, so two events finalized at the same moment
 * for the same players must not both pass it: finalization takes a per-user advisory lock, in id order.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

async function ledger(userId: string) {
  const { rows } = await db().query<{
    attended: number;
    first: number;
    total: number;
    cache: number | null;
    signals: number;
  }>(
    `select (select count(*)::int from public.xp_transactions where user_id = $1 and reason_code = 'ATTENDED_EVENT') as attended,
            (select count(*)::int from public.xp_transactions where user_id = $1 and reason_code = 'FIRST_IN_SPORT') as first,
            (select coalesce(sum(amount), 0)::int from public.xp_transactions where user_id = $1) as total,
            (select xp_total from public.user_progress where user_id = $1) as cache,
            (select count(*)::int from public.reliability_events where user_id = $1 and voided_at is null) as signals`,
    [userId],
  );
  return rows[0]!;
}

describe('rating under concurrency', () => {
  it('four events of the same day finalized at once pay a shared player at most twice (the daily cap)', async () => {
    const players = [await onboardedUser(c, 'Oyuncu A'), await onboardedUser(c, 'Oyuncu B')];
    const events: {
      organizer: Awaited<ReturnType<typeof onboardedUser>>;
      eventId: string;
      participations: string[];
    }[] = [];
    for (let i = 0; i < 4; i++) {
      const organizer = await onboardedUser(c, `Düzenleyen ${i}`);
      const made = await rpc(
        'create_event',
        {
          p_client_request_id: randomUUID(),
          p_input: eventInput(c, {
            starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
            capacity: 12,
          }),
          p_publish: true,
        },
        organizer.token,
      );
      expect(made.status).toBe(200);
      const eventId = made.body as string;
      for (const player of players) {
        expect((await rpc('request_join', { p_event_id: eventId }, player.token)).body).toBe(
          'REQUESTED',
        );
      }
      const { rows } = await db().query<{ id: string; user_id: string }>(
        `select id, user_id from public.event_participations where event_id = $1 and not is_organizer`,
        [eventId],
      );
      for (const row of rows) {
        expect(
          (await rpc('approve_participation', { p_participation_id: row.id }, organizer.token))
            .status,
        ).toBe(204);
      }
      events.push({ organizer, eventId, participations: rows.map((r) => r.id) });
    }
    // The same instant for all four: one Istanbul day.
    await db().query(
      `update public.events set starts_at = now() - interval '1 hour' where id = any($1)`,
      [events.map((e) => e.eventId)],
    );
    for (const event of events) {
      for (const id of event.participations) {
        const marked = await rpc(
          'mark_attendance',
          { p_participation_id: id, p_value: 'PRESENT' },
          event.organizer.token,
        );
        expect(marked.status).toBe(204);
      }
    }

    const results = await runConcurrently(4, async ({ client, index, barrier }) => {
      await actAs(client, events[index]!.organizer.user.id);
      await barrier();
      await client.query('select public.finalize_attendance($1)', [events[index]!.eventId]);
    });
    expect(rejected(results)).toEqual([]);
    expect(fulfilled(results)).toHaveLength(4);

    for (const player of players) {
      const l = await ledger(player.user.id);
      expect(l.attended).toBe(2); // the cap, not four
      expect(l.first).toBe(1); // once per sport
      expect(l.signals).toBe(4); // every attendance still counts for reliability
      expect(l.total).toBe(2 * 50 + 30);
      expect(l.cache).toBe(l.total); // the cache agrees with the ledger
    }
  });

  it('six simultaneous finalizations of one event: signals and XP are created once', async () => {
    const { organizer, players, eventId, participations } = await startedEvent(c, 3);
    for (const id of participations) {
      expect(
        (
          await rpc(
            'mark_attendance',
            { p_participation_id: id, p_value: 'PRESENT' },
            organizer.token,
          )
        ).status,
      ).toBe(204);
    }
    const results = await runConcurrently(6, async ({ client, barrier }) => {
      await actAs(client, organizer.user.id);
      await barrier();
      await client.query('select public.finalize_attendance($1)', [eventId]);
    });
    expect(rejected(results)).toEqual([]);

    const { rows } = await db().query<{ signals: number; xp_rows: number; dupes: number }>(
      `select (select count(*)::int from public.reliability_events where event_id = $1) as signals,
              (select count(*)::int from public.xp_transactions where source_id = $1) as xp_rows,
              (select count(*)::int from (select dedupe_key from public.xp_transactions where source_id = $1
                                          group by dedupe_key having count(*) > 1) d) as dupes`,
      [eventId],
    );
    expect(rows[0]!.signals).toBe(players.length); // one per player, none for the organizer
    // 3 players + the organizer who plays earn attendance XP; the organizer's account is minutes old, so no ORGANIZED_EVENT.
    expect(rows[0]!.xp_rows).toBe(players.length + 1);
    expect(rows[0]!.dupes).toBe(0);
  });
});

describe('closing review windows under concurrency (M3b)', () => {
  const closeAt = `now() + interval '73 hours'`;

  /** A finalized event whose first three players all reviewed the fourth, with fair play. */
  async function reviewedEvent() {
    const { organizer, players, eventId, participations } = await startedEvent(c, 4);
    for (const id of participations) {
      const marked = await rpc(
        'mark_attendance',
        { p_participation_id: id, p_value: 'PRESENT' },
        organizer.token,
      );
      expect(marked.status).toBe(204);
    }
    expect(
      (await rpc('complete_event', { p_event_id: eventId }, organizer.token)).status,
    ).toBeLessThan(300);
    expect(
      (await rpc('finalize_attendance', { p_event_id: eventId }, organizer.token)).status,
    ).toBeLessThan(300);
    for (const reviewer of players.slice(0, 3)) {
      const done = await rpc(
        'submit_reviews',
        {
          p_event_id: eventId,
          p_reviews: [{ reviewee_id: players[3]!.user.id, skill_score: 4, fair_play: true }],
        },
        reviewer.token,
      );
      expect(done.status).toBe(200);
    }
    return { organizer, players, eventId };
  }

  it('six simultaneous runs pay once and leave the cache equal to the ledger', async () => {
    const { players, eventId } = await reviewedEvent();
    const results = await runConcurrently(6, async ({ client, barrier }) => {
      await barrier();
      await client.query(`select private.close_review_windows(${closeAt})`);
    });
    expect(rejected(results)).toEqual([]);

    const { rows } = await db().query<{ xp_rows: number; markers: number; rating: number }>(
      `select (select count(*)::int from public.xp_transactions
                where source_id = $1 and reason_code in ('REVIEWS_SUBMITTED', 'FAIR_PLAY_RECEIVED')) as xp_rows,
              (select count(*)::int from private.closed_review_windows where event_id = $1) as markers,
              (select rating::float from public.user_sport_ratings where user_id = $2) as rating`,
      [eventId, players[3]!.user.id],
    );
    expect(rows[0]!.xp_rows).toBe(4); // three reviewers + one fair play
    expect(rows[0]!.markers).toBe(1);
    // onboardedUser's self-assessment is 3: one event, three reviewers giving 4.
    expect(rows[0]!.rating).toBe(3.33);
    for (const player of players) {
      const l = await ledger(player.user.id);
      expect(l.cache).toBe(l.total);
    }
  });

  it('skips an event while a review submission holds it, and closes it on the next run', async () => {
    const { eventId } = await reviewedEvent();
    const holder = await db().connect();
    try {
      await holder.query('begin');
      // What submit_reviews takes on the event while it is writing.
      await holder.query('select 1 from public.events where id = $1 for share', [eventId]);
      await db().query(`select private.close_review_windows(${closeAt})`);
      const open = await db().query(
        'select 1 from private.closed_review_windows where event_id = $1',
        [eventId],
      );
      expect(open.rowCount).toBe(0);
      await holder.query('commit');
    } finally {
      holder.release();
    }
    await db().query(`select private.close_review_windows(${closeAt})`);
    const closed = await db().query(
      'select 1 from private.closed_review_windows where event_id = $1',
      [eventId],
    );
    expect(closed.rowCount).toBe(1);
  });

  it('closing and finalizing at once with shared players neither deadlocks nor loses XP', async () => {
    const a = await reviewedEvent();
    const b = await reviewedEvent();
    // A third event with the players of A and B, ready to be finalized as the windows close.
    const organizer = await onboardedUser(c, 'Düzenleyen');
    const made = await rpc(
      'create_event',
      {
        p_client_request_id: randomUUID(),
        p_input: eventInput(c, {
          starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        }),
        p_publish: true,
      },
      organizer.token,
    );
    const eventId = made.body as string;
    const shared = [...b.players.slice(0, 2), ...a.players.slice(0, 2)];
    for (const player of shared) {
      await rpc('request_join', { p_event_id: eventId }, player.token);
    }
    const { rows } = await db().query<{ id: string }>(
      `select id from public.event_participations where event_id = $1 and not is_organizer`,
      [eventId],
    );
    for (const row of rows) {
      await rpc('approve_participation', { p_participation_id: row.id }, organizer.token);
    }
    await db().query(
      `update public.events set starts_at = now() - interval '1 hour' where id = $1`,
      [eventId],
    );
    for (const row of rows) {
      await rpc(
        'mark_attendance',
        { p_participation_id: row.id, p_value: 'PRESENT' },
        organizer.token,
      );
    }

    const results = await runConcurrently(3, async ({ client, index, barrier }) => {
      if (index === 0) {
        await actAs(client, organizer.user.id);
        await barrier();
        await client.query('select public.finalize_attendance($1)', [eventId]);
      } else {
        await barrier();
        await client.query(`select private.close_review_windows(${closeAt})`);
      }
    });
    expect(rejected(results)).toEqual([]);

    for (const player of shared) {
      const l = await ledger(player.user.id);
      expect(l.cache).toBe(l.total);
    }
    const { rows: closed } = await db().query<{ n: number }>(
      'select count(*)::int as n from private.closed_review_windows where event_id = any($1)',
      [[a.eventId, b.eventId]],
    );
    expect(closed[0]!.n).toBe(2);
  });
});
