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

/** "19:30" in the event city's time zone (the day is named by the list heading around it). */
export function formatEventTime(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/**
 * A series' "HH:MM" (Turkey's local time, ADR-0032) in the app's time format. Turkey has kept +03:00 all year since
 * 2016, so any day of that period carries the time.
 */
export function formatSeriesTime(time: string, locale: string): string {
  return formatEventTime(`2024-01-01T${time}:00+03:00`, 'Europe/Istanbul', locale);
}

/** "Cumartesi, 31 Ekim" for a local calendar day (`YYYY-MM-DD`); noon UTC keeps every zone on that day. */
export function formatDayHeading(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** kuruş → "150" or "150,50" (TL, locale formatting). */
export function formatCost(minor: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
