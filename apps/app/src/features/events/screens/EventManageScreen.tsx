import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, EmptyState, Screen, ScreenHeader, Text, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { InvitePanel } from '../components/InvitePanel';
import { LazyAttendancePanel, LazyRequestsPanel } from '../components/LazyPanels';
import { useCompleteEvent, useDeleteDraft, useEvent, usePublishEvent } from '../hooks';

/**
 * Everything the organizer does with an event (docs/design.md §5.7), one tap from its page. Who may reach this is the
 * server's call: `get_event` says who the organizer is and every action checks again. Anyone else goes back to the page.
 */
export function EventManageScreen() {
  const { t } = useTranslation(['events', 'common', 'errors']);
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const event = useEvent(id);
  // A canceled event has nothing left to manage, and its page explains why.
  const elsewhere =
    event.isSuccess &&
    event.data !== null &&
    (!event.data.isOrganizer || event.data.status === 'CANCELED');

  useEffect(() => {
    if (elsewhere) router.replace({ pathname: '/e/[id]', params: { id } });
  }, [elsewhere, id, router]);

  if (event.isError) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('events:detail.loadFailed')}
          body={errorText(event.error)}
          actionLabel={t('common:retry')}
          onAction={() => void event.refetch()}
        />
      </Screen>
    );
  }
  if (event.isSuccess && !event.data) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('errors:NOT_FOUND')}
          actionLabel={t('events:detail.backToDiscover')}
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }
  if (!event.data || elsewhere) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  return <Manage event={event.data} />;
}

function Manage({ event }: { event: EventDetails }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const publish = usePublishEvent();
  const complete = useCompleteEvent();
  const remove = useDeleteDraft();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Read the clock once per visit (render must stay pure); actions revalidate on the server anyway.
  const [openedAt] = useState(Date.now);
  const started = openedAt >= Date.parse(event.startsAt);
  const fail = (failure: unknown) => setError(errorText(failure));

  return (
    <Screen maxWidth={640}>
      <ScreenHeader
        title={t('events:manage.title')}
        backLabel={t('events:detail.backToDiscover')}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/e/[id]', params: { id: event.id } })
        }
      >
        <Text tone="secondary">
          {[event.title, t(`events:status.${event.status}`)].join(' · ')}
        </Text>
        <Text variant="bodySm" tone="secondary">
          {t('events:detail.capacityValue', {
            approved: event.approvedCount,
            capacity: event.capacity,
          })}
        </Text>
      </ScreenHeader>
      {error ? <Banner kind="danger" message={error} /> : null}

      {event.status === 'PUBLISHED' ? <LazyRequestsPanel event={event} /> : null}
      {started && (event.status === 'PUBLISHED' || event.status === 'COMPLETED') ? (
        <LazyAttendancePanel eventId={event.id} isOrganizer />
      ) : null}
      {event.inviteToken ? <InvitePanel eventId={event.id} token={event.inviteToken} /> : null}

      <View style={{ gap: spacing[3] }}>
        {event.status === 'DRAFT' ? (
          <Button
            label={t('events:detail.publish')}
            loading={publish.isPending}
            loadingLabel={t('events:create.publishing')}
            onPress={() => {
              setError(null);
              publish.mutate(event.id, {
                onSuccess: () => toast.show(t('events:detail.publishedToast'), 'success'),
                onError: fail,
              });
            }}
            fullWidth
          />
        ) : null}
        {event.status === 'DRAFT' || (event.status === 'PUBLISHED' && !started) ? (
          <Button
            variant="secondary"
            label={t('events:detail.edit')}
            onPress={() => router.push({ pathname: '/e/[id]/edit', params: { id: event.id } })}
            fullWidth
          />
        ) : null}
        {event.status === 'PUBLISHED' && started ? (
          <Button
            variant="secondary"
            label={t('events:detail.complete')}
            loading={complete.isPending}
            loadingLabel={t('common:loading')}
            onPress={() => {
              setError(null);
              complete.mutate(event.id, {
                onSuccess: () => toast.show(t('events:detail.completedToast'), 'success'),
                onError: fail,
              });
            }}
            fullWidth
          />
        ) : null}
        {event.status === 'PUBLISHED' && !started ? (
          <Button
            variant="destructive"
            label={t('events:detail.cancel')}
            onPress={() => router.push({ pathname: '/e/[id]/cancel', params: { id: event.id } })}
            fullWidth
          />
        ) : null}
        {event.status === 'DRAFT' && !confirmingDelete ? (
          <Button
            variant="tertiary"
            label={t('events:detail.deleteDraft')}
            onPress={() => setConfirmingDelete(true)}
          />
        ) : null}
        {event.status === 'DRAFT' && confirmingDelete ? (
          <View style={{ gap: spacing[2] }}>
            <Text role="alert">{t('events:detail.confirmDelete')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
              <Button
                variant="destructive"
                label={t('events:detail.confirmDeleteYes')}
                loading={remove.isPending}
                loadingLabel={t('common:loading')}
                onPress={() =>
                  remove.mutate(event.id, {
                    onSuccess: () => {
                      toast.show(t('events:detail.deleted'), 'success');
                      router.replace('/create');
                    },
                    onError: fail,
                  })
                }
              />
              <Button
                variant="secondary"
                label={t('events:detail.keep')}
                onPress={() => setConfirmingDelete(false)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
