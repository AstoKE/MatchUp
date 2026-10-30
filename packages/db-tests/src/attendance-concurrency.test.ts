import { randomUUID } from 'node:crypto';
import type pg from 'pg';
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
 * Phase 5 / M1. Attendance under real concurrency: parallel connections released by a barrier. The lock is also
 * proven deterministically: one connection holds the event row lock, a second must WAIT (a removed lock would let
 * it through at once), then be refused once the first commits.
 */
let c: Catalog;
const adminIds: string[] = [];
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  if (adminIds.length > 0)
    await db().query('delete from public.platform_admins where user_id = any($1)', [adminIds]);
  await deleteCreatedUsers();
  await closeDb();
});

/** A started event with `count` approved players (the owner role moves its start into the past). */
async function startedEvent(count: number) {
  const organizer = await onboardedUser(c, 'Düzenleyen');
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
  const players = [];
  for (let i = 0; i < count; i++) {
    const player = await onboardedUser(c, `Oyuncu ${i}`);
    expect((await rpc('request_join', { p_event_id: eventId }, player.token)).body).toBe(
      'REQUESTED',
    );
    players.push(player);
  }
  const { rows } = await db().query<{ id: string; user_id: string }>(
    `select id, user_id from public.event_participations
      where event_id = $1 and not is_organizer order by requested_at`,
    [eventId],
  );
  for (const row of rows) {
    const approved = await rpc(
      'approve_participation',
      { p_participation_id: row.id },
      organizer.token,
    );
    expect(approved.status).toBe(204);
  }
  await db().query(`update public.events set starts_at = now() - interval '1 hour' where id = $1`, [
    eventId,
  ]);
  return { organizer, players, eventId, participations: rows.map((r) => r.id) };
}

async function row(eventId: string) {
  const { rows } = await db().query<{
    status: string;
    finalized: string | null;
    window_ok: boolean | null;
  }>(
    `select status, attendance_finalized_at::text as finalized,
            (review_window_closes_at = attendance_finalized_at + interval '72 hours') as window_ok
       from public.events where id = $1`,
    [eventId],
  );
  return rows[0]!;
}

/** Opens a transaction on its own connection acting as the user; the caller must release it. */
async function openAs(userId: string, aal = 'aal1') {
  const client = await db().connect();
  await client.query('begin');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal }),
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

