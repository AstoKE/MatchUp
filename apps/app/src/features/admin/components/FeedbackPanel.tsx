import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, EmptyState, SegmentedChoice, Skeleton, Text, useTheme } from '@/ui';
import { setFeedbackStatus, type FeedbackStatus } from '../api/admin-api';
import { useDecision, useFeedback } from '../hooks';
import { formatWhen, Panel } from './Pieces';

type Filter = 'OPEN' | 'DONE';

/**
 * Requests, suggestions and complaints about the app (ROADMAP P-22), newest first. Marking one seen or done is the only
 * action; a complaint about a person belongs in a report, and the writer's account opens from here.
 */
export function FeedbackPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const feedback = useFeedback(filter === 'DONE' ? 'DONE' : null);
  const mark = useDecision((input: { id: string; status: FeedbackStatus }) =>
    setFeedbackStatus(input.id, input.status),
  );

  return (
    <View style={{ gap: spacing[3] }}>
      <SegmentedChoice<Filter>
        label={t('admin:feedback.filter')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'OPEN', label: t('admin:feedback.open') },
          { value: 'DONE', label: t('admin:feedback.done') },
        ]}
      />
      {mark.isError ? <Banner kind="danger" message={errorText(mark.error)} /> : null}
      {feedback.isError ? (
        <EmptyState
          title={t('admin:section.feedback')}
          body={errorText(feedback.error)}
          actionLabel={t('common:retry')}
          onAction={() => void feedback.refetch()}
        />
      ) : !feedback.data ? (
        <Skeleton height={72} radiusKey="md" />
      ) : feedback.data.length === 0 ? (
        <Text tone="secondary">{t('admin:feedback.empty')}</Text>
      ) : (
        feedback.data.map((item) => (
          <Panel key={item.id}>
            <Text variant="label">
              {t(`admin:feedback.kind.${item.kind}`)} · {t(`admin:feedback.status.${item.status}`)}{' '}
              · {formatWhen(item.created_at)}
            </Text>
            <Text>{item.body}</Text>
            {item.context ? (
              <Text variant="caption" tone="secondary">
                {t('admin:feedback.context', { screen: item.context })}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              <Button
                variant="secondary"
                label={item.user_name ?? t('admin:reports.unknown')}
                onPress={() => onOpenUser(item.user_id)}
              />
              {item.status === 'NEW' ? (
                <Button
                  variant="secondary"
                  label={t('admin:feedback.markSeen')}
                  disabled={mark.isPending}
                  onPress={() => mark.mutate({ id: item.id, status: 'SEEN' })}
                />
              ) : null}
              {item.status !== 'DONE' ? (
                <Button
                  label={t('admin:feedback.markDone')}
                  disabled={mark.isPending}
                  onPress={() => mark.mutate({ id: item.id, status: 'DONE' })}
                />
              ) : (
                <Button
                  variant="tertiary"
                  label={t('admin:feedback.reopen')}
                  disabled={mark.isPending}
                  onPress={() => mark.mutate({ id: item.id, status: 'SEEN' })}
                />
              )}
            </View>
          </Panel>
        ))
      )}
    </View>
  );
}
