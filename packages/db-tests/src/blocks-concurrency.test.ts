import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rejected, runConcurrently } from './concurrency';
import {
  actAs,
  catalog,
  codeOf,
  onboardedUser,
  rpc,
  startedEvent,
  type Catalog,
} from './event-fixtures';
import { closeDb, db, deleteCreatedUsers } from './helpers';

/**
 * Phase 6 / M1. A block racing an approval: either order is allowed, but the outcome must be one a sequence could give
 * (approved before the block stays approved, otherwise rejected), and it must never fail with anything but a domain answer.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('blocking under concurrency', () => {
  it('a block racing an approval ends in a state one of the two orders gives', async () => {
    for (let round = 0; round < 4; round++) {
      const { organizer, players, eventId } = await startedEvent(c, 0);
      await db().query(
        `update public.events set starts_at = now() + interval '5 days' where id = $1`,
        [eventId],
      );
      const player = await onboardedUser(c, 'Yarışan');
      expect((await rpc('request_join', { p_event_id: eventId }, player.token)).status).toBe(200);
      const { rows } = await db().query<{ id: string }>(
        `select id from public.event_participations where event_id = $1 and user_id = $2`,
        [eventId, player.user.id],
      );
      const participation = rows[0]!.id;
      expect(players).toHaveLength(0);

      const results = await runConcurrently(2, async ({ client, index, barrier }) => {
        if (index === 0) {
          await actAs(client, organizer.user.id);
          await barrier();
          await client.query('select public.approve_participation($1)', [participation]);
        } else {
          await actAs(client, player.user.id);
          await barrier();
          await client.query('select public.block_user($1)', [organizer.user.id]);
        }
      });
      for (const failure of rejected(results)) {
        expect(['NOT_FOUND', 'INVALID_TRANSITION']).toContain(codeOf(failure));
      }

      const { rows: after } = await db().query<{ status: string; blocked: boolean; count: number }>(
        `select p.status,
                exists (select 1 from public.user_blocks where blocker_id = $2) as blocked,
                (select approved_count from public.events where id = $1) as count
           from public.event_participations p where p.event_id = $1 and p.user_id = $2`,
        [eventId, player.user.id],
      );
      expect(after[0]!.blocked).toBe(true);
      expect(['APPROVED', 'REJECTED']).toContain(after[0]!.status);
      // The counter agrees with the row: organizer plus possibly this player.
      expect(after[0]!.count).toBe(after[0]!.status === 'APPROVED' ? 2 : 1);
    }
  });

  it('two people blocking each other at once both succeed', async () => {
    const a = await onboardedUser(c, 'Ayşe');
    const b = await onboardedUser(c, 'Bora');
    const results = await runConcurrently(2, async ({ client, index, barrier }) => {
      await actAs(client, index === 0 ? a.user.id : b.user.id);
      await barrier();
      await client.query('select public.block_user($1)', [index === 0 ? b.user.id : a.user.id]);
    });
    expect(rejected(results)).toEqual([]);
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.user_blocks where blocker_id = any($1)`,
      [[a.user.id, b.user.id]],
    );
    expect(rows[0]!.n).toBe(2);
  });
});
