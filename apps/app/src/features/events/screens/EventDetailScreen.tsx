import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { localizedName, useCatalog, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Banner, Button, EmptyState, Screen, Text, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { formatCost, formatEventStart } from '../format';
import { useCompleteEvent, useDeleteDraft, useEvent, usePublishEvent } from '../hooks';

/**
 * Event detail at /e/<id>, open to guests (D-09): RLS decides what they see. Phase 3 / M2 builds the
 * organizer's actions; the join button and organizer line arrive with participation and discovery.
 */
export function EventDetailScreen() {
  const { t } = useTranslation(['events', 'common', 'errors', 'nav']);
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const event = useEvent(id);
  const catalog = useCatalog();

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
  if (!event.data) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('errors:NOT_FOUND')}
          actionLabel={t('nav:discover')}
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }
  return <Detail event={event.data} catalog={catalog.data} />;
}

function Row({ label, value }: { label: string; value: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[1] }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

function Detail({ event, catalog }: { event: EventDetails; catalog: Catalog }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const locale = currentLocale();
  const publish = usePublishEvent();
  const complete = useCompleteEvent();
  const remove = useDeleteDraft();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Read the clock once per visit (render must stay pure); actions revalidate on the server anyway.
  const [openedAt] = useState(Date.now);

  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const districtName = district ? localizedName(district.names, locale) : '';
  const isOrganizer = session.status === 'authenticated' && session.userId === event.organizerId;
  const started = openedAt >= Date.parse(event.startsAt);
  const place = event.private?.placeLabel ?? event.publicPlaceLabel;
  const fail = (failure: unknown) => setError(errorText(failure));

  return (
    <Screen maxWidth={640}>
      <View style={{ gap: spacing[2] }}>
        <Text variant="caption" tone="secondary">
          {[
            sport && localizedName(sport.names, locale),
            format && localizedName(format.names, locale),
            t(`events:status.${event.status}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text variant="headline" heading={1}>
          {event.title}
        </Text>
      </View>
      {event.status === 'CANCELED' && event.cancelReason ? (
        <Banner
          kind="warning"
          message={[
            t('events:detail.canceledBecause', {
              reason: t(`events:cancelReason.${event.cancelReason}`),
            }),
            event.cancelMessage,
          ]
            .filter(Boolean)
            .join(' — ')}
        />
      ) : null}
      {error ? <Banner kind="danger" message={error} /> : null}

      <View style={{ gap: spacing[4] }}>
        <Row
          label={t('events:detail.when')}
          value={`${formatEventStart(event.startsAt, timeZone, locale)} · ${t('events:detail.durationValue', { count: event.durationMinutes })}`}
        />
        <Row
          label={t('events:detail.where')}
          value={
            place
              ? [districtName, place, event.private?.addressText].filter(Boolean).join(' · ')
              : t('events:detail.whereHidden', { district: districtName })
          }
        />
        <Row
          label={t('events:detail.capacity')}
          value={t('events:detail.capacityValue', {
            approved: event.approvedCount,
            capacity: event.capacity,
          })}
        />
        <Row
          label={t('events:detail.skill')}
          value={
            event.skillMin === null && event.skillMax === null
              ? t('events:detail.skillAny')
              : t('events:detail.skillRange', {
                  min: event.skillMin ?? 1,
                  max: event.skillMax ?? 5,
                })
          }
        />
        {event.costAmountMinor !== null ? (
          <Row
            label={t('events:detail.cost')}
            value={[
              t('events:detail.costValue', { amount: formatCost(event.costAmountMinor, locale) }),
              event.costNote,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        <Row
          label={t('events:detail.booking')}
          value={t(`events:booking.${event.bookingStatus}`)}
        />
        {event.equipmentNote ? (
          <Row label={t('events:detail.equipment')} value={event.equipmentNote} />
        ) : null}
        {event.private?.participantNotes ? (
          <Row label={t('events:detail.notes')} value={event.private.participantNotes} />
        ) : null}
        {event.description ? <Text>{event.description}</Text> : null}
        {event.visibility === 'INVITE_ONLY' ? (
          <Text variant="caption" tone="secondary">
            {t('events:detail.visibilityInvite')}
          </Text>
        ) : null}
      </View>

      {isOrganizer ? (
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
          {event.status === 'PUBLISHED' && !started ? (
            <Button
              variant="destructive"
              label={t('events:detail.cancel')}
              onPress={() => router.push({ pathname: '/e/[id]/cancel', params: { id: event.id } })}
              fullWidth
            />
          ) : null}
          {event.status === 'PUBLISHED' && started ? (
            <Button
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
              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
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
      ) : null}
    </Screen>
  );
}
