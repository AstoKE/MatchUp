import { AppError } from '@matchup/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { currentLocale, i18n } from '@/lib/i18n';
import enSeries from '@/locales/en/event-series.json';
import trSeries from '@/locales/tr/event-series.json';
import { Banner, Button, SegmentedChoice, Text, TOUCH_TARGET, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import type { EventSeries } from '../api/series-api';
import { createEventSeries, fetchSeriesUpcoming, stopEventSeries } from '../api/series-manage-api';
import { formatEventStart } from '../format';
import { eventQueryKey, useEventSeries } from '../hooks';
import { useSeriesLine } from '../series-line';

// The organizer's series hooks and copy live with the panel, the only place that uses them, so they load with its lazy
// chunk and not with the first load (docs/PERFORMANCE.md §4 item 5).
let copyAdded = false;
function ensureSeriesCopy() {
  if (copyAdded) return;
  i18n.addResourceBundle('tr', 'eventSeries', trSeries, true, true);
  i18n.addResourceBundle('en', 'eventSeries', enSeries, true, true);
  copyAdded = true;
}

function useSeriesUpcoming(seriesId: string) {
  return useQuery({
    queryKey: ['series', seriesId, 'upcoming'],
    queryFn: () => fetchSeriesUpcoming(seriesId),
  });
}

/** Starting or stopping a series changes this event, the events it opens and My events. */
function useSeriesMutation<A>(eventId: string, run: (args: A) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: eventQueryKey(eventId) }),
        queryClient.invalidateQueries({ queryKey: ['series'] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
      ]),
  });
}

/**
 * Event management (Phase 11 / M2, ADR-0032): turn a published, upcoming event into a weekly or fortnightly series, see
 * the series and stop it. The server decides who may and when; this only hides what cannot work.
 */
export function SeriesPanel({ event, started }: { event: EventDetails; started: boolean }) {
  ensureSeriesCopy();
  const { t } = useTranslation('eventSeries');
  const { colors, radius, spacing } = useTheme();
  const series = useEventSeries(event.id);
  if (series.isPending || series.isError) return null;
  const current = series.data;
  const canStart = event.status === 'PUBLISHED' && !started;
  const mine = current?.isMine ?? false;
  if (current && !mine) return null;
  if (!current && !canStart && event.status !== 'DRAFT') return null;

  return (
    <View
      style={{
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {current?.status === 'ACTIVE' ? (
        <ActiveSeries eventId={event.id} series={current} />
      ) : (
        <>
          <Text variant="title" heading={2}>
            {current ? t('stoppedTitle') : t('title')}
          </Text>
          {current?.stoppedReason ? (
            <Text tone="secondary">{t(`stopped.${current.stoppedReason}`)}</Text>
          ) : null}
          {event.status === 'DRAFT' ? (
            <Text tone="secondary">{t('draftHint')}</Text>
          ) : canStart ? (
            <StartSeries eventId={event.id} again={Boolean(current)} />
          ) : null}
        </>
      )}
    </View>
  );
}

function StartSeries({ eventId, again }: { eventId: string; again: boolean }) {
  const { t } = useTranslation(['eventSeries', 'common']);
  const toast = useToast();
  const start = useSeriesMutation(eventId, (n: 1 | 2) => createEventSeries(eventId, n));
  const [weeks, setWeeks] = useState<'1' | '2'>('1');
  const failure =
    start.error instanceof AppError && start.error.code === 'QUOTA_EXCEEDED'
      ? t('quota')
      : start.error
        ? errorText(start.error)
        : null;
  return (
    <>
      <Text tone="secondary">{t('body')}</Text>
      {failure ? <Banner kind="danger" message={failure} /> : null}
      <SegmentedChoice<'1' | '2'>
        label={t('interval')}
        value={weeks}
        onChange={setWeeks}
        options={[
          { value: '1', label: t('weekly') },
          { value: '2', label: t('fortnightly') },
        ]}
      />
      <Button
        variant="secondary"
        label={again ? t('restart') : t('start')}
        loading={start.isPending}
        loadingLabel={t('common:loading')}
        onPress={() =>
          start.mutate(weeks === '2' ? 2 : 1, {
            onSuccess: () => toast.show(t('startedToast'), 'success'),
          })
        }
        fullWidth
      />
    </>
  );
}

function ActiveSeries({ eventId, series }: { eventId: string; series: EventSeries }) {
  const { t } = useTranslation(['eventSeries', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const locale = currentLocale();
  const line = useSeriesLine(series);
  const upcoming = useSeriesUpcoming(series.id);
  const stop = useSeriesMutation(eventId, (id: string) => stopEventSeries(id));
  const [confirming, setConfirming] = useState(false);
  const others = (upcoming.data ?? []).filter((e) => e.id !== eventId);
  // Series times are Turkey's local time (ADR-0032), whatever the city.
  const when = (iso: string) => formatEventStart(iso, 'Europe/Istanbul', locale);

  return (
    <>
      <Text variant="title" heading={2}>
        {t('activeTitle')}
      </Text>
      {line ? <Text variant="label">{line}</Text> : null}
      <Text tone="secondary">{t('activeBody')}</Text>
      {series.nextAt ? (
        <Text variant="bodySm" tone="secondary">
          {t('next', { date: when(series.nextAt) })}
        </Text>
      ) : null}
      {others.length > 0 ? (
        <View style={{ gap: spacing[1] }}>
          <Text variant="label" tone="secondary">
            {t('opened')}
          </Text>
          <View role="list">
            {others.map((e) => (
              <View key={e.id} role="listitem">
                <Link href={{ pathname: '/e/[id]', params: { id: e.id } }} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={t('openEvent', { date: when(e.startsAt) })}
                    style={{ minHeight: TOUCH_TARGET, justifyContent: 'center' }}
                  >
                    <Text tone="link">{when(e.startsAt)}</Text>
                  </Pressable>
                </Link>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {stop.isError ? <Banner kind="danger" message={errorText(stop.error)} /> : null}
      {confirming ? (
        <View style={{ gap: spacing[2] }}>
          <Text role="alert">{t('confirmStop')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <Button
              variant="destructive"
              label={t('confirmStopYes')}
              loading={stop.isPending}
              loadingLabel={t('common:loading')}
              onPress={() =>
                stop.mutate(series.id, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.show(t('stoppedToast'), 'success');
                  },
                })
              }
            />
            <Button variant="secondary" label={t('keep')} onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <Button variant="tertiary" label={t('stop')} onPress={() => setConfirming(true)} />
      )}
    </>
  );
}
