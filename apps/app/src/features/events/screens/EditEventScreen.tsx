import { toEventInput } from '@matchup/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog, type Catalog } from '@/features/catalog';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { EmptyState, Screen, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { EventStepper } from '../components/EventStepper';
import { draftFromEvent } from '../draft';
import { useEvent, useUpdateEvent } from '../hooks';

export function EditEventScreen() {
  return (
    <RequireOnboarded>
      <EditEvent />
    </RequireOnboarded>
  );
}

function EditEvent() {
  const { t } = useTranslation(['events', 'common']);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const event = useEvent(id);
  const catalog = useCatalog();
  const [openedAt] = useState(Date.now);

  if (event.isPending || catalog.isPending) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  if (event.isError || catalog.isError) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('events:detail.loadFailed')}
          body={errorText(event.error ?? catalog.error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void event.refetch();
            void catalog.refetch();
          }}
        />
      </Screen>
    );
  }
  // Only the organizer gets the private details, and only open events can be edited.
  const editable =
    event.data?.private !== null &&
    (event.data?.status === 'DRAFT' ||
      (event.data?.status === 'PUBLISHED' && openedAt < Date.parse(event.data.startsAt)));
  if (!event.data || !editable) {
    return (
      <Screen maxWidth={640}>
        <EmptyState title={t('events:detail.notFound')} />
      </Screen>
    );
  }
  return <EditForm event={event.data} catalog={catalog.data} />;
}

function EditForm({ event, catalog }: { event: EventDetails; catalog: Catalog }) {
  const { t } = useTranslation('events');
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateEvent();
  const timeZone = catalog.cities.find((c) => c.id === event.cityId)?.timeZone ?? 'Europe/Istanbul';
  const [initial] = useState(() => draftFromEvent(event, timeZone));
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <EventStepper
      catalog={catalog}
      initial={initial}
      title={t('edit.title')}
      locked={event.status === 'PUBLISHED'}
      // Moving a published event re-applies the lead-time rule; an unchanged start does not.
      publishOnSaveIf={(draft) =>
        event.status === 'PUBLISHED' && (draft.date !== initial.date || draft.time !== initial.time)
      }
      submitError={submitError}
      busy={update.isPending ? 'save' : null}
      mode="edit"
      onSubmit={(draft, zone) => {
        setSubmitError(null);
        update.mutate(
          { id: event.id, input: toEventInput(draft, zone) },
          {
            onSuccess: () => {
              toast.show(t('edit.saved'), 'success');
              // Back to the detail underneath (it refetches); a fresh one only after a deep link.
              if (router.canGoBack()) router.back();
              else router.replace({ pathname: '/e/[id]', params: { id: event.id } });
            },
            onError: (error) => setSubmitError(errorText(error)),
          },
        );
      }}
    />
  );
}
