import { describe, expect, it } from 'vitest';
import {
  RATING_CONSTANTS,
  attendanceXpAllowed,
  confidenceBand,
  eventPaysXp,
  isLateCancel,
  istanbulDay,
  istanbulWeek,
  organizerXpAllowed,
  ratingConfigRows,
  reliabilityStats,
  reliabilityValue,
  showsReliabilityPercentage,
  xpDedupeKey,
} from '.';

const fresh = (kinds: ('ATTENDED' | 'LATE_CANCEL' | 'NO_SHOW')[], ageDays = 0) =>
  kinds.map((k) => ({ value: reliabilityValue(k), ageDays }));
const A = 'ATTENDED' as const;
const N = 'NO_SHOW' as const;
const L = 'LATE_CANCEL' as const;
const rep = (n: number, kind: 'ATTENDED' | 'LATE_CANCEL' | 'NO_SHOW') =>
  Array.from({ length: n }, () => kind);

describe('reliability: the worked examples of RATING_SYSTEM §4.2 (no decay)', () => {
  it.each([
    ['10 attended', rep(10, A), 0.976923],
    ['9 attended + 1 no-show', [...rep(9, A), N], 0.9],
    ['2 attended + 1 no-show', [A, A, N], 0.783333],
    ['3 no-shows', [N, N, N], 0.45],
    ['nobody yet: the prior', [], 0.9],
  ] as const)('%s', (_name, kinds, expected) => {
    expect(reliabilityStats(fresh([...kinds])).score).toBeCloseTo(expected, 5);
  });

  it('confidence follows the same bands as skill', () => {
    expect(reliabilityStats(fresh(rep(10, A))).confidence).toBeCloseTo(10 / 13, 10);
    expect(confidenceBand(0.39)).toBe('LOW');
    expect(confidenceBand(0.4)).toBe('MEDIUM');
    expect(confidenceBand(0.7)).toBe('MEDIUM');
    expect(confidenceBand(0.71)).toBe('HIGH');
  });

  it('shows "New player" below three counted signals', () => {
    expect(showsReliabilityPercentage(2)).toBe(false);
    expect(showsReliabilityPercentage(3)).toBe(true);
  });
});

