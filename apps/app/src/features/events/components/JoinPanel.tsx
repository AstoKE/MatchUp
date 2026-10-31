import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Text, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { useCancelParticipation, useMyParticipation } from '../hooks';
import { MAX_REQUESTS } from '../join-state';
import { Pill } from './SlotMeter';

/**
 * The player's one dominant action on an event (design.md §9): the label and meaning follow the state,
 * not just the colour. The server decides everything (capacity, who may ask, the three-request limit);
 * this panel only mirrors what it answers. Guests are sent to sign in and come back here.
 */
export function JoinPanel({
  event,
  inviteToken = null,
}: {
  event: EventDetails;
  /** From the shared link of an invite-only event. */
  inviteToken?: string | null;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const session = useSession();
  const signedIn = session.status === 'authenticated';
  const mine = useMyParticipation(event.id, signedIn);
  const withdraw = useCancelParticipation();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Button
        label={t('events:join.signInToJoin')}
        onPress={() => router.push({ pathname: '/sign-in', params: { returnTo: pathname } })}
        fullWidth
      />
    );
  }
  if (mine.isPending) return null;

  const status = mine.data?.status ?? null;
  const full = event.approvedCount >= event.capacity;
  const fail = (failure: unknown) => setError(errorText(failure));

  const withdrawButton = (label: string) => (
    <Button
      variant="secondary"
      label={label}
      loading={withdraw.isPending}
      loadingLabel={t('common:loading')}
      onPress={() => {
        setError(null);
        withdraw.mutate(event.id, {
          onSuccess: () => toast.show(t('events:join.withdrawn'), 'success'),
          onError: fail,
        });
      }}
      fullWidth
    />
  );

  if (status === 'REQUESTED' || status === 'WAITLISTED' || status === 'APPROVED') {
    return (
      <View style={{ gap: spacing[3] }}>
        {error ? <Banner kind="danger" message={error} /> : null}
        <Pill
          label={t(`events:join.state.${status}`)}
          tone={status === 'APPROVED' ? 'success' : 'warning'}
        />
        <Text tone="secondary">{t(`events:join.stateHint.${status}`)}</Text>
        {withdrawButton(t(status === 'APPROVED' ? 'events:join.leave' : 'events:join.withdraw'))}
      </View>
    );
  }
  if (status === 'REJECTED' || status === 'REMOVED') {
    // No reason is ever shown: the organizer's decision is theirs, and it is final for this event.
    return <Banner kind="info" message={t('events:join.unavailable')} />;
  }
  if (status === 'CANCELED' && (mine.data?.requestCount ?? 0) >= MAX_REQUESTS) {
    return <Banner kind="info" message={t('events:join.limitReached')} />;
  }
  if (full && !event.waitlistEnabled) {
    return <Banner kind="info" message={t('events:join.fullNoWaitlist')} />;
  }

  return (
    <Button
      label={t(full ? 'events:join.joinWaitlist' : 'events:join.request')}
      onPress={() =>
        router.push({
          pathname: '/e/[id]/join',
          params: inviteToken ? { id: event.id, invite: inviteToken } : { id: event.id },
        })
      }
      fullWidth
    />
  );
}
