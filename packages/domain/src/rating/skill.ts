import { RATING_CONSTANTS } from './constants';

/** Skill (RATING_SYSTEM §3): "how good, according to peers who played with them?" Moved only by peer scores. */
const S = RATING_CONSTANTS.skill;

const DAY_MS = 86_400_000;

/** One counted review about the user. Other sports are included too: repeated pairs decay across sports. */
export interface SkillReview {
  eventId: string;
  sportId: string;
  reviewerId: string;
  /** 1..5 */
  score: number;
  /** The event's start: ages the event and places it in the reviewer pair window. */
  startsAt: Date;
}

export interface SkillStats {
  /** 1..5 */
  rating: number;
  /** 0..<1, same bands as reliability (`confidenceBand`). */
  confidence: number;
  /** Events that counted (at least two distinct reviewers). */
  sampleEvents: number;
}

/**
 * RATING_SYSTEM §3.4 for one user and sport:
 * `reviewer_weight = 1 / (1 + max(0, c − 2))`, `w_e = min(n_e, 3) / 3 · 0.5^(age/180)`,
 * `rating = (k·prior + Σ w_e·o_e) / (k + Σ w_e)`, `confidence = Σ w_e / (Σ w_e + k)`.
 * With five or more reviewers the lowest and highest scores are dropped first; equal scores are ordered by reviewer
 * id, so which row is dropped is deterministic and the SQL gives the same answer.
 */
export function skillStats(args: {
  prior: number;
  sportId: string;
  reviews: readonly SkillReview[];
  at: Date;
}): SkillStats {
  const pairWindowMs = S.pairWindowDays * DAY_MS;
  const byEvent = new Map<string, { review: SkillReview; weight: number }[]>();
  for (const review of args.reviews) {
    if (review.sportId !== args.sportId) continue;
    const c = args.reviews.filter(
      (other) =>
        other.reviewerId === review.reviewerId &&
        other.startsAt.getTime() <= review.startsAt.getTime() &&
        other.startsAt.getTime() > review.startsAt.getTime() - pairWindowMs,
    ).length;
    const weight = 1 / (1 + Math.max(0, c - S.pairFreeEvents));
    const rows = byEvent.get(review.eventId) ?? [];
    rows.push({ review, weight });
    byEvent.set(review.eventId, rows);
  }

  let weightSum = 0;
  let weightedScores = 0;
  let sampleEvents = 0;
  for (const rows of byEvent.values()) {
    const n = rows.length;
    if (n < S.minReviewersPerEvent) continue;
    const ordered = [...rows].sort(
      (a, b) =>
        a.review.score - b.review.score || (a.review.reviewerId < b.review.reviewerId ? -1 : 1),
    );
    const kept = n >= S.trimFromReviewers ? ordered.slice(1, -1) : ordered;
    const weights = kept.reduce((sum, row) => sum + row.weight, 0);
    const mean = kept.reduce((sum, row) => sum + row.weight * row.review.score, 0) / weights;
    const ageDays = (args.at.getTime() - rows[0]!.review.startsAt.getTime()) / DAY_MS;
    const w =
      (Math.min(n, S.fullWeightReviewers) / S.fullWeightReviewers) *
      Math.pow(0.5, Math.max(0, ageDays) / S.halfLifeDays);
    weightSum += w;
    weightedScores += w * mean;
    sampleEvents += 1;
  }

  const k = S.priorWeight;
  return {
    rating: (k * args.prior + weightedScores) / (k + weightSum),
    confidence: weightSum / (weightSum + k),
    sampleEvents,
  };
}

/** A fair-play commendation pays only from enough distinct reviewers of one event (§5.2). */
export function fairPlayXpAllowed(distinctReviewers: number): boolean {
  return distinctReviewers >= RATING_CONSTANTS.xp.fairPlayMinReviewers;
}
