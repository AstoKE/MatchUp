/**
 * Badges v1 (RATING_SYSTEM §6). The definitions are the single source; `achievement_definitions` holds the same rows
 * (the integration test `rating-equivalence` fails on drift, and compares `achievementRuleMet` with its SQL twin).
 * A per-sport badge's names use `{sport}`, filled with the sport's localized name.
 */
export type AchievementRule =
  | { type: 'ATTENDANCES'; min: number }
  | { type: 'SPORT_ATTENDANCES'; min: number }
  | { type: 'DISTINCT_SPORTS'; min: number }
  | {
      type: 'RELIABILITY';
      min_score: number;
      min_confidence_above: number;
      min_signals: number;
      no_show_free_days: number;
    }
  | { type: 'ORGANIZED_EVENTS'; min_events: number; min_present: number }
  | { type: 'FAIR_PLAY'; min_reviewers: number; min_events: number };

export interface AchievementDefinition {
  code: string;
  scope: 'GLOBAL' | 'PER_SPORT';
  xpBonus: number;
  names: { tr: string; en: string };
  descriptions: { tr: string; en: string };
  rule: AchievementRule;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    code: 'FIRST_MATCH',
    scope: 'GLOBAL',
    xpBonus: 50,
    names: { tr: 'İlk Maç', en: 'First Match' },
    descriptions: { tr: 'İlk maçına katıldın.', en: 'You played your first match.' },
    rule: { type: 'ATTENDANCES', min: 1 },
  },
  {
    code: 'TEN_GAMES',
    scope: 'GLOBAL',
    xpBonus: 100,
    names: { tr: 'On Maç', en: 'Ten Games' },
    descriptions: { tr: '10 maça katıldın.', en: 'You played 10 games.' },
    rule: { type: 'ATTENDANCES', min: 10 },
  },
  {
    code: 'SPORT_REGULAR',
    scope: 'PER_SPORT',
    xpBonus: 75,
    names: { tr: '{sport} Müdavimi', en: '{sport} Regular' },
    descriptions: { tr: 'Bu sporda 10 maça katıldın.', en: 'You played 10 games in this sport.' },
    rule: { type: 'SPORT_ATTENDANCES', min: 10 },
  },
  {
    code: 'MULTI_SPORT',
    scope: 'GLOBAL',
    xpBonus: 75,
    names: { tr: 'Çok Yönlü', en: 'Multi-Sport' },
    descriptions: { tr: '3 farklı sporda oynadın.', en: 'You played 3 different sports.' },
    rule: { type: 'DISTINCT_SPORTS', min: 3 },
  },
  {
    code: 'RELIABLE_PLAYER',
    scope: 'GLOBAL',
    xpBonus: 100,
    names: { tr: 'Güvenilir Oyuncu', en: 'Reliable Player' },
    descriptions: {
      tr: 'Sözünü tutan bir oyuncusun: yüksek güvenilirlik, son 60 günde gelmeme yok.',
      en: 'You keep your word: high reliability and no no-shows in the last 60 days.',
    },
    rule: {
      type: 'RELIABILITY',
      min_score: 0.9,
      min_confidence_above: 0.7,
      min_signals: 10,
      no_show_free_days: 60,
    },
  },
  {
    code: 'COMMUNITY_ORGANIZER',
    scope: 'GLOBAL',
    xpBonus: 100,
    names: { tr: 'Topluluk Organizatörü', en: 'Community Organizer' },
    descriptions: {
      tr: 'En az 3 oyuncunun katıldığı 5 etkinlik düzenledin.',
      en: 'You organized 5 events with at least 3 players each.',
    },
    rule: { type: 'ORGANIZED_EVENTS', min_events: 5, min_present: 3 },
  },
  {
    code: 'FAIR_PLAY',
    scope: 'GLOBAL',
    xpBonus: 75,
    names: { tr: 'Centilmen', en: 'Fair Play' },
    descriptions: {
      tr: '3 etkinlikte 5 farklı oyuncu centilmenliğini takdir etti.',
      en: '5 different players commended your fair play across 3 events.',
    },
    rule: { type: 'FAIR_PLAY', min_reviewers: 5, min_events: 3 },
  },
];

/** What a user's rows say at one moment: verified attendance only, closed review windows only. */
export interface AchievementFacts {
  attendances: number;
  /** For a per-sport badge: the attendances in the sport being evaluated. */
  sport_attendances: number;
  distinct_sports: number;
  reliability_score: number;
  reliability_confidence: number;
  reliability_samples: number;
  /** Days since the last active no-show; null when there is none. */
  days_since_no_show: number | null;
  organized_events: number;
  fair_play_reviewers: number;
  fair_play_events: number;
}

export function achievementRuleMet(rule: AchievementRule, f: AchievementFacts): boolean {
  switch (rule.type) {
    case 'ATTENDANCES':
      return f.attendances >= rule.min;
    case 'SPORT_ATTENDANCES':
      return f.sport_attendances >= rule.min;
    case 'DISTINCT_SPORTS':
      return f.distinct_sports >= rule.min;
    case 'RELIABILITY':
      return (
        f.reliability_score >= rule.min_score &&
        f.reliability_confidence > rule.min_confidence_above &&
        f.reliability_samples >= rule.min_signals &&
        (f.days_since_no_show === null || f.days_since_no_show > rule.no_show_free_days)
      );
    case 'ORGANIZED_EVENTS':
      return f.organized_events >= rule.min_events;
    case 'FAIR_PLAY':
      return f.fair_play_reviewers >= rule.min_reviewers && f.fair_play_events >= rule.min_events;
  }
}
