import { randomUUID } from 'node:crypto';
import {
  RATING_CONSTANTS,
  isLateCancel,
  istanbulDay,
  istanbulWeek,
  ratingConfigRows,
  reliabilityStats,
  skillStats,
  type SkillReview,
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

describe('skill math', () => {
  const at = new Date('2026-11-01T12:00:00Z');
  const sql = async (prior: number, sport: string, reviews: readonly SkillReview[]) => {
    const { rows } = await db().query<{
      rating: number;
      confidence: number;
      sample_events: number;
    }>(
      `select rating, confidence, sample_events from private.skill_stats(
         $1::float8, $2::uuid, $3::uuid[], $4::uuid[], $5::uuid[], $6::float8[], $7::timestamptz[], $8::timestamptz)`,
      [
        prior,
        sport,
        reviews.map((r) => r.eventId),
        reviews.map((r) => r.sportId),
        reviews.map((r) => r.reviewerId),
        reviews.map((r) => r.score),
        reviews.map((r) => r.startsAt),
        at,
      ],
    );
    return rows[0]!;
  };

  it('the SQL function equals the TypeScript reference on 300 random review histories', async () => {
    const next = random(315);
    const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
    const sports = [randomUUID(), randomUUID()];
    const pool = Array.from({ length: 9 }, () => randomUUID());
    let trimmed = 0;
    let decayed = 0;
    for (let trial = 0; trial < 300; trial += 1) {
      const reviews: SkillReview[] = [];
      const eventCount = Math.floor(next() * 9);
      for (let e = 0; e < eventCount; e += 1) {
        const eventId = randomUUID();
        const sportId = pick(sports);
        // Often close together, so the pair window matters; sometimes the same instant.
        const startsAt = new Date(at.getTime() - Math.floor(next() * 200) * 86_400_000);
        const reviewers = pool.filter(() => next() < 0.5);
        if (reviewers.length >= 5) trimmed += 1;
        for (const reviewerId of reviewers) {
          // Few distinct scores, so ties at the trimming edge are common.
          reviews.push({ eventId, sportId, reviewerId, score: pick([1, 3, 3, 5]), startsAt });
        }
      }
      if (new Set(reviews.map((r) => r.reviewerId)).size < reviews.length) decayed += 1;
      const prior = pick([1, 2, 2.5, 3, 4.5, 5]);
      const row = await sql(prior, sports[0]!, reviews);
      const reference = skillStats({ prior, sportId: sports[0]!, reviews, at });
      expect(row.sample_events).toBe(reference.sampleEvents);
      expect(row.rating).toBeCloseTo(reference.rating, 10);
      expect(row.confidence).toBeCloseTo(reference.confidence, 10);
    }
    // The random input really exercises the branches that matter.
    expect(trimmed).toBeGreaterThan(50);
    expect(decayed).toBeGreaterThan(50);
  });

  it('matches the worked examples of the spec', async () => {
    const sport = randomUUID();
    const reviewers = Array.from({ length: 15 }, () => randomUUID());
    const oneEvent = (index: number): SkillReview[] => {
      const eventId = randomUUID();
      return reviewers
        .slice(index * 3, index * 3 + 3)
        .map((reviewerId) => ({ eventId, sportId: sport, reviewerId, score: 4, startsAt: at }));
    };
    const one = await sql(3, sport, oneEvent(0));
    expect(one.rating).toBeCloseTo(10 / 3, 10);
    expect(one.confidence).toBeCloseTo(1 / 3, 10);
    const five = await sql(3, sport, [0, 1, 2, 3, 4].flatMap(oneEvent));
    expect(five.rating).toBeCloseTo(26 / 7, 10);
    expect(five.confidence).toBeCloseTo(5 / 7, 10);
    const none = await sql(2.5, sport, []);
    expect(none).toEqual({ rating: 2.5, confidence: 0, sample_events: 0 });
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
