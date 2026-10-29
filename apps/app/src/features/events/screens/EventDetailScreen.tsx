import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { localizedName, useCatalog, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Banner, Button, EmptyState, Screen, SportBadge, Text, useTheme, useToast } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { JoinPanel } from '../components/JoinPanel';
import { RequestsPanel } from '../components/RequestsPanel';
import { Pill, SlotMeter } from '../components/SlotMeter';
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

function Row({ label, value, large }: { label: string; value: string; large?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[1] }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant={large ? 'titleSm' : 'body'}>{value}</Text>
    </View>
  );
}

/** A raised group of facts; the outline keeps it visible in both themes without a shadow. */
function Card({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing[4],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {children}
    </View>
  );
}

function Detail({ event, catalog }: { event: EventDetails; catalog: Catalog }) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing, breakpoint } = useTheme();
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
  // Time pressure only matters for an event people can still join (design.md §4.2 rule 4).
  const joinable = event.status === 'PUBLISHED' && !started;
  // On a phone the join action is pinned under the content (design.md §8: the thumb zone); the request
  // form that opens from it scrolls inside the pinned area so it never covers the whole page.
  const stickyJoin = breakpoint === 'compact';
  const joinPanel =
    !isOrganizer && joinable ? (
      stickyJoin ? (
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          <JoinPanel event={event} catalog={catalog} />
        </ScrollView>
      ) : (
        <JoinPanel event={event} catalog={catalog} />
      )
    ) : null;
  const openSlots = event.capacity - event.approvedCount;
  const urgency = !joinable
    ? null
    : openSlots === 1
      ? t('events:detail.lastSpot')
      : Date.parse(event.startsAt) - openedAt < 2 * 3_600_000
        ? t('events:detail.startsSoon')
        : null;

  return (
    <Screen maxWidth={640} footer={joinPanel && stickyJoin ? joinPanel : undefined}>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          variant="tertiary"
          label={t('events:detail.backToDiscover')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Pill
            icon={<SportBadge slug={sport?.slug} size={24} />}
            label={[
              sport && localizedName(sport.names, locale),
              format && localizedName(format.names, locale),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Pill
            label={t(`events:status.${event.status}`)}
            tone={
              event.status === 'PUBLISHED'
                ? 'success'
                : event.status === 'CANCELED'
                  ? 'danger'
                  : 'neutral'
            }
          />
          {urgency ? <Pill label={urgency} tone="warning" /> : null}
        </View>
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

      <Card>
        <Row
          large
          label={t('events:detail.when')}
          value={`${formatEventStart(event.startsAt, timeZone, locale)} · ${t('events:detail.durationValue', { count: event.durationMinutes })}`}
        />
        <Row
          large
          label={t('events:detail.where')}
          value={
            place
              ? [districtName, place, event.private?.addressText].filter(Boolean).join(' · ')
              : t('events:detail.whereHidden', { district: districtName })
          }
        />
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" tone="secondary">
            {t('events:detail.capacity')}
          </Text>
          <SlotMeter approved={event.approvedCount} capacity={event.capacity} />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: spacing[2],
            }}
          >
            <Text variant="titleSm">
              {t('events:detail.capacityValue', {
                approved: event.approvedCount,
                capacity: event.capacity,
              })}
            </Text>
            <Text tone="secondary">
              {openSlots > 0
                ? t('events:detail.spotsLeft', { count: openSlots })
                : t('events:detail.full')}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
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
      </Card>

      {event.description ? <Text>{event.description}</Text> : null}
      {event.visibility === 'INVITE_ONLY' ? (
        <Text variant="caption" tone="secondary">
          {t('events:detail.visibilityInvite')}
        </Text>
      ) : null}

      {joinPanel && !stickyJoin ? joinPanel : null}
      {isOrganizer && event.status === 'PUBLISHED' ? <RequestsPanel event={event} /> : null}

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
