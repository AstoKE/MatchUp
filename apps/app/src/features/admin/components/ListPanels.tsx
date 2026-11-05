import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, EmptyState, Skeleton, Text, useTheme, useToast } from '@/ui';
import { resolveDispute } from '../api/admin-api';
import { useActions, useDecision, useDisputes, useFlags } from '../hooks';
import { formatWhen, Panel, Confirmed } from './Pieces';

/** Patterns worth a look. A flag is never a decision: the people on it are opened, and a person decides. */
export function FlagsPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const flags = useFlags();
  if (flags.isError) {
    return (
      <EmptyState
        title={t('admin:section.flags')}
        body={errorText(flags.error)}
        actionLabel={t('common:retry')}
        onAction={() => void flags.refetch()}
      />
    );
  }
  if (!flags.data) return <Skeleton height={72} radiusKey="md" />;
  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="caption" tone="secondary">
        {t('admin:flags.note')}
      </Text>
      {flags.data.length === 0 ? <Text tone="secondary">{t('admin:flags.empty')}</Text> : null}
      {flags.data.map((flag, index) => (
        <Panel key={`${flag.kind}-${index}`}>
          <Text variant="label">
            {t(`admin:flags.kind.${flag.kind}`)} · {t('admin:flags.count', { count: flag.count })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {flag.subjects.map((subject) => (
              <Button
                key={subject.id}
                variant="secondary"
                label={subject.name ?? t('admin:reports.unknown')}
                onPress={() => onOpenUser(subject.id)}
              />
            ))}
          </View>
        </Panel>
      ))}
    </View>
  );
}

/** Disputed absences. Deciding is final for that player's record. */
export function DisputesPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const disputes = useDisputes();
  const decide = useDecision((input: { id: string; present: boolean }) =>
    resolveDispute(input.id, input.present),
  );
  if (disputes.isError) {
    return (
      <EmptyState
        title={t('admin:section.disputes')}
        body={errorText(disputes.error)}
        actionLabel={t('common:retry')}
        onAction={() => void disputes.refetch()}
      />
    );
  }
  if (!disputes.data) return <Skeleton height={72} radiusKey="md" />;
  return (
    <View style={{ gap: spacing[3] }}>
      {decide.isError ? <Banner kind="danger" message={errorText(decide.error)} /> : null}
      {disputes.data.length === 0 ? (
        <Text tone="secondary">{t('admin:disputes.empty')}</Text>
      ) : null}
      {disputes.data.map((d) => (
        <Panel key={d.participation_id}>
          <Text variant="label">
            {d.user_name ?? t('admin:reports.unknown')} · {d.event_title}
          </Text>
          <Text variant="bodySm">
            {t('admin:disputes.reason', { reason: d.reason ?? '—' })} · {formatWhen(d.created_at)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {[true, false].map((present) => (
              <Confirmed
                key={String(present)}
                label={t(present ? 'admin:disputes.present' : 'admin:disputes.absent')}
                pending={decide.isPending}
                onConfirm={() =>
                  decide.mutate(
                    { id: d.participation_id, present },
                    { onSuccess: () => toast.show(t('admin:disputes.done'), 'success') },
                  )
                }
              />
            ))}
          </View>
        </Panel>
      ))}
    </View>
  );
}

/** Everything that was decided, newest first. */
export function AuditPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const actions = useActions();
  const items = useMemo(() => actions.data?.pages.flatMap((p) => p.items) ?? [], [actions.data]);
  if (actions.isError) {
    return (
      <EmptyState
        title={t('admin:section.audit')}
        body={errorText(actions.error)}
        actionLabel={t('common:retry')}
        onAction={() => void actions.refetch()}
      />
    );
  }
  if (actions.isPending) return <Skeleton height={72} radiusKey="md" />;
  return (
    <View style={{ gap: spacing[2] }}>
      {items.length === 0 ? <Text tone="secondary">{t('admin:audit.empty')}</Text> : null}
      <View role="list" style={{ gap: spacing[2] }}>
        {items.map((a) => (
          <View key={a.id} role="listitem">
            <Panel>
              <Text variant="label">
                {t(`admin:audit.action.${a.action as 'REPORT_RESOLVED'}`, {
                  defaultValue: a.action,
                })}
                {a.outcome
                  ? ` · ${t(`admin:audit.outcome.${a.outcome as 'ACTIONED'}`, { defaultValue: a.outcome })}`
                  : ''}
              </Text>
              <Text variant="caption" tone="secondary">
                {t('admin:audit.by', { name: a.actor_name ?? t('admin:reports.unknown') })} ·{' '}
                {formatWhen(a.created_at)}
              </Text>
              {a.note ? <Text variant="bodySm">{a.note}</Text> : null}
            </Panel>
          </View>
        ))}
      </View>
      {actions.hasNextPage ? (
        <Button
          variant="secondary"
          label={t('admin:audit.loadMore')}
          loading={actions.isFetchingNextPage}
          loadingLabel={t('common:loading')}
          onPress={() => void actions.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
