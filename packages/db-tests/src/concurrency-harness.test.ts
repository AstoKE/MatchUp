import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fulfilled, rejected, runConcurrently } from './concurrency';
import { closeDb, db } from './helpers';

/**
 * Proof that the harness can DETECT concurrency bugs and confirm their fixes. Phase 3 relies on this
 * for the mandatory capacity tests (never exceed capacity under simultaneous approvals).
 * Uses a throw-away schema; nothing here touches application tables.
 */
const N = 12;

beforeAll(async () => {
  await db().query('drop schema if exists harness_test cascade');
  await db().query('create schema harness_test');
  await db().query(`
    create table harness_test.counter (id int primary key, n int not null);
    create table harness_test.slots (id int primary key);
    create table harness_test.events (id int primary key, capacity int not null);
    create table harness_test.participations (event_id int not null, user_no int not null, primary key (event_id, user_no));
  `);
});
afterAll(async () => {
  await db().query('drop schema if exists harness_test cascade');
  await closeDb();
});
beforeEach(async () => {
  await db().query(
    'truncate harness_test.counter, harness_test.slots, harness_test.events, harness_test.participations',
  );
  await db().query('insert into harness_test.counter values (1, 0)');
});

const finalCounter = async () =>
  (await db().query<{ n: number }>('select n from harness_test.counter where id = 1')).rows[0]?.n;

describe('lost-update detection', () => {
  it('the NAIVE read-modify-write loses updates, and the harness sees it', async () => {
    const results = await runConcurrently(N, async ({ client, barrier }) => {
      const { rows } = await client.query<{ n: number }>(
        'select n from harness_test.counter where id = 1',
      );
      await barrier(); // everyone has read the same value before anyone writes
      await client.query('update harness_test.counter set n = $1 where id = 1', [
        (rows[0]?.n ?? 0) + 1,
      ]);
    });
    expect(rejected(results)).toHaveLength(0);
    expect(await finalCounter()).toBe(1); // N increments requested, 1 survived
    expect(await finalCounter()).toBeLessThan(N);
  });

  it('SELECT … FOR UPDATE serializes the same logic: no update is lost', async () => {
    const results = await runConcurrently(N, async ({ client, barrier }) => {
      await barrier(); // race for the lock, not for the read
      const { rows } = await client.query<{ n: number }>(
        'select n from harness_test.counter where id = 1 for update',
      );
      await client.query('update harness_test.counter set n = $1 where id = 1', [
        (rows[0]?.n ?? 0) + 1,
      ]);
    });
    expect(rejected(results)).toHaveLength(0);
    expect(await finalCounter()).toBe(N);
  });

  it('a single atomic UPDATE is also safe', async () => {
    await runConcurrently(N, async ({ client, barrier }) => {
      await barrier();
      await client.query('update harness_test.counter set n = n + 1 where id = 1');
    });
    expect(await finalCounter()).toBe(N);
  });
});

describe('unique constraints decide a race', () => {
  it('exactly one of N simultaneous inserts of the same key wins; the rest get 23505', async () => {
    const results = await runConcurrently(N, async ({ client, barrier }) => {
      await barrier();
      await client.query('insert into harness_test.slots (id) values (1)');
    });
    expect(fulfilled(results)).toHaveLength(1);
    const errors = rejected(results) as { code?: string }[];
    expect(errors).toHaveLength(N - 1);
    expect(errors.every((e) => e.code === '23505')).toBe(true);
  });
});

describe('capacity pattern (miniature of the Phase 3 "last slot" invariant)', () => {
  const CAPACITY = 3;
  const seatedCount = async () =>
    Number(
      (await db().query<{ c: string }>('select count(*) c from harness_test.participations'))
        .rows[0]?.c,
    );

  beforeEach(async () => {
    await db().query('insert into harness_test.events values (1, $1)', [CAPACITY]);
  });

  it('check-then-insert WITHOUT a lock oversells the event (bug the real tests must catch)', async () => {
    await runConcurrently(N, async ({ client, index, barrier }) => {
      const { rows } = await client.query<{ c: string }>(
        'select count(*) c from harness_test.participations where event_id = 1',
      );
      await barrier(); // all see "capacity not reached yet"
      if (Number(rows[0]?.c) < CAPACITY) {
        await client.query('insert into harness_test.participations values (1, $1)', [index]);
      }
    });
    expect(await seatedCount()).toBeGreaterThan(CAPACITY); // oversold
  });

  it('locking the event row first keeps the count at capacity under the same stampede', async () => {
    await runConcurrently(N, async ({ client, index, barrier }) => {
      await barrier();
      await client.query('select 1 from harness_test.events where id = 1 for update');
      const { rows } = await client.query<{ c: string }>(
        'select count(*) c from harness_test.participations where event_id = 1',
      );
      if (Number(rows[0]?.c) < CAPACITY) {
        await client.query('insert into harness_test.participations values (1, $1)', [index]);
      }
    });
    expect(await seatedCount()).toBe(CAPACITY);
  });

  it('repeats reliably (flake detection): 20 rounds never exceed capacity with the lock', async () => {
    for (let round = 0; round < 20; round += 1) {
      await db().query('truncate harness_test.participations');
      await runConcurrently(N, async ({ client, index, barrier }) => {
        await barrier();
        await client.query('select 1 from harness_test.events where id = 1 for update');
        const { rows } = await client.query<{ c: string }>(
          'select count(*) c from harness_test.participations where event_id = 1',
        );
        if (Number(rows[0]?.c) < CAPACITY) {
          await client.query('insert into harness_test.participations values (1, $1)', [index]);
        }
      });
      expect(await seatedCount()).toBe(CAPACITY);
    }
  });
});
