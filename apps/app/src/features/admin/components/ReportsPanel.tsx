import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import {
  Banner,
  Button,
  EmptyState,
  SegmentedChoice,
  Skeleton,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/ui';
import {
  cancelEvent,
  resolveReport,
  setVenueStatus,
  suspendUser,
  type ReportItem,
} from '../api/admin-api';
import { useDecision, useReport, useReports } from '../hooks';
import { Confirmed, formatWhen, Panel } from './Pieces';

function ReportRow({ report, onOpen }: { report: ReportItem; onOpen: () => void }) {
  const { t } = useTranslation('admin');
  const { colors, radius, spacing } = useTheme();
  const reason = t(`reason.${report.reason as 'SPAM'}`, { defaultValue: report.reason });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({
        gap: spacing[1],
        minHeight: 56,
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: pressed ? colors.surfaceOverlay : colors.surfaceRaised,
      })}
    >
      <Text variant="titleSm">
        {t(`reports.kind.${report.target_type}`)} · {report.target_label ?? t('reports.unknown')}
      </Text>
      <Text variant="bodySm">{reason}</Text>
      <Text variant="caption" tone="secondary">
        {t('reports.by', { name: report.reporter_name ?? t('reports.unknown') })} ·{' '}
        {formatWhen(report.created_at)}
        {report.status === 'OPEN' && report.open_for_target > 1
          ? ` · ${t('reports.openForTarget', { count: report.open_for_target })}`
          : ''}
      </Text>
    </Pressable>
  );
}

