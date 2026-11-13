import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Button, EmptyState, Skeleton, Text, useTheme } from '@/ui';
import { useDashboardSummary } from '../hooks';
import { relativeAge } from '../relative-age';
import { formatWhen, Panel } from './Pieces';

const QUEUES = [
  ['reports', 'reports'],
  ['organization_requests', 'organizations'],
  ['business_requests', 'businesses'],
  ['feedback', 'feedback'],
  ['disputes', 'disputes'],
  ['flags', 'flags'],
] as const;
export type DashboardSection = (typeof QUEUES)[number][1] | 'audit';

/** Mounted only for the active console section, so polling stops on navigation. */
export function DashboardPanel({
  onOpenSection,
}: {
  onOpenSection: (section: DashboardSection) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const summary = useDashboardSummary(true);
  if (summary.isError)
    return (
      <EmptyState
        title={t('admin:dashboard.loadFailed')}
        body={errorText(summary.error)}
        actionLabel={t('common:retry')}
        onAction={() => void summary.refetch()}
      />
    );
  if (!summary.data) return <Skeleton height={240} radiusKey="md" />;
  const data = summary.data;
  const now = Date.parse(data.generated_at);
  return (
    <View style={{ gap: spacing[3] }}>
      <Text tone="secondary">
        {t('admin:dashboard.updated', { time: formatWhen(data.generated_at) })}
      </Text>
      <Button
        variant="secondary"
        label={t('admin:dashboard.refresh')}
        loading={summary.isFetching}
        onPress={() => void summary.refetch()}
      />
      {QUEUES.map(([key, section]) => {
        const queue = data[key];
        const title = t(`admin:dashboard.cards.${key}`);
        const tone = queue.count === 0 ? 'secondary' : 'primary';
        return (
          <View
            key={key}
            role="group"
            tabIndex={0}
            accessibilityLabel={t('admin:dashboard.queueLabel', { title, count: queue.count })}
          >
            <Panel>
              <Text variant="label" tone={tone}>
                {title}
              </Text>
              <Text variant="title" tone={tone}>
                {queue.count}
              </Text>
              {queue.count === 0 ? (
                <Text tone="secondary">{t('admin:dashboard.empty')}</Text>
              ) : null}
              {'oldest_at' in queue && queue.count > 0 && queue.oldest_at ? (
                <Text tone="secondary">
                  {t('admin:dashboard.oldest', { age: relativeAge(queue.oldest_at, now) })}
                </Text>
              ) : null}
              {key === 'reports' ? (
                <Text tone="secondary">{t('admin:dashboard.breakdown', data.reports.by_type)}</Text>
              ) : null}
              <Button
                variant="secondary"
                label={t('admin:dashboard.open')}
                accessibilityLabel={t('admin:dashboard.openLabel', { title })}
                onPress={() => onOpenSection(section)}
              />
            </Panel>
          </View>
        );
      })}
      <Text variant="title" heading={2}>
        {t('admin:dashboard.recent')}
      </Text>
      {data.recent_actions.length === 0 ? (
        <Text tone="secondary">{t('admin:dashboard.noActions')}</Text>
      ) : null}
      {data.recent_actions.map((action, index) => (
        <Panel key={index}>
          <Text variant="label">
            {t(`admin:dashboard.actions.${action.action}`, { defaultValue: action.action })}
          </Text>
          <Text>
            {t(`admin:dashboard.targets.${action.target_type}`, {
              defaultValue: action.target_type,
            })}
          </Text>
          {action.note ? <Text>{Array.from(action.note).slice(0, 120).join('')}</Text> : null}
          <Text tone="secondary">{relativeAge(action.created_at, now)}</Text>
        </Panel>
      ))}
      <Button
        variant="tertiary"
        label={t('admin:dashboard.audit')}
        onPress={() => onOpenSection('audit')}
      />
    </View>
  );
}
