import { currentLocale } from '@/lib/i18n';

/** Elapsed age, with an explicit clock so boundary behavior can be tested. */
export function relativeAge(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const units = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ] as const;
  const [unit, size] = units.find(([, size]) => seconds >= size) ?? ['second', 1];
  return new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'always' }).format(
    -Math.floor(seconds / size),
    unit,
  );
}
