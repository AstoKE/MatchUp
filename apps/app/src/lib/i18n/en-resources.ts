import enAccount from '@/locales/en/account.json';
import enAuth from '@/locales/en/auth.json';
import enCommon from '@/locales/en/common.json';
import enErrors from '@/locales/en/errors.json';
import enEvents from '@/locales/en/events.json';
import enLegal from '@/locales/en/legal.json';
import enNav from '@/locales/en/nav.json';
import enNotifications from '@/locales/en/notifications.json';
import enOnboarding from '@/locales/en/onboarding.json';
import enPlayers from '@/locales/en/players.json';
import enProfile from '@/locales/en/profile.json';

/** English, kept out of the web's first load (english.web.ts imports this file on demand). */
export const enResources = {
  common: enCommon,
  nav: enNav,
  auth: enAuth,
  errors: enErrors,
  players: enPlayers,
  profile: enProfile,
  onboarding: enOnboarding,
  legal: enLegal,
  account: enAccount,
  events: enEvents,
  notifications: enNotifications,
} as const;
