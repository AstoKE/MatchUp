import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import { actAs, catalog, codeOf, rpc, startedEvent, type Catalog } from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 5 / M2. Reviews under real concurrency: many reviewers at once, the same pair submitted twice at once, and
 * a deterministic proof of the event lock (a submission waits for a finalization in progress instead of reading a
 * stale "not finalized" event).
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

/** A started event whose players are all marked PRESENT; finalized unless told otherwise. */
async function playedEvent(count: number, finalize = true) {
  const event = await startedEvent(c, count);
  for (const id of event.participations) {
    const marked = await rpc(
      'mark_attendance',
      { p_participation_id: id, p_value: 'PRESENT' },
      event.organizer.token,
    );
    expect(marked.status).toBe(204);
  }
  if (finalize) {
    const done = await rpc(
      'finalize_attendance',
      { p_event_id: event.eventId },
      event.organizer.token,
    );
    expect(done.status).toBe(204);
  }
  return event;
}

async function openAs(userId: string) {
  const client = await db().connect();
  await client.query('begin');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' }),
  ]);
  await client.query('set local role authenticated');
  return client;
}

const stillPending = async (promise: Promise<unknown>, ms = 400) => {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !settled;
};

describe('reviews under concurrency', () => {
  it('eight players reviewing each other at the same moment: every review is stored, nobody is refused', async () => {
    const { players, eventId } = await playedEvent(8);
    const ids = players.map((p) => p.user.id);

    const results = await runConcurrently(8, async ({ client, index, barrier }) => {
      await actAs(client, ids[index]!);
      await barrier();
      const reviews = ids
        .filter((id) => id !== ids[index])
        .map((id) => ({ reviewee_id: id, skill_score: 3 + (index % 3) }));
      const { rows } = await client.query<{ n: number }>(
        'select public.submit_reviews($1, $2::jsonb) as n',
        [eventId, JSON.stringify(reviews)],
      );
      return rows[0]!.n;
    });
    expect(rejected(results)).toEqual([]); // FOR SHARE: submissions do not block or deadlock each other
    expect(fulfilled(results)).toEqual(Array(8).fill(7));
    const { rows } = await db().query<{ n: number }>(
      'select count(*)::int as n from public.skill_reviews where event_id = $1',
      [eventId],
    );
    expect(rows[0]!.n).toBe(56);
  });

  it('the same review submitted twice at once: one is stored, the other is ALREADY_REVIEWED', async () => {
    const { players, eventId } = await playedEvent(3);
    const reviewer = players[0]!.user.id;
    const reviewee = players[1]!.user.id;

    const results = await runConcurrently(2, async ({ client, barrier }) => {
      await actAs(client, reviewer);
      await barrier();
      await client.query('select public.submit_reviews($1, $2::jsonb)', [
        eventId,
        JSON.stringify([{ reviewee_id: reviewee, skill_score: 4 }]),
      ]);
    });
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results).map(codeOf)).toEqual(['ALREADY_REVIEWED']);
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.skill_reviews
        where event_id = $1 and reviewer_id = $2 and reviewee_id = $3`,
      [eventId, reviewer, reviewee],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('a submission waits for a finalization in progress and is then accepted', async () => {
    const { organizer, players, eventId } = await playedEvent(3, false);
    const a = await openAs(organizer.user.id);
    const b = await openAs(players[0]!.user.id);
    try {
      await a.query('select public.finalize_attendance($1)', [eventId]); // holds the event lock, uncommitted
      const submit = b.query('select public.submit_reviews($1, $2::jsonb) as n', [
        eventId,
        JSON.stringify([{ reviewee_id: players[1]!.user.id, skill_score: 5 }]),
      ]);
      const outcome = submit.then(
        (r) => `stored ${(r.rows[0] as { n: number }).n}`,
        (error: unknown) => codeOf(error),
      );
      // Without the lock it would answer at once with REVIEW_NOT_ELIGIBLE (it would still see an unfinalized event).
      expect(await stillPending(outcome)).toBe(true);
      await a.query('commit');
      expect(await outcome).toBe('stored 1');
      await b.query('commit');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      a.release();
      b.release();
    }
  });
});