describe('reliability: properties', () => {
  it('a late cancellation sits between a no-show and an attendance', () => {
    const score = (k: 'ATTENDED' | 'LATE_CANCEL' | 'NO_SHOW') =>
      reliabilityStats(fresh([k, A, A])).score;
    expect(score(N)).toBeLessThan(score(L));
    expect(score(L)).toBeLessThan(score(A));
  });

  it('old signals fade: after 180 days an event counts half', () => {
    const now = reliabilityStats([{ value: 0, ageDays: 0 }]);
    const old = reliabilityStats([{ value: 0, ageDays: 180 }]);
    expect(old.score).toBeGreaterThan(now.score); // a no-show from long ago hurts less
    expect(old.confidence).toBeCloseTo(0.5 / (0.5 + 3), 10);
  });

  it('stays inside [0, 1] and never reaches full confidence', () => {
    for (const n of [0, 1, 5, 50, 500]) {
      const s = reliabilityStats(fresh(rep(n, A)));
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.confidence).toBeLessThan(1);
    }
  });

  it('is monotonic: one more attendance never lowers the score', () => {
    let previous = reliabilityStats([]).score;
    for (let n = 1; n <= 20; n += 1) {
      const next = reliabilityStats(fresh(rep(n, A))).score;
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('a negative age (clock skew) counts as today', () => {
    expect(reliabilityStats([{ value: 1, ageDays: -5 }])).toEqual(
      reliabilityStats([{ value: 1, ageDays: 0 }]),
    );
  });
});

describe('late cancellation (RATING_SYSTEM §4.1)', () => {
  const start = new Date('2026-11-10T18:00:00Z');
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it('approved long before: the window is twelve hours', () => {
    const approvedAt = hoursBefore(24 * 5);
    expect(isLateCancel({ startsAt: start, approvedAt, canceledAt: hoursBefore(13) })).toBe(false);
    expect(isLateCancel({ startsAt: start, approvedAt, canceledAt: hoursBefore(11) })).toBe(true);
    expect(isLateCancel({ startsAt: start, approvedAt, canceledAt: hoursBefore(12) })).toBe(false); // the boundary itself
  });

  it('approved three hours before: the window is half of that, not twelve hours', () => {
    const approvedAt = hoursBefore(3);
    expect(isLateCancel({ startsAt: start, approvedAt, canceledAt: hoursBefore(2) })).toBe(false);
    expect(isLateCancel({ startsAt: start, approvedAt, canceledAt: hoursBefore(1) })).toBe(true);
  });
});

describe('XP rules (RATING_SYSTEM §5.2)', () => {
  it('an event pays only with two verified-present participants besides the organizer', () => {
    expect(eventPaysXp(0)).toBe(false);
    expect(eventPaysXp(1)).toBe(false);
    expect(eventPaysXp(2)).toBe(true);
  });

  it('Istanbul is UTC+3: 22:30 UTC is already the next local day', () => {
    expect(istanbulDay(new Date('2026-11-10T20:59:59Z'))).toBe(
      istanbulDay(new Date('2026-11-10T00:00:00Z')),
    );
    expect(istanbulDay(new Date('2026-11-10T21:00:00Z'))).toBe(
      istanbulDay(new Date('2026-11-11T00:00:00Z')),
    );
  });

  it('weeks run Monday to Sunday', () => {
    // 2026-11-09 is a Monday.
    expect(istanbulWeek(new Date('2026-11-09T05:00:00Z'))).toBe(
      istanbulWeek(new Date('2026-11-15T15:00:00Z')),
    );
    expect(istanbulWeek(new Date('2026-11-15T15:00:00Z'))).not.toBe(
      istanbulWeek(new Date('2026-11-16T05:00:00Z')),
    );
  });

  it('attendance XP: at most 2 events a day', () => {
    const day = (h: number) => new Date(Date.UTC(2026, 10, 10, h));
    expect(attendanceXpAllowed([], day(8))).toBe(true);
    expect(attendanceXpAllowed([day(8)], day(12))).toBe(true);
    expect(attendanceXpAllowed([day(8), day(12)], day(16))).toBe(false);
    expect(attendanceXpAllowed([day(8), day(12)], new Date(Date.UTC(2026, 10, 11, 8)))).toBe(true);
  });

  it('attendance XP: at most 6 events a week', () => {
    const earlier = [9, 10, 11, 12, 13, 14].map((d) => new Date(Date.UTC(2026, 10, d, 8)));
    expect(attendanceXpAllowed(earlier.slice(0, 5), new Date(Date.UTC(2026, 10, 14, 12)))).toBe(
      true,
    );
    expect(attendanceXpAllowed(earlier, new Date(Date.UTC(2026, 10, 15, 8)))).toBe(false);
    expect(attendanceXpAllowed(earlier, new Date(Date.UTC(2026, 10, 16, 8)))).toBe(true); // next Monday
  });

  it('organizer XP: not for a new account, at most 2 a day', () => {
    const candidate = new Date('2026-11-10T16:00:00Z');
    const finalizedAt = new Date('2026-11-10T20:00:00Z');
    const old = new Date('2026-10-01T00:00:00Z');
    expect(organizerXpAllowed({ earlier: [], candidate, accountCreatedAt: old, finalizedAt })).toBe(
      true,
    );
    expect(
      organizerXpAllowed({
        earlier: [],
        candidate,
        accountCreatedAt: new Date('2026-11-10T00:00:00Z'),
        finalizedAt,
      }),
    ).toBe(false); // 20 hours old
    expect(
      organizerXpAllowed({
        earlier: [candidate, candidate],
        candidate,
        accountCreatedAt: old,
        finalizedAt,
      }),
    ).toBe(false);
  });

  it('dedupe keys encode the action so a retry is a no-op', () => {
    expect(xpDedupeKey.attended('e1', 'u1')).toBe('attend:e1:u1');
    expect(xpDedupeKey.organized('e1')).toBe('organize:e1');
    expect(xpDedupeKey.firstInSport('u1', 's1')).toBe('first_sport:u1:s1');
  });
});

describe('constants', () => {
  it('flatten to the keys private.rating_config stores', () => {
    const rows = Object.fromEntries(ratingConfigRows());
    expect(rows['reliability.prior_weight']).toBe(3);
    expect(rows['reliability.late_cancel_max_window_hours']).toBe(12);
    expect(rows['xp.attended_event']).toBe(50);
    expect(rows['xp.min_present_others']).toBe(2);
    expect(rows['windows.review_window_hours']).toBe(72);
    expect(Object.keys(rows).length).toBe(
      Object.values(RATING_CONSTANTS).reduce((n, section) => n + Object.keys(section).length, 0),
    );
  });
});

describe('independence (RATING_SYSTEM §7): reliability reads attendance only', () => {
  it('its inputs carry no skill and no XP, so those cannot move it', () => {
    // The function signature is the guarantee: (value, ageDays) only. XP spent or corrected is not an input.
    const same = reliabilityStats(fresh([A, A, N]));
    expect(reliabilityStats(fresh([A, A, N]))).toEqual(same);
  });

  it('a no-show lowers reliability and nothing else is an input', () => {
    expect(reliabilityStats(fresh([A, A, A, N])).score).toBeLessThan(
      reliabilityStats(fresh([A, A, A])).score,
    );
  });
});