/** The queue: open reports, oldest first, then one page per decision (F-28: three taps from the list to a decision). */
export function ReportsPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [selected, setSelected] = useState<string | null>(null);
  const reports = useReports(status);
  const items = useMemo(
    () => reports.data?.pages.flatMap((page) => page.items) ?? [],
    [reports.data],
  );
  if (selected) {
    return <ReportDetail id={selected} onBack={() => setSelected(null)} onOpenUser={onOpenUser} />;
  }
  return (
    <View style={{ gap: spacing[3] }}>
      <SegmentedChoice
        label={t('admin:reports.status')}
        value={status}
        onChange={setStatus}
        options={[
          { value: 'OPEN', label: t('admin:reports.open') },
          { value: 'CLOSED', label: t('admin:reports.closed') },
        ]}
      />
      {reports.isError ? (
        <EmptyState
          title={t('admin:reports.loadFailed')}
          body={errorText(reports.error)}
          actionLabel={t('common:retry')}
          onAction={() => void reports.refetch()}
        />
      ) : reports.isPending ? (
        <Skeleton height={72} radiusKey="md" />
      ) : items.length === 0 ? (
        <Text tone="secondary">
          {t(status === 'OPEN' ? 'admin:reports.emptyOpen' : 'admin:reports.emptyClosed')}
        </Text>
      ) : (
        <View role="list" style={{ gap: spacing[2] }}>
          {items.map((report) => (
            <View key={report.id} role="listitem">
              <ReportRow report={report} onOpen={() => setSelected(report.id)} />
            </View>
          ))}
        </View>
      )}
      {reports.hasNextPage ? (
        <Button
          variant="secondary"
          label={t('admin:reports.loadMore')}
          loading={reports.isFetchingNextPage}
          loadingLabel={t('common:loading')}
          onPress={() => void reports.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

function ReportDetail({
  id,
  onBack,
  onOpenUser,
}: {
  id: string;
  onBack: () => void;
  onOpenUser: (id: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const report = useReport(id);
  const [note, setNote] = useState('');
  const resolve = useDecision(
    async (input: { outcome: 'ACTIONED' | 'DISMISSED'; before?: () => Promise<unknown> }) => {
      await input.before?.();
      await resolveReport(id, input.outcome, note);
    },
  );
  const run = (outcome: 'ACTIONED' | 'DISMISSED', before?: () => Promise<unknown>) =>
    resolve.mutate(
      { outcome, ...(before ? { before } : null) },
      {
        onSuccess: () => {
          toast.show(t('admin:reports.done'), 'success');
          onBack();
        },
      },
    );

  if (report.isError) {
    return (
      <EmptyState
        title={t('admin:reports.loadFailed')}
        body={errorText(report.error)}
        actionLabel={t('admin:reports.back')}
        onAction={onBack}
      />
    );
  }
  if (!report.data) return <Skeleton height={160} radiusKey="md" />;
  const r = report.data;
  const open = r.status === 'OPEN';
  const target = r.target;
  const noteReady = note.trim().length > 0;
  return (
    <View style={{ gap: spacing[3] }}>
      <Button variant="tertiary" label={t('admin:reports.back')} onPress={onBack} />
      {resolve.isError ? <Banner kind="danger" message={errorText(resolve.error)} /> : null}
      <Panel>
        <Text variant="title" heading={2}>
          {t(`admin:reports.kind.${r.target_type}`)} ·{' '}
          {r.target_label ?? t('admin:reports.unknown')}
        </Text>
        <Text>{t(`admin:reason.${r.reason as 'SPAM'}`, { defaultValue: r.reason })}</Text>
        <Text variant="caption" tone="secondary">
          {t('admin:reports.detailsLabel')}
        </Text>
        <Text>{r.details ?? t('admin:reports.noDetails')}</Text>
        <Text variant="caption" tone="secondary">
          {t('admin:reports.by', { name: r.reporter_name ?? t('admin:reports.unknown') })} ·{' '}
          {formatWhen(r.created_at)}
        </Text>
      </Panel>
      <Panel>
        <Text variant="label">{t('admin:reports.target')}</Text>
        {target === null ? (
          <Text tone="secondary">{t('admin:reports.targetGone')}</Text>
        ) : r.target_type === 'VENUE' ? (
          <Text>
            {target.name} · {t(`admin:reports.venueState.${target.listing_status ?? 'ACTIVE'}`)}
          </Text>
        ) : r.target_type === 'USER' ? (
          <>
            <Text>
              {target.name ?? t('admin:reports.unknown')} ·{' '}
              {t(`admin:users.state.${(target.account_status ?? 'ACTIVE') as 'ACTIVE'}`)}
            </Text>
            <Button
              variant="secondary"
              label={t('admin:reports.openTarget')}
              onPress={() => onOpenUser(target.id)}
            />
          </>
        ) : (
          <>
            <Text>{target.name}</Text>
            <Text variant="caption" tone="secondary">
              {target.starts_at
                ? `${t('admin:reports.starts')}: ${formatWhen(target.starts_at)} · `
                : ''}
              {t('admin:reports.places', {
                approved: target.approved_count ?? 0,
                capacity: target.capacity ?? 0,
              })}
            </Text>
            {target.organizer_id ? (
              <Button
                variant="secondary"
                label={t('admin:reports.organizer', {
                  name: target.organizer_name ?? t('admin:reports.unknown'),
                })}
                onPress={() => onOpenUser(target.organizer_id ?? '')}
              />
            ) : null}
          </>
        )}
      </Panel>
      {r.others.length > 0 ? (
        <Panel>
          <Text variant="label">{t('admin:reports.others')}</Text>
          {r.others.map((o) => (
            <Text key={o.id} variant="bodySm">
              {t(`admin:reason.${o.reason as 'SPAM'}`, { defaultValue: o.reason })} ·{' '}
              {o.reporter_name ?? t('admin:reports.unknown')}
              {o.details ? ` · ${o.details}` : ''}
            </Text>
          ))}
        </Panel>
      ) : null}
      {r.history.length > 0 ? (
        <Panel>
          <Text variant="label">{t('admin:reports.history')}</Text>
          {r.history.map((h) => (
            <Text key={h.id} variant="bodySm">
              {formatWhen(h.created_at)} ·{' '}
              {t(`admin:audit.action.${h.action as 'REPORT_RESOLVED'}`, { defaultValue: h.action })}
              {h.note ? ` · ${h.note}` : ''}
            </Text>
          ))}
        </Panel>
      ) : null}
      {open ? (
        <Panel>
          <TextField
            label={t('admin:reports.noteLabel')}
            hint={t('admin:reports.noteHint')}
            value={note}
            onChangeText={(value) => setNote(value.slice(0, 1000))}
            multiline
            maxLength={1000}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Confirmed
              label={t('admin:reports.dismiss')}
              pending={resolve.isPending}
              onConfirm={() => run('DISMISSED')}
            />
            <Confirmed
              label={t('admin:reports.close')}
              pending={resolve.isPending}
              onConfirm={() => run('ACTIONED')}
            />
            {target && r.target_type === 'USER' ? (
              <Confirmed
                variant="destructive"
                label={t('admin:reports.suspendClose')}
                disabled={!noteReady}
                pending={resolve.isPending}
                onConfirm={() => run('ACTIONED', () => suspendUser(target.id, note))}
              />
            ) : null}
            {target && r.target_type === 'VENUE' && target.listing_status !== 'HIDDEN' ? (
              <Confirmed
                variant="destructive"
                label={t('admin:reports.hideVenueClose')}
                pending={resolve.isPending}
                onConfirm={() => run('ACTIONED', () => setVenueStatus(target.id, 'HIDE', note))}
              />
            ) : null}
            {target && r.target_type === 'EVENT' ? (
              <Confirmed
                variant="destructive"
                label={t('admin:reports.cancelClose')}
                disabled={!noteReady}
                pending={resolve.isPending}
                onConfirm={() => run('ACTIONED', () => cancelEvent(target.id, note))}
              />
            ) : null}
          </View>
        </Panel>
      ) : null}
    </View>
  );
}
