/* eslint-disable import/no-named-as-default-member -- the default i18next instance is used on purpose (react-i18next binds to it) */
import { brand, DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@matchup/config';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultNS, namespaces, resources } from './resources';

/** Device language if we support it; otherwise the market default (Turkish). */
export function detectDeviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code && isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

/**
 * Initializes i18next synchronously (resources are bundled). The brand name is injected as the
 * default `{{appName}}` variable so no string ever hard-codes it (ADR-0010). Do not attach
 * grammatical suffixes to `{{appName}}` in Turkish strings (suffix harmony depends on the name).
 */
export function initI18n(locale: Locale = detectDeviceLocale()) {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(locale);
    return i18n;
  }
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS,
    ns: [...namespaces],
    initAsync: false,
    interpolation: { escapeValue: false, defaultVariables: { appName: brand.name } },
    react: { useSuspense: false },
  });
  return i18n;
}

export function currentLocale(): Locale {
  const lng = i18n.language;
  return isSupportedLocale(lng) ? lng : DEFAULT_LOCALE;
}

export { i18n };
export * from './format';
