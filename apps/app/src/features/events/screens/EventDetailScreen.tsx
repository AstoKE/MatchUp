import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { useTrack } from '@/features/analytics';
import { localizedName, useCatalog, type Catalog } from '@/features/catalog';
import { ReportSheet } from '@/features/players';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Avatar,
  Banner,
  Button,
  CourtDrawing,
  EmptyState,
  IconButton,
  Screen,
  sportColors,
  Text,
  TOUCH_TARGET,
  useTheme,
} from '@/ui';
import type { EventDetails } from '../api/events-api';
import { JoinPanel } from '../components/JoinPanel';
import { Pill, SlotMeter } from '../components/SlotMeter';
import { LazyAttendancePanel, LazyReviewPanel } from '../components/LazyPanels';
import { formatCost, formatEventStart } from '../format';
import { useEvent } from '../hooks';

/**
 * Event detail at /e/<id>, open to guests (D-09): RLS decides what they see. The organizer's tools are one tap away,
 * on /e/<id>/manage.
 */
export function EventDetailScreen() {
  const { t } = useTranslation(['events', 'common', 'errors', 'nav']);
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; invite?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  // The secret of an invite-only event rides on the shared link (?invite=...).
  const inviteToken = typeof params.invite === 'string' ? params.invite : null;
  const event = useEvent(id, inviteToken);
  const catalog = useCatalog();
  const track = useTrack();
  const loaded = Boolean(event.data);
  // Usage analytics (consent only, ADR-0025): that a page was seen, not which.
  useEffect(() => {
    if (loaded) track({ name: 'event_detail_viewed' });
  }, [loaded, track]);

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
  return <Detail event={event.data} catalog={catalog.data} inviteToken={inviteToken} />;
}

/** One fact on its own line (docs/design.md §5.2): a label over a value. */
function Fact({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing[1],
        paddingVertical: spacing[3],
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSubtle,
      }}
    >
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      {value ? <Text variant="titleSm">{value}</Text> : null}
      {children}
    </View>
  );
}

/** A raised group; the outline keeps it visible in both themes without a shadow. */
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

