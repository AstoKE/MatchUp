import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { EmptyState, SegmentedChoice, Skeleton, Text, useTheme } from '@/ui';
import { usePilotMetrics } from '../hooks';
import { Panel } from './Pieces';

const RANGES = ['7', '30', '90'] as const;

/**
 * The pilot dashboard (Phase 7 / M4, ADR-0025): totals and rates from the service's own data, plus usage counts from
 * people who consented to analytics. Nothing about an individual.
 */
export function PilotPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [range, setRange] = useState<(typeof RANGES)[number]>('30');
  const metrics = usePilotMetrics(Number(range));
  const locale = currentLocale();
  const pct = (value: number | null) =>
    value === null
      ? t('admin:pilot.none')
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  return (
    <View style={{ gap: spacing[3] }}>
      <SegmentedChoice
        label={t('admin:pilot.range')}
        value={range}
        onChange={setRange}
        options={RANGES.map((value) => ({
          value,
          label: t('admin:pilot.days', { count: Number(value) }),
        }))}
      />
      {metrics.isError ? (
        <EmptyState
          title={t('admin:pilot.loadFailed')}
          body={errorText(metrics.error)}
          actionLabel={t('common:retry')}
          onAction={() => void metrics.refetch()}
        />
      ) : !metrics.data ? (
        <Skeleton height={160} radiusKey="md" />
      ) : (
        <>
          <Panel>
            <Text variant="label">{t('admin:pilot.players')}</Text>
            <Figure label={t('admin:pilot.onboarded')} value={metrics.data.players.onboarded} />
            <Figure label={t('admin:pilot.newPlayers')} value={metrics.data.players.new} />
            <Figure label={t('admin:pilot.organized')} value={metrics.data.players.organized} />
            <Figure label={t('admin:pilot.joined')} value={metrics.data.players.joined} />
          </Panel>
          <Panel>
            <Text variant="label">{t('admin:pilot.events')}</Text>
            <Figure label={t('admin:pilot.published')} value={metrics.data.events.published} />
            <Figure label={t('admin:pilot.upcoming')} value={metrics.data.events.upcoming} />
            <Figure label={t('admin:pilot.completed')} value={metrics.data.events.completed} />
            <Figure label={t('admin:pilot.canceled')} value={metrics.data.events.canceled} />
            <Figure label={t('admin:pilot.fillRate')} value={pct(metrics.data.events.fill_rate)} />
            <Figure label={t('admin:pilot.requests')} value={metrics.data.participation.requests} />
            <Figure label={t('admin:pilot.approved')} value={metrics.data.participation.approved} />
            <Figure
              label={t('admin:pilot.noShow')}
              value={pct(metrics.data.participation.no_show_rate)}
            />
          </Panel>
          <Panel>
            <Text variant="label">
              {t('admin:pilot.provinces', { count: metrics.data.provinces_active })}
            </Text>
            {metrics.data.provinces.length === 0 ? (
              <Text tone="secondary">{t('admin:pilot.noProvinces')}</Text>
            ) : (
              metrics.data.provinces.map((p) => (
                <Figure key={p.city_id} label={p.name} value={p.upcoming} />
              ))
            )}
          </Panel>
          <Panel>
            <Text variant="label">
              {t('admin:pilot.usage', { count: metrics.data.players.analytics_consent })}
            </Text>
            {Object.keys(metrics.data.usage).length === 0 ? (
              <Text tone="secondary">{t('admin:pilot.noUsage')}</Text>
            ) : (
              Object.entries(metrics.data.usage)
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => (
                  <Figure
                    key={name}
                    label={t(`admin:pilot.event.${name as 'map_opened'}`, { defaultValue: name })}
                    value={n}
                  />
                ))
            )}
          </Panel>
        </>
      )}
    </View>
  );
}

function Figure({ label, value }: { label: string; value: number | string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}>
      <Text>{label}</Text>
      <Text variant="label">
        {typeof value === 'number' ? value.toLocaleString(currentLocale()) : value}
      </Text>
    </View>
  );
}
