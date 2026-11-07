import trAccount from '@/locales/tr/account.json';
import trAuth from '@/locales/tr/auth.json';
import trCommon from '@/locales/tr/common.json';
import trErrors from '@/locales/tr/errors.json';
import trEvents from '@/locales/tr/events.json';
import trLegal from '@/locales/tr/legal.json';
import trNav from '@/locales/tr/nav.json';
import trNotifications from '@/locales/tr/notifications.json';
import trOnboarding from '@/locales/tr/onboarding.json';
import trPlayers from '@/locales/tr/players.json';
import trProfile from '@/locales/tr/profile.json';

/**
 * Turkish, the default and fallback language, is in the first load. English is loaded on demand on the web
 * (english.web.ts) and bundled on phones (english.ts): see PERFORMANCE §4 item 5.
 */
export const resources = {
  tr: {
    common: trCommon,
    nav: trNav,
    auth: trAuth,
    errors: trErrors,
    players: trPlayers,
    profile: trProfile,
    onboarding: trOnboarding,
    legal: trLegal,
    account: trAccount,
    events: trEvents,
    notifications: trNotifications,
  },
} as const;

export const defaultNS = 'common';
export const namespaces = [
  'common',
  'nav',
  'auth',
  'errors',
  'players',
  'profile',
  'onboarding',
  'legal',
  'account',
  'events',
  'notifications',
] as const;
