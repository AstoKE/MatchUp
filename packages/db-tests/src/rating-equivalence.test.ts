import {
  RATING_CONSTANTS,
  isLateCancel,
  istanbulDay,
  istanbulWeek,
  ratingConfigRows,
  reliabilityStats,
} from '@matchup/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from './helpers';

/**
 * ADR-0004: the SQL rating code is authoritative, the TypeScript reference is its executable specification, and a
 * test compares them. Seeded random inputs (the same every run) so a failure can be reproduced.
 */
afterAll(async () => {
  await closeDb();
});

/** mulberry32: a tiny seeded generator. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('constants', () => {
  it('private.rating_config holds exactly the TypeScript constants (no drift)', async () => {
    const { rows } = await db().query<{ key: string; value: number }>(
      'select key, value from private.rating_config order by key',
    );
    const expected = ratingConfigRows().sort(([a], [b]) => (a < b ? -1 : 1));
    expect(rows.map((r) => [r.key, r.value])).toEqual(expected);
  });
});

describe('reliability math', () => {
  const fill = (n: number, value: number): number[] => Array.from({ length: n }, () => value);
  it('the SQL function equals the TypeScript reference on 400 random histories', async () => {
    const next = random(20261031);
    for (let trial = 0; trial < 400; trial += 1) {
      const n = Math.floor(next() * 41); // 0..40 signals
      const values = Array.from({ length: n }, () => [0, 0.5, 1][Math.floor(next() * 3)]!);
      const ages = Array.from({ length: n }, () => next() * 900);
      const { rows } = await db().query<{ score: number; confidence: number; samples: number }>(
        'select score, confidence, samples from private.reliability_score($1::float8[], $2::float8[])',
        [values, ages],
      );
      const reference = reliabilityStats(values.map((value, i) => ({ value, ageDays: ages[i]! })));
      expect(rows[0]!.samples).toBe(reference.samples);
      expect(rows[0]!.score).toBeCloseTo(reference.score, 12);
      expect(rows[0]!.confidence).toBeCloseTo(reference.confidence, 12);
    }
  });

  it('matches the worked examples of the spec', async () => {
    const score = async (values: number[]) => {
      const { rows } = await db().query<{ score: number }>(
        'select score from private.reliability_score($1::float8[], $2::float8[])',
        [values, values.map(() => 0)],
      );
      return rows[0]!.score;
    };
    expect(await score(fill(10, 1))).toBeCloseTo(0.976923, 5);
    expect(await score([...fill(9, 1), 0])).toBeCloseTo(0.9, 10);
    expect(await score([1, 1, 0])).toBeCloseTo(0.783333, 5);
    expect(await score([0, 0, 0])).toBeCloseTo(0.45, 10);
    expect(await score([])).toBeCloseTo(0.9, 10);
  });
});

describe('late cancellation', () => {
  it('the SQL rule equals the TypeScript reference on 500 random cancellations, boundaries included', async () => {
    const next = random(77);
    const start = Date.UTC(2026, 10, 10, 18);
    const hour = 3_600_000;
    for (let trial = 0; trial < 500; trial += 1) {
      const sinceApproval = trial % 5 === 0 ? 3 * hour : Math.floor(next() * 200 * hour) + hour;
      const approved = new Date(start - sinceApproval);
      // Half the cases sit exactly on the window edge, where "after" versus "at" matters.
      const edge = Math.min(12 * hour, sinceApproval / 2);
      const canceled = new Date(
        trial % 2 === 0
          ? start - edge + [-1000, 0, 1000][trial % 3]!
          : start - Math.floor(next() * 30 * hour),
      );
      const { rows } = await db().query<{ late: boolean }>(
        'select private.is_late_cancel($1, $2, $3) as late',
        [new Date(start), approved, canceled],
      );
      expect(rows[0]!.late).toBe(
        isLateCancel({ startsAt: new Date(start), approvedAt: approved, canceledAt: canceled }),
      );
    }
  });
});

describe('Istanbul calendar for the caps', () => {
  it('"same day" and "same week" agree between SQL and TypeScript on 500 random pairs', async () => {
    const next = random(4242);
    const t0 = Date.UTC(2026, 0, 1);
    for (let trial = 0; trial < 500; trial += 1) {
      const a = new Date(t0 + Math.floor(next() * 365 * 86_400_000));
      // Half the pairs are close, so day and week boundaries (21:00 UTC, Sunday to Monday) are crossed often.
      const b = new Date(
        trial % 2 === 0
          ? a.getTime() + Math.floor((next() - 0.5) * 3 * 86_400_000)
          : t0 + Math.floor(next() * 365 * 86_400_000),
      );
      const { rows } = await db().query<{ day: boolean; week: boolean }>(
        `select ((($1::timestamptz) at time zone 'Europe/Istanbul')::date = (($2::timestamptz) at time zone 'Europe/Istanbul')::date) as day,
                (date_trunc('week', ($1::timestamptz) at time zone 'Europe/Istanbul')
                   = date_trunc('week', ($2::timestamptz) at time zone 'Europe/Istanbul')) as week`,
        [a, b],
      );
      expect(rows[0]!.day).toBe(istanbulDay(a) === istanbulDay(b));
      expect(rows[0]!.week).toBe(istanbulWeek(a) === istanbulWeek(b));
    }
  });

  it('XP amounts in the ledger code are the constants (50, 40, 30)', () => {
    expect([
      RATING_CONSTANTS.xp.attendedEvent,
      RATING_CONSTANTS.xp.organizedEvent,
      RATING_CONSTANTS.xp.firstInSport,
    ]).toEqual([50, 40, 30]);
  });
});
