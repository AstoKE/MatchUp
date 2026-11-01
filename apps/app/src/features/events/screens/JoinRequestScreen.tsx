import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { localizedName, useCatalog, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
  Select,
  Text,
  TextField,
  useTheme,
} from '@/ui';
import type { EventDetails } from '../api/events-api';
import { EventSummaryPanel } from '../components/EventSummaryPanel';
import { useEvent, useMyParticipation, useRequestJoin } from '../hooks';
import { canRequestToJoin } from '../join-state';

const MESSAGE_MAX = 280;

/**
 * Review the event and send the request (docs/design.md §5.3). Everything optional stays optional and no consent is asked
 * again. Anyone who cannot request (a deep link, a stale page) is sent back to the event page, which explains why; the
 * server checks all of it again and `request_join` is idempotent.
 */
export function JoinRequestScreen() {
  const { t } = useTranslation(['events', 'common', 'errors']);
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const params = useLocalSearchParams<{ id: string; invite?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const inviteToken = typeof params.invite === 'string' ? params.invite : null;
  const signedIn = session.status === 'authenticated';
  const event = useEvent(id, inviteToken);
  const catalog = useCatalog();
  const mine = useMyParticipation(id, signedIn);
  // Read the clock once per visit; the server decides.
  const [openedAt] = useState(Date.now);
  const eventPage = {
    pathname: '/e/[id]' as const,
    params: inviteToken ? { id, invite: inviteToken } : { id },
  };
  // Sending refreshes the participation, which would then count as "already asked" and send the player away before the
  // form could open the status page. From the first send on, the form decides where to go.
  const [sending, setSending] = useState(false);
  const blocked =
    !sending &&
    Boolean(event.data) &&
    !mine.isPending &&
    !canRequestToJoin(event.data as EventDetails, mine.data ?? null, openedAt);

  useEffect(() => {
    if (!signedIn && session.status !== 'loading') {
      router.replace({ pathname: '/sign-in', params: { returnTo: pathname } });
    } else if (signedIn && blocked) {
      router.replace(eventPage);
    }
    // eventPage is rebuilt each render from these same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, session.status, blocked]);

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
  if (!event.isPending && !event.data) {
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
  if (!signedIn || !event.data || !catalog.data || mine.isPending || blocked) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  return (
    <Form
      event={event.data}
      catalog={catalog.data}
      inviteToken={inviteToken}
      onSending={setSending}
    />
  );
}

function Form({
  event,
  catalog,
  inviteToken,
  onSending,
}: {
  event: EventDetails;
  catalog: Catalog;
  inviteToken: string | null;
  onSending: (sending: boolean) => void;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const locale = currentLocale();
  const join = useRequestJoin();
  const [message, setMessage] = useState('');
  const [positionId, setPositionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const full = event.approvedCount >= event.capacity;

  return (
    <Screen
      maxWidth={640}
      footer={
        <Button
          label={t(full ? 'events:join.joinWaitlist' : 'events:join.send')}
          loading={join.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => {
            setError(null);
            onSending(true);
            join.mutate(
              { eventId: event.id, message: message.trim() || null, positionId, inviteToken },
              {
                // The next screen reads the outcome from the server, not from here.
                onSuccess: () =>
                  router.replace({
                    pathname: '/e/[id]/requested',
                    params: inviteToken ? { id: event.id, invite: inviteToken } : { id: event.id },
                  }),
                onError: (failure) => {
                  onSending(false);
                  setError(errorText(failure));
                },
              },
            );
          }}
          fullWidth
        />
      }
    >
      <ScreenHeader
        title={t('events:join.confirmTitle')}
        backLabel={t('events:detail.backToDiscover')}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/e/[id]', params: { id: event.id } })
        }
      />
      {error ? <Banner kind="danger" message={error} /> : null}
      <EventSummaryPanel event={event} catalog={catalog} />
      <Text tone="secondary">
        {event.autoApprove && !full
          ? t('events:join.autoApproveNote')
          : full
            ? t('events:join.waitlistNote')
            : t('events:join.approvalNote')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('events:join.disclosure')}
      </Text>
      <TextField
        label={t('events:join.message')}
        hint={t('events:join.messageHint', { max: MESSAGE_MAX })}
        value={message}
        onChangeText={(value) => setMessage(value.slice(0, MESSAGE_MAX))}
        multiline
        maxLength={MESSAGE_MAX}
      />
      {sport && sport.positions.length > 0 ? (
        <Select
          label={t('events:join.position')}
          placeholder={t('events:join.positionPlaceholder')}
          noneLabel={t('events:join.positionNone')}
          options={sport.positions.map((p) => ({
            value: p.id,
            label: localizedName(p.names, locale),
          }))}
          value={positionId}
          onChange={setPositionId}
        />
      ) : null}
    </Screen>
  );
}
