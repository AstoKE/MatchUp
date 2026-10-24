import type pg from 'pg';
import { db } from './helpers';

/**
 * Concurrency test harness (TESTING §2: the mandatory "last slot" tests in Phase 3 build on this).
 *
 * `runConcurrently` opens N REAL database connections, runs `task` on each inside its own
 * transaction, and releases them all at the same instant via a barrier — so tasks genuinely overlap
 * instead of running one after another.
 */
export interface TaskContext {
  /** The task's own connection (inside BEGIN … COMMIT). */
  client: pg.PoolClient;
  index: number;
  /** Call once all tasks have reached the point where the race must happen. */
  barrier: () => Promise<void>;
}

const MAX_CONCURRENCY = 40; // keep in sync with the pool size in helpers.ts

export async function runConcurrently<T>(
  count: number,
  task: (context: TaskContext) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  // The barrier needs every task to hold a connection at once: more tasks than pool slots would deadlock.
  if (count > MAX_CONCURRENCY)
    throw new Error(`runConcurrently supports at most ${MAX_CONCURRENCY} tasks`);
  const clients = await Promise.all(Array.from({ length: count }, () => db().connect()));

  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = async () => {
    arrived += 1;
    if (arrived === count) release();
    await gate;
  };

  try {
    return await Promise.allSettled(
      clients.map(async (client, index) => {
        await client.query('begin');
        try {
          const result = await task({ client, index, barrier });
          await client.query('commit');
          return result;
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        }
      }),
    );
  } finally {
    for (const client of clients) client.release();
  }
}

export function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
export function rejected(results: PromiseSettledResult<unknown>[]): unknown[] {
  return results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
}
