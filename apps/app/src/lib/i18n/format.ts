import { market, type Locale } from '@matchup/config';

const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', en: 'en-US' };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** Date/time is always rendered in the market timezone (events happen in Ankara), not the device's. */
export function formatDateTime(
  value: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: market.timezone,
    ...options,
  }).format(new Date(value));
}

/** Money is informational in the MVP (no payments); amounts are stored as integer minor units. */
export function formatMoneyMinor(amountMinor: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: market.currency,
  }).format(amountMinor / 100);
}

/**
 * Locale-aware upper-casing. Turkish has dotted/dotless I (i→İ, ı→I); a plain toUpperCase()
 * would produce wrong text ("izmir" → "IZMIR").
 */
export function toLocaleUpper(text: string, locale: Locale): string {
  return text.toLocaleUpperCase(intlLocale(locale));
}

export function toLocaleLower(text: string, locale: Locale): string {
  return text.toLocaleLowerCase(intlLocale(locale));
}
