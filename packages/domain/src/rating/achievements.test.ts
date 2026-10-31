import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementRuleMet, type AchievementFacts, xpDedupeKey } from '.';

const nothing: AchievementFacts = {
  attendances: 0,
  sport_attendances: 0,
  distinct_sports: 0,
  reliability_score: 0.9,
  reliability_confidence: 0,
  reliability_samples: 0,
  days_since_no_show: null,
  organized_events: 0,
  fair_play_reviewers: 0,
  fair_play_events: 0,
};
const met = (code: string, facts: Partial<AchievementFacts>) =>
  achievementRuleMet(ACHIEVEMENTS.find((a) => a.code === code)!.rule, { ...nothing, ...facts });

const reliable = {
  reliability_score: 0.95,
  reliability_confidence: 0.75,
  reliability_samples: 10,
};

describe('badges v1 (RATING_SYSTEM §6)', () => {
  it('has exactly the seven specified badges and bonuses', () => {
    expect(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a.xpBonus]))).toEqual({
      FIRST_MATCH: 50,
      TEN_GAMES: 100,
      SPORT_REGULAR: 75,
      MULTI_SPORT: 75,
      RELIABLE_PLAYER: 100,
      COMMUNITY_ORGANIZER: 100,
      FAIR_PLAY: 75,
    });
  });

  it('nobody starts with a badge', () => {
    for (const a of ACHIEVEMENTS) expect(achievementRuleMet(a.rule, nothing)).toBe(false);
  });

  it.each<[string, Partial<AchievementFacts>, Partial<AchievementFacts>]>([
    ['FIRST_MATCH', { attendances: 1 }, { attendances: 0 }],
    ['TEN_GAMES', { attendances: 10 }, { attendances: 9 }],
    ['SPORT_REGULAR', { sport_attendances: 10 }, { attendances: 40, sport_attendances: 9 }],
    ['MULTI_SPORT', { distinct_sports: 3 }, { distinct_sports: 2 }],
    ['COMMUNITY_ORGANIZER', { organized_events: 5 }, { organized_events: 4 }],
    [
      'FAIR_PLAY',
      { fair_play_reviewers: 5, fair_play_events: 3 },
      { fair_play_reviewers: 5, fair_play_events: 2 },
    ],
    [
      'FAIR_PLAY',
      { fair_play_reviewers: 5, fair_play_events: 3 },
      { fair_play_reviewers: 4, fair_play_events: 3 },
    ],
  ])('%s at the threshold, not below it', (code, yes, no) => {
    expect(met(code, yes)).toBe(true);
    expect(met(code, no)).toBe(false);
  });

  it('RELIABLE_PLAYER needs every condition', () => {
    expect(met('RELIABLE_PLAYER', reliable)).toBe(true);
    expect(met('RELIABLE_PLAYER', { ...reliable, reliability_score: 0.89 })).toBe(false);
    expect(met('RELIABLE_PLAYER', { ...reliable, reliability_confidence: 0.7 })).toBe(false);
    expect(met('RELIABLE_PLAYER', { ...reliable, reliability_samples: 9 })).toBe(false);
    expect(met('RELIABLE_PLAYER', { ...reliable, days_since_no_show: 60 })).toBe(false);
    expect(met('RELIABLE_PLAYER', { ...reliable, days_since_no_show: 61 })).toBe(true);
  });

  it('the dedupe key has the specified shape', () => {
    expect(xpDedupeKey.achievement('FIRST_MATCH', 'u')).toBe('ach:FIRST_MATCH:u');
    expect(xpDedupeKey.achievement('SPORT_REGULAR', 'u', 's')).toBe('ach:SPORT_REGULAR:u:s');
  });
});
