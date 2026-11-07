/* eslint-disable import/no-named-as-default-member -- the default i18next instance is used on purpose (react-i18next binds to it) */
import { brand, DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@matchup/config';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readStoredLocale, storeLocale } from './locale-preference';
import { bundledEnglish, loadEnglish } from './english';
import { defaultNS, namespaces, resources } from './resources';

/** Device language if we support it; otherwise the market default (Turkish). */
export function detectDeviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code && isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

/**
 * Initializes i18next synchronously with the languages already in the bundle (Turkish everywhere, English on phones);
 * `prepareLanguage` adds English on the web before the first render needs it. The brand name is injected as the
 * default `{{appName}}` variable so no string ever hard-codes it (ADR-0010). Do not attach
 * grammatical suffixes to `{{appName}}` in Turkish strings (suffix harmony depends on the name).
 */
export function initI18n(locale: Locale = detectDeviceLocale()) {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(locale);
    return i18n;
  }
  void i18n.use(initReactI18next).init({
    resources: { ...resources, ...(bundledEnglish ? { en: bundledEnglish } : {}) },
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

/** Makes sure a language's texts are present (English is fetched once on the web). */
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  if (locale !== 'en' || i18n.hasResourceBundle('en', 'common')) return;
  const en = await loadEnglish();
  for (const [ns, data] of Object.entries(en)) i18n.addResourceBundle('en', ns, data, true, true);
}

/** Switches the UI language (after its texts are loaded) and remembers the choice on this device. */
export function setLocale(locale: Locale): void {
  void storeLocale(locale);
  void ensureLocaleLoaded(locale).then(() => i18n.changeLanguage(locale));
}

/** Applies a previously chosen language (once, at startup) — the choice beats the device language. */
export async function restoreStoredLocale(): Promise<void> {
  const stored = await readStoredLocale();
  if (stored && stored !== currentLocale()) {
    await ensureLocaleLoaded(stored);
    await i18n.changeLanguage(stored);
  }
}

/**
 * Resolves once the language the app opens in has its texts: the remembered choice, else the device language. The
 * root layout waits for it (like the fonts), so an English user never sees Turkish first.
 */
export async function prepareLanguage(): Promise<void> {
  try {
    await ensureLocaleLoaded(currentLocale());
    await restoreStoredLocale();
    // Re-render with the texts that just arrived.
    if (currentLocale() === 'en') await i18n.changeLanguage('en');
  } catch {
    // A failed download leaves Turkish, the fallback: the app still opens.
  }
}

export { i18n };
export * from './format';
