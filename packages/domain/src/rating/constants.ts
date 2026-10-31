/**
 * Rating constants, the single source (RATING_SYSTEM §1.7, ADR-0004). SQL reads the same values from
 * `private.rating_config`; the integration test `rating-equivalence` fails when the two drift.
 * A change here means a new `RATING_ALGORITHM_VERSION` / `RATING_RULES_VERSION`, a migration and a recompute.
 */
export const RATING_ALGORITHM_VERSION = 1;
export const RATING_RULES_VERSION = 1;

export const RATING_CONSTANTS = {
  reliability: {
    /** A in `(A·p0 + Σ w·v) / (A + Σ w)`: the prior counts as three fully weighted events. */
    priorWeight: 3,
    /** p0: what a player with no history is assumed to be. */
    priorValue: 0.9,
    halfLifeDays: 180,
    /** Fewer counted signals than this show "New player" instead of a percentage. */
    minSignalsToShow: 3,
    attendedValue: 1,
    lateCancelValue: 0.5,
    noShowValue: 0,
    /** A cancellation is late after `starts_at − min(12 h, ½ · (starts_at − approved_at))`. */
    lateCancelMaxWindowHours: 12,
    confidenceLowBelow: 0.4,
    confidenceHighAbove: 0.7,
  },
  skill: {
    /** k: the self-assessment counts as two fully weighted events. */
    priorWeight: 2,
    /** The prior for a user with no self-assessment in the sport. */
    defaultPrior: 3,
    halfLifeDays: 180,
    /** An event counts only with this many distinct reviewers: one person alone cannot move a rating. */
    minReviewersPerEvent: 2,
    /** From this many reviewers on, the single lowest and highest scores are dropped. */
    trimFromReviewers: 5,
    /** An event reaches full weight at this many reviewers. */
    fullWeightReviewers: 3,
    /** A reviewer's first events about the same person inside the pair window keep full weight. */
    pairFreeEvents: 2,
    pairWindowDays: 90,
  },
  xp: {
    attendedEvent: 50,
    organizedEvent: 40,
    firstInSport: 30,
    reviewsSubmitted: 10,
    fairPlayReceived: 10,
    fairPlayMinReviewers: 2,
    /** Verified-present NON-organizer participants an event needs before it gives any XP (the organizer's own
     * row is self-attested and never counts toward a threshold). */
    minPresentOthers: 2,
    attendanceMaxPerDay: 2,
    attendanceMaxPerWeek: 6,
    organizerMaxPerDay: 2,
    /** A new account earns no organizer XP. */
    organizerMinAccountAgeHours: 24,
  },
  windows: {
    reviewWindowHours: 72,
    autoFinalizeHours: 48,
  },
} as const;

/** Calendar for caps: Istanbul (UTC+3 all year since 2016). */
export const RATING_TIME_ZONE = 'Europe/Istanbul';

/** The constants flattened to `section.snake_case_key` rows, exactly as `private.rating_config` stores them. */
export function ratingConfigRows(): [string, number][] {
  const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return Object.entries(RATING_CONSTANTS).flatMap(([section, values]) =>
    Object.entries(values).map(([key, value]): [string, number] => [
      `${section}.${snake(key)}`,
      value as number,
    ]),
  );
}
