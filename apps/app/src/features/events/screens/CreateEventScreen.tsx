import { toEventInput } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog, type Catalog } from '@/features/catalog';
import { RequireOnboarded } from '@/features/onboarding';
import { useMyProfile } from '@/features/profile';
import { errorText } from '@/lib/error-text';
import { newRequestId } from '@/lib/request-id';
import { EmptyState, Screen, useTheme, useToast } from '@/ui';
import { readStoredCity, startingCityId } from '../city-preference';
import { LazyEventStepper } from '../components/LazyEventStepper';
import { emptyDraft } from '../draft';
import { useCreateEvent } from '../hooks';

export function CreateEventScreen() {
  return (
    <RequireOnboarded>
      <CreateEvent />
    </RequireOnboarded>
  );
}

function CreateEvent() {
  const { t } = useTranslation(['events', 'common']);
  const { colors } = useTheme();
  const catalog = useCatalog();
  const profile = useMyProfile();
  // The starting province comes from the profile, so the form waits for it (it is cached after onboarding).
  if (catalog.isPending || (profile.isPending && profile.fetchStatus !== 'idle')) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  if (catalog.isError) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('events:create.loadFailed')}
          body={errorText(catalog.error)}
          actionLabel={t('common:retry')}
          onAction={() => void catalog.refetch()}
        />
      </Screen>
    );
  }
  return <CreateForm catalog={catalog.data} profileCityId={profile.data?.cityId ?? null} />;
}

function CreateForm({
  catalog,
  profileCityId,
}: {
  catalog: Catalog;
  profileCityId: string | null;
}) {
  const { t } = useTranslation('events');
  const router = useRouter();
  const toast = useToast();
  const create = useCreateEvent();
  // One id per form: a retry after a lost response returns the same event instead of a duplicate.
  const [clientRequestId] = useState(newRequestId);
  const [initial] = useState(() =>
    emptyDraft(catalog, new Date(), startingCityId(catalog, profileCityId, readStoredCity())),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);

  return (
    <LazyEventStepper
      catalog={catalog}
      initial={initial}
      title={t('create.title')}
      locked={false}
      submitError={submitError}
      busy={busy}
      mode="create"
      onSubmit={(draft, timeZone, publish) => {
        setSubmitError(null);
        setBusy(publish ? 'publish' : 'draft');
        create.mutate(
          { clientRequestId, input: toEventInput(draft, timeZone), publish },
          {
            onSuccess: (id) => {
              toast.show(t(publish ? 'create.published' : 'create.draftSaved'), 'success');
              router.replace({ pathname: '/e/[id]', params: { id } });
            },
            onError: (error) => setSubmitError(errorText(error)),
            onSettled: () => setBusy(null),
          },
        );
      }}
    />
  );
}
