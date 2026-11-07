import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import { Text, useTheme, WheelPicker, type WheelOption } from '@/ui';

/** `YYYY-MM-DD` plus whole days (calendar arithmetic, no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Today", "Tomorrow", then "Thu 12 Nov" (with the year once it is not this year's). */
function useDayOptions(from: string, days: number, extra: string | null): WheelOption<string>[] {
  const { t } = useTranslation('events');
  const locale = currentLocale();
  return useMemo(() => {
    const thisYear = from.slice(0, 4);
    const short = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const long = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const list = Array.from({ length: days }, (_, i) => addDays(from, i));
    // An event being edited can lie outside the window (in the past, or too far ahead): keep it choosable.
    if (extra && !list.includes(extra)) list.push(extra);
    list.sort();
    const tomorrow = addDays(from, 1);
    return list.map((iso) => {
      const date = new Date(`${iso}T12:00:00Z`);
      const label =
        iso === from
          ? t('fields.today')
          : iso === tomorrow
            ? t('fields.tomorrow')
            : iso.slice(0, 4) === thisYear
              ? short.format(date)
              : long.format(date);
      return { value: iso, label };
    });
  }, [from, days, extra, locale, t]);
}

/** A wheel of days from `from` (the city's today). */
export function DateWheel({
  from,
  days,
  value,
  onChange,
}: {
  from: string;
  days: number;
  value: string;
  onChange: (iso: string) => void;
}) {
  const { t } = useTranslation('events');
  const options = useDayOptions(from, days, value);
  return (
    <WheelPicker
      label={t('fields.dateWheel')}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS: WheelOption<string>[] = Array.from({ length: 24 }, (_, h) => ({
  value: pad(h),
  label: pad(h),
}));
const MINUTES: WheelOption<string>[] = Array.from({ length: 12 }, (_, i) => ({
  value: pad(i * 5),
  label: pad(i * 5),
}));

/** Hour and minute wheels (5-minute steps) for `HH:MM`. */
export function TimeWheel({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const [hour = '19', minute = '00'] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : [];
  // An existing event can start at an odd minute: keep it on the wheel.
  const minutes = MINUTES.some((m) => m.value === minute)
    ? MINUTES
    : [...MINUTES, { value: minute, label: minute }].sort((a, b) => a.value.localeCompare(b.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
      <WheelPicker
        label={t('fields.hourWheel')}
        options={HOURS}
        value={hour}
        onChange={(h) => onChange(`${h}:${minute}`)}
        width={72}
      />
      <Text variant="title" accessible={false}>
        {':'}
      </Text>
      <WheelPicker
        label={t('fields.minuteWheel')}
        options={minutes}
        value={minute}
        onChange={(m) => onChange(`${hour}:${m}`)}
        width={72}
      />
    </View>
  );
}
