import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import type { EventSeries } from './api/series-api';
import { formatSeriesTime } from './format';

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** "Her hafta salı 20:00": when an active series repeats (ADR-0032), or null when there is nothing to say. */
export function useSeriesLine(series: EventSeries | null | undefined): string | null {
  const { t } = useTranslation('events');
  if (!series || series.status !== 'ACTIVE' || !series.slot) return null;
  const vars = {
    day: t(`series.weekday.${series.slot.weekday as Weekday}`),
    time: formatSeriesTime(series.slot.time, currentLocale()),
  };
  return series.intervalWeeks === 2 ? t('series.everyTwoWeeks', vars) : t('series.everyWeek', vars);
}