describe('attendance under concurrency', () => {
  it('six marks racing six finalizations: finalized once, every mark is applied or refused, never half-applied', async () => {
    const { organizer, participations, eventId } = await startedEvent(6);

    const results = await runConcurrently(12, async ({ client, index, barrier }) => {
      await actAs(client, organizer.user.id);
      await barrier();
      if (index < 6) {
        await client.query(`select public.mark_attendance($1, 'PRESENT')`, [
          participations[index]!,
        ]);
      } else {
        await client.query('select public.finalize_attendance($1)', [eventId]);
      }
    });

    const marks = results.slice(0, 6);
    const finals = results.slice(6);
    expect(rejected(finals)).toEqual([]); // finalizing is idempotent: nobody fails
    expect(new Set(rejected(marks).map(codeOf))).toEqual(
      rejected(marks).length > 0 ? new Set(['INVALID_TRANSITION']) : new Set(),
    );

    const event = await row(eventId);
    expect(event.status).toBe('COMPLETED');
    expect(event.finalized).not.toBeNull();
    expect(event.window_ok).toBe(true);
    const { rows } = await db().query<{ id: string; attendance: string }>(
      `select id, attendance from public.event_participations where id = any($1)`,
      [participations],
    );
    const present = new Set(rows.filter((r) => r.attendance === 'PRESENT').map((r) => r.id));
    marks.forEach((result, i) => {
      // A fulfilled mark landed before the freeze; a refused one left the row untouched (neutral).
      expect(present.has(participations[i]!)).toBe(result.status === 'fulfilled');
    });
  });

  it('a second finalization waits for the first (the event lock), then finds it done', async () => {
    const { organizer, eventId } = await startedEvent(2);
    const a = await openAs(organizer.user.id);
    const b = await openAs(organizer.user.id);
    try {
      await a.query('select public.finalize_attendance($1)', [eventId]);
      const second = b.query('select public.finalize_attendance($1)', [eventId]);
      expect(await stillPending(second)).toBe(true); // blocked behind the first transaction
      await a.query('commit');
      await second; // idempotent: no error
      await b.query('commit');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      a.release();
      b.release();
    }
    expect((await row(eventId)).finalized).not.toBeNull();
  });

  it('a mark waits for a finalization in progress and is then refused', async () => {
    const { organizer, participations, eventId } = await startedEvent(2);
    const a = await openAs(organizer.user.id);
    const b = await openAs(organizer.user.id);
    try {
      await a.query('select public.finalize_attendance($1)', [eventId]);
      const mark = b.query(`select public.mark_attendance($1, 'PRESENT')`, [participations[0]!]);
      const outcome = mark.then(
        () => 'applied',
        (error: unknown) => codeOf(error),
      );
      expect(await stillPending(outcome)).toBe(true); // a removed lock would let this through at once
      await a.query('commit');
      expect(await outcome).toBe('INVALID_TRANSITION');
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      a.release();
      b.release();
    }
    const { rows } = await db().query<{ attendance: string }>(
      'select attendance from public.event_participations where id = $1',
      [participations[0]!],
    );
    expect(rows[0]!.attendance).toBe('NOT_CONFIRMED');
  });

  it('the sweeps skip an event another transaction is working on instead of waiting for it', async () => {
    const { organizer, eventId } = await startedEvent(1);
    // Make it due: ended and still PUBLISHED.
    await db().query(
      `update public.events set starts_at = now() - interval '3 hours' where id = $1`,
      [eventId],
    );
    const holder = await openAs(organizer.user.id);
    try {
      await holder.query('select public.finalize_attendance($1)', [eventId]); // holds the row lock
      const started = Date.now();
      const done = await db().query<{ n: number }>('select private.complete_due_events() as n');
      expect(Date.now() - started).toBeLessThan(5000); // it did not queue behind the lock
      expect(done.rows[0]!.n).toBeGreaterThanOrEqual(0);
      expect((await row(eventId)).status).toBe('PUBLISHED'); // untouched while locked
      await holder.query('commit');
    } finally {
      await holder.query('rollback').catch(() => undefined);
      holder.release();
    }
    expect((await row(eventId)).status).toBe('COMPLETED');
  });

  it('two admins resolving the same dispute: one wins, the other is refused, one audit row', async () => {
    const { organizer, players, eventId, participations } = await startedEvent(2);
    await rpc(
      'mark_attendance',
      { p_participation_id: participations[0], p_value: 'ABSENT' },
      organizer.token,
    );
    expect(
      (await rpc('finalize_attendance', { p_event_id: eventId }, organizer.token)).status,
    ).toBe(204);
    const disputed = await rpc(
      'dispute_attendance',
      { p_participation_id: participations[0], p_reason: 'Oradaydım' },
      players[0]!.token,
    );
    expect(disputed.status).toBe(204);

    const admins = [await onboardedUser(c, 'Yönetici 1'), await onboardedUser(c, 'Yönetici 2')];
    for (const admin of admins) {
      adminIds.push(admin.user.id);
      await db().query('insert into public.platform_admins (user_id) values ($1)', [admin.user.id]);
    }
    const results = await runConcurrently(2, async ({ client, index, barrier }) => {
      await actAsAal2(client, admins[index]!.user.id);
      await barrier();
      await client.query(`select public.admin_resolve_attendance_dispute($1, 'PRESENT')`, [
        participations[0]!,
      ]);
    });
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results).map(codeOf)).toEqual(['INVALID_TRANSITION']);
    const audit = await db().query<{ n: number }>(
      `select count(*)::int as n from private.audit_logs
        where action = 'ATTENDANCE_DISPUTE_RESOLVED' and target_id = $1`,
      [participations[0]!],
    );
    expect(audit.rows[0]!.n).toBe(1);
    const { rows } = await db().query<{ attendance: string }>(
      'select attendance from public.event_participations where id = $1',
      [participations[0]!],
    );
    expect(rows[0]!.attendance).toBe('PRESENT');
  });
});

async function actAsAal2(client: pg.PoolClient, userId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal2' }),
  ]);
  await client.query('set local role authenticated');
}