function Detail({
  event,
  catalog,
  inviteToken,
}: {
  event: EventDetails;
  catalog: Catalog;
  inviteToken: string | null;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { colors, radius, spacing, breakpoint } = useTheme();
  const compact = breakpoint === 'compact';
  const router = useRouter();
  const locale = currentLocale();
  const session = useSession();
  const [reporting, setReporting] = useState(false);
  // Read the clock once per visit (render must stay pure); actions revalidate on the server anyway.
  const [openedAt] = useState(Date.now);

  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const court = sport ? sportColors[sport.slug] : undefined;
  const onCourt = court?.on ?? colors.textPrimary;
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const districtName = district ? localizedName(district.names, locale) : '';
  const isOrganizer = event.isOrganizer;
  const started = openedAt >= Date.parse(event.startsAt);
  const place = event.private?.placeLabel ?? event.publicPlaceLabel;
  // Time pressure only matters for an event people can still join (design.md §4.2 rule 4).
  const joinable = event.status === 'PUBLISHED' && !started;
  // On a phone the join action is pinned under the content (design.md §8: the thumb zone).
  const stickyJoin = compact;
  // The page's one dominant action: join, or for the organizer manage. A canceled event has nothing left to manage.
  const action = isOrganizer ? (
    event.status === 'CANCELED' ? null : (
      <Button
        label={t('events:manage.open')}
        onPress={() => router.push({ pathname: '/e/[id]/manage', params: { id: event.id } })}
        fullWidth
      />
    )
  ) : joinable ? (
    <JoinPanel event={event} inviteToken={inviteToken} />
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
    <Screen maxWidth={640} footer={action && stickyJoin ? action : undefined}>
      {/* Edge to edge on a phone (cancels the page's gutter and top padding), a contained panel on wider screens. */}
      <View
        style={{
          gap: spacing[2],
          padding: spacing[4],
          backgroundColor: court?.court ?? colors.surfaceSunken,
          ...(compact
            ? { marginHorizontal: -spacing[4], marginTop: -spacing[4] }
            : { borderRadius: radius.xl }),
        }}
      >
        <IconButton
          icon="chevron-left"
          label={t('events:detail.backToDiscover')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={{ height: 120 }}>
          <CourtDrawing slug={sport?.slug} color={onCourt} />
        </View>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[1],
            borderRadius: radius.pill,
            backgroundColor: colors.dockActive,
          }}
        >
          <Text variant="micro" style={{ color: colors.onDockActive }}>
            {[
              sport && localizedName(sport.names, locale),
              format && localizedName(format.names, locale),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Text variant="headline" heading={1} style={{ color: onCourt }}>
          {event.title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Pill
          label={
            event.status === 'PUBLISHED' && started
              ? t('events:detail.started')
              : t(`events:status.${event.status}`)
          }
          tone={
            event.status === 'PUBLISHED' && !started
              ? 'success'
              : event.status === 'CANCELED'
                ? 'danger'
                : 'neutral'
          }
        />
        {urgency ? <Pill label={urgency} tone="warning" /> : null}
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

      <View>
        <Fact
          label={t('events:detail.when')}
          value={`${formatEventStart(event.startsAt, timeZone, locale)} · ${t('events:detail.durationValue', { count: event.durationMinutes })}`}
        />
        <Fact
          label={t('events:detail.where')}
          value={
            place
              ? [districtName, place, event.private?.addressText].filter(Boolean).join(' · ')
              : t('events:detail.whereHidden', { district: districtName })
          }
        />
        {event.venue ? (
          <Fact
            label={t('events:detail.venue')}
            value={t(
              event.venue.verified
                ? 'events:detail.venueVerified'
                : 'events:detail.venueUnverified',
              { name: event.venue.name },
            )}
          />
        ) : null}
        <Fact
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
        <Fact label={t('events:detail.capacity')}>
          <SlotMeter approved={event.approvedCount} capacity={event.capacity} />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: spacing[2],
            }}
          >
            <Text variant="label">
              {t('events:detail.capacityValue', {
                approved: event.approvedCount,
                capacity: event.capacity,
              })}
            </Text>
            {joinable ? (
              <Text variant="bodySm" tone="secondary">
                {openSlots > 0
                  ? t('events:detail.spotsLeft', { count: openSlots })
                  : t('events:detail.full')}
              </Text>
            ) : null}
          </View>
        </Fact>
        <Fact
          label={t('events:detail.booking')}
          value={t('events:detail.bookingValue', {
            status: t(`events:booking.${event.bookingStatus}`),
          })}
        />
        {event.setting ? (
          <Fact label={t('events:detail.setting')} value={t(`events:setting.${event.setting}`)} />
        ) : null}
        {event.costAmountMinor !== null ? (
          <Fact
            label={t('events:detail.cost')}
            value={[
              t('events:detail.costValue', { amount: formatCost(event.costAmountMinor, locale) }),
              event.costNote,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        {event.equipmentNote ? (
          <Fact label={t('events:detail.equipment')} value={event.equipmentNote} />
        ) : null}
        {event.private?.participantNotes ? (
          <Fact label={t('events:detail.notes')} value={event.private.participantNotes} />
        ) : null}
      </View>

      {event.organizerName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Avatar name={event.organizerName} size={44} />
          <View style={{ flexShrink: 1 }}>
            <Text variant="titleSm">{event.organizerName}</Text>
            <Text variant="caption" tone="secondary">
              {t('events:detail.organizer')}
            </Text>
          </View>
        </View>
      ) : null}

      {event.participants ? (
        <Card>
          <Text variant="title" heading={2}>
            {t('events:detail.participants', { count: event.participants.length })}
          </Text>
          {event.participants.length === 0 ? (
            <Text tone="secondary">{t('events:detail.participantsNone')}</Text>
          ) : (
            <View role="list" style={{ gap: spacing[2] }}>
              {event.participants.map((p, index) => (
                <View key={p.userId ?? index} role="listitem">
                  {p.userId ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={t('events:requests.openCard', {
                        name: p.displayName ?? t('events:requests.unnamed'),
                      })}
                      onPress={() =>
                        router.push({ pathname: '/u/[id]', params: { id: p.userId ?? '' } })
                      }
                      style={{ minHeight: TOUCH_TARGET, justifyContent: 'center' }}
                    >
                      <Text tone="link">{p.displayName ?? t('events:requests.unnamed')}</Text>
                    </Pressable>
                  ) : (
                    <Text>{p.displayName ?? t('events:requests.unnamed')}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : event.approvedCount > 1 ? (
        <Text variant="caption" tone="secondary">
          {t('events:detail.participantsHidden')}
        </Text>
      ) : null}
      {event.description ? <Text>{event.description}</Text> : null}
      {event.visibility === 'INVITE_ONLY' ? (
        <Text variant="caption" tone="secondary">
          {t('events:detail.visibilityInvite')}
        </Text>
      ) : null}

      {action && !stickyJoin ? action : null}
      {!isOrganizer && session.status === 'authenticated' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="tertiary"
            label={t('events:detail.reportEvent')}
            onPress={() => setReporting(true)}
          />
          <ReportSheet
            visible={reporting}
            targetType="EVENT"
            targetId={event.id}
            inviteToken={inviteToken}
            onClose={() => setReporting(false)}
          />
        </View>
      ) : null}
      {started &&
      !isOrganizer &&
      (event.status === 'PUBLISHED' || event.status === 'COMPLETED') &&
      event.participants !== null ? (
        <LazyAttendancePanel eventId={event.id} isOrganizer={false} />
      ) : null}
      {event.status === 'COMPLETED' && (isOrganizer || event.participants !== null) ? (
        <LazyReviewPanel
          eventId={event.id}
          timeZone={timeZone}
          descriptors={sport?.skillDescriptors ?? {}}
        />
      ) : null}
    </Screen>
  );
}
