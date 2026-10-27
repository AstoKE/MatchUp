import type { EventValidationKey } from '@matchup/domain';
import { i18n } from '@/lib/i18n';

/** Stable validation key from `@matchup/domain` → localized text. */
export function eventValidationMessage(key: EventValidationKey | undefined): string | undefined {
  return key ? i18n.t(`events:validation.${key}`) : undefined;
}

/** "Çarşamba, 28 Ekim 19:30" in the event city's time zone and the app language. */
export function formatEventStart(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** kuruş → "150" or "150,50" (TL, locale formatting). */
export function formatCost(minor: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
