import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, EmptyState, Skeleton, Text, useTheme } from '@/ui';
import type { EventDetails } from '../api/events-api';
import type { EventRequest, OrganizerDecision } from '../api/participation-api';
import { useDecideParticipation, useEventRequests } from '../hooks';

const GROUPS = [
  { status: 'REQUESTED', title: 'events:requests.pending' },
  { status: 'WAITLISTED', title: 'events:requests.waitlist' },
  { status: 'APPROVED', title: 'events:requests.approved' },
] as const;

/**
 * The organizer's queue on the event page: approve, reject, put on the waitlist or remove. The server
 * checks everything again (organizer, capacity, state); the buttons just do not offer what cannot work.
 * Waitlist promotion is always an explicit tap here, never automatic.
 */
export function RequestsPanel({ event }: { event: EventDetails }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const requests = useEventRequests(event.id, true);
  const decide = useDecideParticipation(event.id);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const full = event.approvedCount >= event.capacity;

  if (requests.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
        <Skeleton height={96} radiusKey="lg" />
      </View>
    );
  }
  if (requests.isError) {
    return (
      <EmptyState
        title={t('events:requests.loadFailed')}
        body={errorText(requests.error)}
        actionLabel={t('common:retry')}
        onAction={() => void requests.refetch()}
      />
    );
  }

  const act = (request: EventRequest, decision: OrganizerDecision) => {
    setError(null);
    decide.mutate(
      { participationId: request.id, decision },
      {
        onSuccess: () => setConfirmRemove(null),
        onError: (failure) => setError(errorText(failure)),
      },
    );
  };
  const items = requests.data;

  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('events:requests.title')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      {items.length === 0 ? <Text tone="secondary">{t('events:requests.empty')}</Text> : null}
      {GROUPS.map(({ status, title }) => {
        const rows = items.filter((r) => r.status === status);
        if (rows.length === 0) return null;
        return (
          <View key={status} role="list" style={{ gap: spacing[3] }}>
            <Text variant="label" tone="secondary">
              {t(title, { count: rows.length })}
            </Text>
            {rows.map((request) => (
              <View key={request.id} role="listitem">
                <RequestRow
                  request={request}
                  full={full}
                  waitlistEnabled={event.waitlistEnabled}
                  busy={decide.isPending}
                  confirming={confirmRemove === request.id}
                  onAsk={() => setConfirmRemove(request.id)}
                  onKeep={() => setConfirmRemove(null)}
                  onDecide={(decision) => act(request, decision)}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function RequestRow({
  request,
  full,
  waitlistEnabled,
  busy,
  confirming,
  onAsk,
  onKeep,
  onDecide,
}: {
  request: EventRequest;
  full: boolean;
  waitlistEnabled: boolean;
  busy: boolean;
  confirming: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onDecide: (decision: OrganizerDecision) => void;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { colors, radius, spacing } = useTheme();
  const name = request.displayName ?? t('events:requests.unnamed');
  return (
    <View
      style={{
        gap: spacing[2],
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="titleSm">{name}</Text>
      <Text variant="caption" tone="secondary">
        {[
          request.level !== null ? t('events:requests.level', { level: request.level }) : null,
          request.requestCount > 1
            ? t('events:requests.attempt', { count: request.requestCount })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {request.message ? <Text>{request.message}</Text> : null}
      {request.status !== 'APPROVED' ? (
        <View style={{ gap: spacing[2] }}>
          {full ? (
            <Text variant="caption" tone="secondary">
              {t('events:requests.fullHint')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              label={t('events:requests.approve')}
              disabled={full || busy}
              onPress={() => onDecide('approve')}
            />
            {request.status === 'REQUESTED' && waitlistEnabled ? (
              <Button
                variant="secondary"
                label={t('events:requests.toWaitlist')}
                disabled={busy}
                onPress={() => onDecide('waitlist')}
              />
            ) : null}
            <Button
              variant="secondary"
              label={t('events:requests.reject')}
              disabled={busy}
              onPress={() => onDecide('reject')}
            />
          </View>
        </View>
      ) : confirming ? (
        <View style={{ gap: spacing[2] }}>
          <Text role="alert">{t('events:requests.confirmRemove', { name })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              variant="destructive"
              label={t('events:requests.removeYes')}
              disabled={busy}
              onPress={() => onDecide('remove')}
            />
            <Button variant="secondary" label={t('events:detail.keep')} onPress={onKeep} />
          </View>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="tertiary" label={t('events:requests.remove')} onPress={onAsk} />
        </View>
      )}
    </View>
  );
}
