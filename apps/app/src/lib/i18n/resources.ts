import enAccount from '@/locales/en/account.json';
import enAuth from '@/locales/en/auth.json';
import enCommon from '@/locales/en/common.json';
import enErrors from '@/locales/en/errors.json';
import enLegal from '@/locales/en/legal.json';
import enNav from '@/locales/en/nav.json';
import enOnboarding from '@/locales/en/onboarding.json';
import enProfile from '@/locales/en/profile.json';
import trAccount from '@/locales/tr/account.json';
import trAuth from '@/locales/tr/auth.json';
import trCommon from '@/locales/tr/common.json';
import trErrors from '@/locales/tr/errors.json';
import trLegal from '@/locales/tr/legal.json';
import trNav from '@/locales/tr/nav.json';
import trOnboarding from '@/locales/tr/onboarding.json';
import trProfile from '@/locales/tr/profile.json';

export const resources = {
  tr: {
    common: trCommon,
    nav: trNav,
    auth: trAuth,
    errors: trErrors,
    profile: trProfile,
    onboarding: trOnboarding,
    legal: trLegal,
    account: trAccount,
  },
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    errors: enErrors,
    profile: enProfile,
    onboarding: enOnboarding,
    legal: enLegal,
    account: enAccount,
  },
} as const;

export const defaultNS = 'common';
export const namespaces = [
  'common',
  'nav',
  'auth',
  'errors',
  'profile',
  'onboarding',
  'legal',
  'account',
] as const;
