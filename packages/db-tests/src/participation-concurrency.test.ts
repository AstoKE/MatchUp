import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import {
  actAs,
  catalog,
  codeOf,
  eventInput,
  onboardedUser,
  rpc,
  type Catalog,
} from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 3 / M4. Capacity under real concurrency (DATABASE §8, TESTING §2): parallel connections released
 * by a barrier, each acting as its own user. Through PostgREST the requests start 15–20 ms apart, more
 * than the race window, so HTTP "parallel" calls would pass even with the lock removed; the harness does not.
 * The invariant checked everywhere: approved_count equals the number of APPROVED rows and never exceeds the
 * capacity (I-1).
 */
let c: Catalog;
let tennis: { sport: string; format: string };
beforeAll(async () => {
  c = await catalog();
  const { rows } = await db().query<{ sport: string; format: string }>(
    `select s.id as sport, f.id as format from public.sports s
       join public.sport_formats f on f.sport_id = s.id and f.slug = 'singles'
      where s.slug = 'tennis'`,
  );
  tennis = rows[0]!;
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

async function publish(token: string, overrides: Record<string, unknown>) {
  const made = await rpc(
    'create_event',
    {
      p_client_request_id: randomUUID(),
      p_input: eventInput(c, {
        starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        ...overrides,
      }),
      p_publish: true,
    },
    token,
  );
  expect(made.status).toBe(200);
  return made.body as string;
}
const tennisOverrides = (extra: Record<string, unknown> = {}) => ({
  sport_id: tennis.sport,
  sport_format_id: tennis.format,
  capacity: 2,
  ...extra,
});

async function expectConsistent(eventId: string) {
  const { rows } = await db().query<{ approved_count: number; real: number; capacity: number }>(
    `select e.approved_count, e.capacity,
            (select count(*)::int from public.event_participations p
              where p.event_id = e.id and p.status = 'APPROVED') as real
       from public.events e where e.id = $1`,
    [eventId],
  );
  const row = rows[0]!;
  expect(row.approved_count).toBe(row.real);
  expect(row.approved_count).toBeLessThanOrEqual(row.capacity);
  return row;
}

async function statuses(eventId: string) {
  const { rows } = await db().query<{ user_id: string; status: string }>(
    'select user_id, status from public.event_participations where event_id = $1',
    [eventId],
  );
  return new Map(rows.map((r) => [r.user_id, r.status]));
}

describe('participation under concurrency', () => {
  it('fourteen simultaneous approvals for eleven free spots: exactly eleven win, the rest are EVENT_FULL', async () => {
    const organizer = await onboardedUser(c, 'Düzenleyen');
    const eventId = await publish(organizer.token, {});
    const players = [];
    for (let i = 0; i < 14; i++) {
      const player = await onboardedUser(c, `Oyuncu ${i}`);
      const status = await rpc('request_join', { p_event_id: eventId }, player.token);
      expect(status.body).toBe('REQUESTED');
      players.push(player);
    }
    const { rows: requests } = await db().query<{ id: string }>(
      `select id from public.event_participations where event_id = $1 and status = 'REQUESTED'`,
      [eventId],
    );
    expect(requests).toHaveLength(14);

    const results = await runConcurrently(14, async ({ client, index, barrier }) => {
      await actAs(client, organizer.user.id);
      await barrier();
      await client.query('select public.approve_participation($1)', [requests[index]!.id]);
    });
    expect(fulfilled(results)).toHaveLength(11);
    expect(new Set(rejected(results).map(codeOf))).toEqual(new Set(['EVENT_FULL']));
    const row = await expectConsistent(eventId);
    expect(row.approved_count).toBe(12);
  });

  it('eight players racing for the single free spot of an auto-approve event: one APPROVED, seven WAITLISTED', async () => {
    const organizer = await onboardedUser(c, 'Düzenleyen');
    const eventId = await publish(organizer.token, tennisOverrides({ auto_approve: true }));
    const players = await Promise.all(Array.from({ length: 8 }, () => onboardedUser(c)));

    const results = await runConcurrently(8, async ({ client, index, barrier }) => {
      await actAs(client, players[index]!.user.id);
      await barrier();
      const { rows } = await client.query<{ s: string }>('select public.request_join($1) as s', [
        eventId,
      ]);
      return rows[0]!.s;
    });
    // No request may fail: the loser of the race is waitlisted, not refused (the lock decides, not the trigger).
    expect(rejected(results)).toEqual([]);
    const outcomes = fulfilled(results);
    expect(outcomes.filter((s) => s === 'APPROVED')).toHaveLength(1);
    expect(outcomes.filter((s) => s === 'WAITLISTED')).toHaveLength(7);
    const row = await expectConsistent(eventId);
    expect(row.approved_count).toBe(2);
  });

  it('a player withdrawing while the organizer promotes the next in line: the outcomes stay consistent', async () => {
    const organizer = await onboardedUser(c, 'Düzenleyen');
    const eventId = await publish(organizer.token, tennisOverrides());
    const first = await onboardedUser(c);
    const second = await onboardedUser(c);
    expect((await rpc('request_join', { p_event_id: eventId }, first.token)).body).toBe(
      'REQUESTED',
    );
    const firstRow = await db().query<{ id: string }>(
      'select id from public.event_participations where event_id = $1 and user_id = $2',
      [eventId, first.user.id],
    );
    expect(
      (
        await rpc(
          'approve_participation',
          { p_participation_id: firstRow.rows[0]!.id },
          organizer.token,
        )
      ).status,
    ).toBe(204);
    expect((await rpc('request_join', { p_event_id: eventId }, second.token)).body).toBe(
      'WAITLISTED',
    );
    const secondRow = await db().query<{ id: string }>(
      'select id from public.event_participations where event_id = $1 and user_id = $2',
      [eventId, second.user.id],
    );

    const results = await runConcurrently(2, async ({ client, index, barrier }) => {
      if (index === 0) {
        await actAs(client, first.user.id);
        await barrier();
        await client.query('select public.cancel_participation($1)', [eventId]);
      } else {
        await actAs(client, organizer.user.id);
        await barrier();
        await client.query('select public.approve_participation($1)', [secondRow.rows[0]!.id]);
      }
    });
    // The withdrawal always works; the promotion works only when it runs after it.
    expect(results[0]!.status).toBe('fulfilled');
    const promoted = results[1]!.status === 'fulfilled';
    if (!promoted) expect(codeOf((results[1] as PromiseRejectedResult).reason)).toBe('EVENT_FULL');
    const after = await statuses(eventId);
    expect(after.get(first.user.id)).toBe('CANCELED');
    expect(after.get(second.user.id)).toBe(promoted ? 'APPROVED' : 'WAITLISTED');
    await expectConsistent(eventId);
  });

  it('ten identical requests from one player create one request and all answer the same', async () => {
    const organizer = await onboardedUser(c, 'Düzenleyen');
    const eventId = await publish(organizer.token, {});
    const player = await onboardedUser(c);
    const results = await runConcurrently(10, async ({ client, barrier }) => {
      await actAs(client, player.user.id);
      await barrier();
      const { rows } = await client.query<{ s: string }>('select public.request_join($1) as s', [
        eventId,
      ]);
      return rows[0]!.s;
    });
    expect(rejected(results)).toEqual([]);
    expect(new Set(fulfilled(results))).toEqual(new Set(['REQUESTED']));
    const { rows } = await db().query<{ n: number }>(
      'select count(*)::int as n from public.event_participations where event_id = $1 and user_id = $2',
      [eventId, player.user.id],
    );
    expect(rows[0]?.n).toBe(1);
  });
});
