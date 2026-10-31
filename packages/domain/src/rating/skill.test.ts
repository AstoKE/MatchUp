import { describe, expect, it } from 'vitest';
import { fairPlayXpAllowed, skillStats, type SkillReview } from '.';

const NOW = new Date('2026-11-01T12:00:00Z');
const DAY = 86_400_000;
const SPORT = 'football';

const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

/** One event's reviews, one per score, from reviewers r0, r1, … unless named. */
function event(
  id: string,
  scores: readonly number[],
  ago = 0,
  reviewers: readonly string[] = scores.map((_, i) => `r${i}`),
  sportId = SPORT,
): SkillReview[] {
  return scores.map((score, i) => ({
    eventId: id,
    sportId,
    reviewerId: reviewers[i]!,
    score,
    startsAt: daysAgo(ago),
  }));
}
const stats = (reviews: readonly SkillReview[], prior = 3) =>
  skillStats({ prior, sportId: SPORT, reviews, at: NOW });

describe('skill: the worked examples of RATING_SYSTEM §3.4', () => {
  it('one event, three reviewers giving 4', () => {
    const s = stats(event('e1', [4, 4, 4]));
    expect(s.rating).toBeCloseTo(10 / 3, 10);
    expect(s.confidence).toBeCloseTo(1 / 3, 10);
    expect(s.sampleEvents).toBe(1);
  });

  it('five such events, no time decay', () => {
    // Different reviewers per event: the example is about the prior, not repeated pairs.
    const reviews = [0, 1, 2, 3, 4].flatMap((n) =>
      event(`e${n}`, [4, 4, 4], 0, [`a${n}`, `b${n}`, `c${n}`]),
    );
    const s = stats(reviews);
    expect(s.rating).toBeCloseTo(26 / 7, 10);
    expect(s.confidence).toBeCloseTo(5 / 7, 10);
  });
});

describe('skill: properties', () => {
  it('no reviews: the prior stands, with no confidence', () => {
    expect(stats([], 2.5)).toEqual({ rating: 2.5, confidence: 0, sampleEvents: 0 });
  });

  it('one reviewer alone cannot move the rating', () => {
    expect(stats(event('e1', [5]), 2).rating).toBe(2);
  });

  it('two reviewers count at two thirds', () => {
    const s = stats(event('e1', [5, 5]));
    expect(s.rating).toBeCloseTo((6 + (2 / 3) * 5) / (2 + 2 / 3), 10);
  });

  it('stays within the scale at the extremes', () => {
    const many = Array.from({ length: 40 }, (_, n) =>
      event(`e${n}`, [5, 5, 5], n, [`a${n}`, `b${n}`, `c${n}`]),
    ).flat();
    expect(stats(many, 5).rating).toBeLessThanOrEqual(5);
    const low = many.map((r) => ({ ...r, score: 1 }));
    expect(stats(low, 1).rating).toBeGreaterThanOrEqual(1);
  });

  it('a single outlier is dropped from five reviewers on', () => {
    const honest = stats(event('e1', [4, 4, 4, 4, 4]));
    const outlier = stats(event('e1', [1, 4, 4, 4, 4]));
    expect(outlier.rating).toBeCloseTo(honest.rating, 10);
    // With four reviewers the same low score does count.
    expect(stats(event('e1', [1, 4, 4, 4])).rating).toBeLessThan(honest.rating);
  });

  it('is monotonic in the scores', () => {
    expect(stats(event('e1', [3, 3, 3])).rating).toBeLessThan(stats(event('e1', [3, 3, 4])).rating);
  });

  it('an older event weighs half at the half-life', () => {
    const s = stats(event('e1', [4, 4, 4], 180));
    expect(s.confidence).toBeCloseTo(0.5 / 2.5, 10);
  });

  it('a third event of the same reviewers inside 90 days weighs less, a later one does not', () => {
    // The earlier events are in another sport, so only their effect on the pair count reaches this rating.
    const scenario = (ago: readonly [number, number]) => [
      ...event('t1', [1, 1], ago[0], ['x', 'y'], 'tennis'),
      ...event('t2', [1, 1], ago[1], ['x', 'y'], 'tennis'),
      ...event('f1', [1, 1, 5], 0, ['x', 'y', 'new']),
    ];
    // x and y at their third event: (1·½ + 1·½ + 5) / 2 = 3, so (2·3 + 3) / 3.
    expect(stats(scenario([20, 10])).rating).toBeCloseTo(3, 10);
    // Outside 90 days they are back at full weight: (1 + 1 + 5) / 3 = 7/3, so (2·3 + 7/3) / 3.
    expect(stats(scenario([200, 100])).rating).toBeCloseTo((6 + 7 / 3) / 3, 10);
  });

  it('repeated pairs in another sport count toward the decay, but their scores do not enter', () => {
    const elsewhere = [
      ...event('t1', [1, 1], 30, ['x', 'y'], 'tennis'),
      ...event('t2', [1, 1], 20, ['x', 'y'], 'tennis'),
    ];
    const here = event('f1', [2, 2, 5], 0, ['x', 'y', 'z']);
    const alone = stats(here);
    const both = stats([...elsewhere, ...here]);
    expect(both.sampleEvents).toBe(1);
    // x and y now weigh ½: the mean rises toward z's 5.
    expect(both.rating).toBeGreaterThan(alone.rating);
  });

  it('equal scores are trimmed in reviewer order, independent of input order', () => {
    const reviews = event('e1', [3, 3, 3, 3, 3]);
    expect(stats([...reviews].reverse())).toEqual(stats(reviews));
  });
});

describe('fair play XP', () => {
  it('needs two distinct reviewers', () => {
    expect(fairPlayXpAllowed(1)).toBe(false);
    expect(fairPlayXpAllowed(2)).toBe(true);
  });
});
