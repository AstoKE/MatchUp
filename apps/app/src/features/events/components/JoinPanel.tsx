import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { localizedName, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Banner, Button, Select, Text, TextField, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { useCancelParticipation, useMyParticipation, useRequestJoin } from '../hooks';
import { Pill } from './SlotMeter';

const MESSAGE_MAX = 280;
const MAX_REQUESTS = 3;

/**
 * The player's one dominant action on an event (design.md §9): the label and meaning follow the state,
 * not just the colour. The server decides everything (capacity, who may ask, the three-request limit);
 * this panel only mirrors what it answers. Guests are sent to sign in and come back here.
 */
export function JoinPanel({
  event,
  catalog,
  inviteToken = null,
}: {
  event: EventDetails;
  catalog: Catalog;
  /** From the shared link of an invite-only event. */
  inviteToken?: string | null;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const session = useSession();
  const locale = currentLocale();
  const signedIn = session.status === 'authenticated';
  const mine = useMyParticipation(event.id, signedIn);
  const join = useRequestJoin();
  const withdraw = useCancelParticipation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [positionId, setPositionId] = useState<string | null>(null);
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
  const sport = catalog.sports.find((s) => s.id === event.sportId);
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

  if (!open) {
    return (
      <Button
        label={t(full ? 'events:join.joinWaitlist' : 'events:join.request')}
        onPress={() => setOpen(true)}
        fullWidth
      />
    );
  }
  return (
    <View style={{ gap: spacing[3] }}>
      {error ? <Banner kind="danger" message={error} /> : null}
      <Text tone="secondary">{t('events:join.disclosure')}</Text>
      {event.autoApprove && !full ? (
        <Text variant="caption" tone="secondary">
          {t('events:join.autoApproveNote')}
        </Text>
      ) : null}
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
      <Button
        label={t(full ? 'events:join.joinWaitlist' : 'events:join.send')}
        loading={join.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => {
          setError(null);
          join.mutate(
            { eventId: event.id, message: message.trim() || null, positionId, inviteToken },
            {
              onSuccess: (result) => {
                setOpen(false);
                setMessage('');
                toast.show(t(`events:join.result.${result}`), 'success');
              },
              onError: fail,
            },
          );
        }}
        fullWidth
      />
      <Button variant="tertiary" label={t('common:cancel')} onPress={() => setOpen(false)} />
    </View>
  );
}
