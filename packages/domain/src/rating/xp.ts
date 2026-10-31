import { RATING_CONSTANTS } from './constants';

/** XP rules (RATING_SYSTEM §5.2): which events pay, and how often per day and week. Pure; SQL mirrors it. */
const X = RATING_CONSTANTS.xp;

const DAY_MS = 86_400_000;
/** Istanbul is UTC+3 all year (no daylight saving since 2016): a fixed offset is exact for every date we handle. */
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

/** The Istanbul calendar day of an instant, as a whole number (days since 1970-01-01 local). */
export function istanbulDay(at: Date): number {
  return Math.floor((at.getTime() + ISTANBUL_OFFSET_MS) / DAY_MS);
}

/** The Istanbul week (Monday to Sunday) of an instant, as a whole number. 1970-01-01 was a Thursday. */
export function istanbulWeek(at: Date): number {
  return Math.floor((istanbulDay(at) + 3) / 7);
}

/** An event gives attendance XP only with enough verified-present participants besides the organizer. */
export function eventPaysXp(presentNonOrganizerCount: number): boolean {
  return presentNonOrganizerCount >= X.minPresentOthers;
}

/**
 * Anti-farming caps: attendance XP from at most 2 events a day and 6 a week (Istanbul calendar). `earlier` are the
 * start times of the events that already gave this user attendance XP; the new one is the candidate.
 */
export function attendanceXpAllowed(earlier: readonly Date[], candidate: Date): boolean {
  const day = istanbulDay(candidate);
  const week = istanbulWeek(candidate);
  const sameDay = earlier.filter((d) => istanbulDay(d) === day).length;
  const sameWeek = earlier.filter((d) => istanbulWeek(d) === week).length;
  return sameDay < X.attendanceMaxPerDay && sameWeek < X.attendanceMaxPerWeek;
}

/** Organizer XP: at most 2 events a day, and not for an account younger than 24 h. */
export function organizerXpAllowed(args: {
  earlier: readonly Date[];
  candidate: Date;
  accountCreatedAt: Date;
  finalizedAt: Date;
}): boolean {
  const ageHours = (args.finalizedAt.getTime() - args.accountCreatedAt.getTime()) / 3_600_000;
  if (ageHours < X.organizerMinAccountAgeHours) return false;
  const day = istanbulDay(args.candidate);
  return args.earlier.filter((d) => istanbulDay(d) === day).length < X.organizerMaxPerDay;
}

/** The ledger key that makes an award idempotent (retries and double finalization are no-ops, §5.1). */
export const xpDedupeKey = {
  attended: (event: string, user: string) => `attend:${event}:${user}`,
  organized: (event: string) => `organize:${event}`,
  firstInSport: (user: string, sport: string) => `first_sport:${user}:${sport}`,
  reviewsSubmitted: (event: string, user: string) => `reviews:${event}:${user}`,
  fairPlay: (event: string, user: string) => `fairplay:${event}:${user}`,
} as const;
