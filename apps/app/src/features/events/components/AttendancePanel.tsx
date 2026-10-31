import { useState } from 'react';
import { View } from 'react-native';
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
import type { Attendance, EventAttendance } from '../api/attendance-api';
import {
  useDisputeAttendance,
  useEventAttendance,
  useFinalizeAttendance,
  useMarkAttendance,
} from '../hooks';

const MAX_REASON = 500;

/**
 * After the start: the organizer marks who came and freezes the marks; a player sees the final mark on
 * their own row and can dispute an ABSENT. The server checks all of it again (RATING_SYSTEM §2, §4.3).
 */
export function AttendancePanel({
  eventId,
  isOrganizer,
}: {
  eventId: string;
  isOrganizer: boolean;
}) {
  const { t } = useTranslation(['events', 'common']);
  const attendance = useEventAttendance(eventId, true);

  if (attendance.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
        <Skeleton height={96} radiusKey="lg" />
      </View>
    );
  }
  if (attendance.isError) {
    return (
      <EmptyState
        title={t('events:attendance.loadFailed')}
        body={errorText(attendance.error)}
        actionLabel={t('common:retry')}
        onAction={() => void attendance.refetch()}
      />
    );
  }
  return isOrganizer ? (
    <OrganizerAttendance eventId={eventId} data={attendance.data} />
  ) : (
    <MyAttendance eventId={eventId} data={attendance.data} />
  );
}

function OrganizerAttendance({ eventId, data }: { eventId: string; data: EventAttendance }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const mark = useMarkAttendance(eventId);
  const finalize = useFinalizeAttendance(eventId);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const roster = data.roster ?? [];
  const frozen = data.finalizedAt !== null;
  const unmarked = roster.filter((p) => !p.isOrganizer && p.attendance === 'NOT_CONFIRMED').length;
  const players = roster.filter((p) => !p.isOrganizer);

  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('events:attendance.title')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      {frozen ? <Banner kind="success" message={t('events:attendance.finalized')} /> : null}
      {players.length === 0 ? (
        <Text tone="secondary">{t('events:attendance.noPlayers')}</Text>
      ) : null}
      {players.length > 0 ? (
        <View role="list" style={{ gap: spacing[4] }}>
          {players.map((p) => {
            const name = p.displayName ?? t('events:requests.unnamed');
            return (
              <View key={p.participationId} role="listitem">
                {frozen || p.attendance === 'DISPUTED' ? (
                  <Text>
                    {t('events:attendance.row', {
                      name,
                      status: t(`events:attendance.status.${p.attendance}`),
                    })}
                  </Text>
                ) : (
                  <SegmentedChoice<Attendance>
                    label={name}
                    value={p.attendance}
                    options={[
                      { value: 'PRESENT', label: t('events:attendance.status.PRESENT') },
                      { value: 'ABSENT', label: t('events:attendance.status.ABSENT') },
                    ]}
                    onChange={(value) => {
                      if (value !== 'PRESENT' && value !== 'ABSENT') return;
                      setError(null);
                      mark.mutate(
                        { participationId: p.participationId, value },
                        { onError: (failure) => setError(errorText(failure)) },
                      );
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {!frozen && !confirming ? (
        <Button
          label={t('events:attendance.finalize')}
          onPress={() => setConfirming(true)}
          fullWidth
        />
      ) : null}
      {!frozen && confirming ? (
        <View style={{ gap: spacing[2] }}>
          <Text role="alert">
            {unmarked > 0
              ? t('events:attendance.confirmUnmarked', { count: unmarked })
              : t('events:attendance.confirm')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              label={t('events:attendance.finalizeYes')}
              loading={finalize.isPending}
              loadingLabel={t('common:loading')}
              onPress={() => {
                setError(null);
                finalize.mutate(eventId, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.show(t('events:attendance.finalizedToast'), 'success');
                  },
                  onError: (failure) => setError(errorText(failure)),
                });
              }}
            />
            <Button
              variant="secondary"
              label={t('events:detail.keep')}
              onPress={() => setConfirming(false)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MyAttendance({ eventId, data }: { eventId: string; data: EventAttendance }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const dispute = useDisputeAttendance(eventId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Read the clock once per visit; the server has the last word on the window.
  const [openedAt] = useState(Date.now);
  const my = data.my;
  if (!my || my.isOrganizer) return null;
  if (data.finalizedAt === null) {
    return <Text tone="secondary">{t('events:attendance.waiting')}</Text>;
  }
  const canDispute =
    my.attendance === 'ABSENT' &&
    data.disputeClosesAt !== null &&
    openedAt < Date.parse(data.disputeClosesAt);
  const trimmed = reason.trim();

  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="title" heading={2}>
        {t('events:attendance.mineTitle')}
      </Text>
      <Text>{t(`events:attendance.mine.${my.attendance}`)}</Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      {canDispute && !open ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            label={t('events:attendance.dispute')}
            onPress={() => setOpen(true)}
          />
        </View>
      ) : null}
      {canDispute && open ? (
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('events:attendance.disputeReason')}
            hint={t('events:attendance.disputeHint')}
            value={reason}
            onChangeText={setReason}
            maxLength={MAX_REASON}
            multiline
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              label={t('events:attendance.disputeSend')}
              disabled={trimmed.length === 0}
              loading={dispute.isPending}
              loadingLabel={t('common:loading')}
              onPress={() => {
                setError(null);
                dispute.mutate(
                  { participationId: my.participationId, reason: trimmed },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      toast.show(t('events:attendance.disputedToast'), 'success');
                    },
                    onError: (failure) => setError(errorText(failure)),
                  },
                );
              }}
            />
            <Button
              variant="secondary"
              label={t('events:detail.keep')}
              onPress={() => setOpen(false)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
