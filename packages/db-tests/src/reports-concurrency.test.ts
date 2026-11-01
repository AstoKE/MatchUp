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
 * Phase 6 / M2. The daily report limit reads what other calls just wrote, and one report per open target is a unique index:
 * real parallel connections must not pass the first or fail on the second.
 */
let c: Catalog;
beforeAll(async () => {
  c = await catalog();
});
afterAll(async () => {
  await db().query(`delete from public.reports where reporter_id = any($1)`, [reporters]);
  await deleteCreatedUsers();
  await closeDb();
});
const reporters: string[] = [];

async function publicEvent() {
  const organizer = await onboardedUser(c, 'Düzenleyen');
  const made = await rpc(
    'create_event',
    { p_client_request_id: randomUUID(), p_input: eventInput(c), p_publish: true },
    organizer.token,
  );
  expect(made.status).toBe(200);
  return made.body as string;
}

describe('reporting under concurrency', () => {
  it('six simultaneous reports of one thing store one and all get its id', async () => {
    const eventId = await publicEvent();
    const me = await onboardedUser(c, 'Rapor Eden');
    reporters.push(me.user.id);
    const results = await runConcurrently(6, async ({ client, barrier }) => {
      await actAs(client, me.user.id);
      await barrier();
      const { rows } = await client.query<{ id: string }>(
        `select public.report('EVENT', $1, 'SPAM') as id`,
        [eventId],
      );
      return rows[0]!.id;
    });
    expect(rejected(results)).toEqual([]);
    expect(new Set(fulfilled(results)).size).toBe(1);
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.reports where reporter_id = $1`,
      [me.user.id],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('the daily limit holds when reports arrive at once', async () => {
    const targets: string[] = [];
    for (let i = 0; i < 6; i++) targets.push(await publicEvent());
    const me = await onboardedUser(c, 'Çok Rapor');
    reporters.push(me.user.id);
    await db().query(
      `insert into public.reports (reporter_id, target_type, target_id, reason)
       select $1, 'EVENT', gen_random_uuid(), 'SPAM' from generate_series(1, 18)`,
      [me.user.id],
    );
    const results = await runConcurrently(6, async ({ client, index, barrier }) => {
      await actAs(client, me.user.id);
      await barrier();
      await client.query(`select public.report('EVENT', $1, 'SPAM')`, [targets[index]]);
    });
    expect(fulfilled(results)).toHaveLength(2);
    for (const failure of rejected(results)) expect(codeOf(failure)).toBe('RATE_LIMITED');
    const { rows } = await db().query<{ n: number }>(
      `select count(*)::int as n from public.reports where reporter_id = $1`,
      [me.user.id],
    );
    expect(rows[0]!.n).toBe(20);
  });
});
