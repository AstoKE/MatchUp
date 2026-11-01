import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  Screen,
  SportArtwork,
  SportBadge,
  Text,
  useTheme,
} from '@/ui';
import type { EventDetails } from '../api/events-api';
import { AttendancePanel } from '../components/AttendancePanel';
import { JoinPanel } from '../components/JoinPanel';
import { ReviewPanel } from '../components/ReviewPanel';
import { Pill, SlotMeter } from '../components/SlotMeter';
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

/** One fact. Short ones sit side by side and wrap at large text sizes; `wide` takes the whole line. */
function Tile({
  label,
  value,
  wide,
  children,
}: {
  label: string;
  value?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: wide ? '100%' : '40%',
        gap: spacing[1],
        padding: spacing[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      {value ? <Text variant="label">{value}</Text> : null}
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
  const { spacing, breakpoint } = useTheme();
  const compact = breakpoint === 'compact';
  const router = useRouter();
  const locale = currentLocale();
  // Read the clock once per visit (render must stay pure); actions revalidate on the server anyway.
  const [openedAt] = useState(Date.now);

  const sport = catalog.sports.find((s) => s.id === event.sportId);
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
      {/* Edge to edge on a phone (cancels the page's gutter and top padding), a contained image on wider screens. */}
      <View
        style={
          compact ? { marginHorizontal: -spacing[4], marginTop: -spacing[4] } : { marginTop: 0 }
        }
      >
        <SportArtwork
          slug={sport?.slug}
          height={compact ? 220 : 260}
          iconSize={72}
          square={compact}
        />
        <View style={{ position: 'absolute', top: spacing[3], left: spacing[3] }}>
          <IconButton
            icon="chevron-left"
            label={t('events:detail.backToDiscover')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Tile
          wide
          label={t('events:detail.when')}
          value={`${formatEventStart(event.startsAt, timeZone, locale)} · ${t('events:detail.durationValue', { count: event.durationMinutes })}`}
        />
        <Tile
          wide
          label={t('events:detail.where')}
          value={
            place
              ? [districtName, place, event.private?.addressText].filter(Boolean).join(' · ')
              : t('events:detail.whereHidden', { district: districtName })
          }
        />
        <Tile wide label={t('events:detail.capacity')}>
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
            <Text variant="bodySm" tone="secondary">
              {openSlots > 0
                ? t('events:detail.spotsLeft', { count: openSlots })
                : t('events:detail.full')}
            </Text>
          </View>
        </Tile>
        <Tile
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
        {event.organizerName ? (
          <Tile label={t('events:detail.organizer')} value={event.organizerName} />
        ) : null}
        <Tile
          label={t('events:detail.booking')}
          value={t(`events:booking.${event.bookingStatus}`)}
        />
        {event.setting ? (
          <Tile label={t('events:detail.setting')} value={t(`events:setting.${event.setting}`)} />
        ) : null}
        {event.costAmountMinor !== null ? (
          <Tile
            wide
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
          <Tile wide label={t('events:detail.equipment')} value={event.equipmentNote} />
        ) : null}
        {event.private?.participantNotes ? (
          <Tile wide label={t('events:detail.notes')} value={event.private.participantNotes} />
        ) : null}
      </View>

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
                <View key={index} role="listitem">
                  <Text>{p.displayName ?? t('events:requests.unnamed')}</Text>
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
      {started &&
      !isOrganizer &&
      (event.status === 'PUBLISHED' || event.status === 'COMPLETED') &&
      event.participants !== null ? (
        <AttendancePanel eventId={event.id} isOrganizer={false} />
      ) : null}
      {event.status === 'COMPLETED' && (isOrganizer || event.participants !== null) ? (
        <ReviewPanel
          eventId={event.id}
          timeZone={timeZone}
          descriptors={sport?.skillDescriptors ?? {}}
        />
      ) : null}
    </Screen>
  );
}
