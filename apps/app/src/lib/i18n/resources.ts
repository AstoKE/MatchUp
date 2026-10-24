import enAuth from '@/locales/en/auth.json';
import enCommon from '@/locales/en/common.json';
import enErrors from '@/locales/en/errors.json';
import enNav from '@/locales/en/nav.json';
import trAuth from '@/locales/tr/auth.json';
import trCommon from '@/locales/tr/common.json';
import trErrors from '@/locales/tr/errors.json';
import trNav from '@/locales/tr/nav.json';

export const resources = {
  tr: { common: trCommon, nav: trNav, auth: trAuth, errors: trErrors },
  en: { common: enCommon, nav: enNav, auth: enAuth, errors: enErrors },
} as const;

export const defaultNS = 'common';
export const namespaces = ['common', 'nav', 'auth', 'errors'] as const;
