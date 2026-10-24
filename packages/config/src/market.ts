/** Launch-market defaults (PRD §1). Reference data only; no secrets. */
export const SUPPORTED_LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'tr';

export const market = {
  country: 'TR',
  pilotCitySlug: 'ankara',
  timezone: 'Europe/Istanbul',
  currency: 'TRY',
  minimumAge: 18,
} as const;

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
