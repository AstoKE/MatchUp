import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { SportBadge, Text, TOUCH_TARGET, useTheme } from '@/ui';
import type { EventListItem } from '../api/search-api';
import { formatCost, formatEventStart, formatEventTime } from '../format';
import { Pill, SlotMeter } from './SlotMeter';

/**
 * One Discover row (USER_FLOWS FL-2): sport and format, title, when, where, filled slots, skill range,
 * cost note and organizer. Only guest-readable fields; tapping opens the event at /e/<id>.
 */
export interface CardBadge {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

export function EventCard({
  event,
  catalog,
  badges = [],
  showDate = true,
}: {
  event: EventListItem;
  catalog: Catalog;
  /** Inside a day group the heading already names the day: show only the time. */
  showDate?: boolean;
  /** Extra state labels (e.g. "Draft", "Request sent"), shown above the sport line. */
  badges?: readonly CardBadge[];
}) {
  const { t } = useTranslation('events');
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const locale = currentLocale();
  // Read the clock once per card (render must stay pure); the server decides what is still joinable.
  const [shownAt] = useState(Date.now);

  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const districtName = district ? localizedName(district.names, locale) : '';
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const when = showDate
    ? formatEventStart(event.startsAt, timeZone, locale)
    : `${formatEventTime(event.startsAt, timeZone, locale)} · ${t('detail.durationValue', { count: event.durationMinutes })}`;
  const full = event.openSlots <= 0;
  const status = full
    ? t(event.waitlistEnabled ? 'discover.card.fullWaitlist' : 'discover.card.full')
    : !event.registrationOpen
      ? t('discover.card.closed')
      : null;
  // Time pressure only for events that can still be joined (design.md §4.2 rule 4).
  const msToStart = Date.parse(event.startsAt) - shownAt;
  const urgency: CardBadge[] =
    full || !event.registrationOpen || msToStart <= 0
      ? []
      : event.openSlots === 1
        ? [{ label: t('detail.lastSpot'), tone: 'warning' }]
        : msToStart < 2 * 3_600_000
          ? [{ label: t('detail.startsSoon'), tone: 'warning' }]
          : [];
  const allBadges = [...badges, ...urgency];
  const where = event.placeLabel
    ? [districtName, event.placeLabel].filter(Boolean).join(' · ')
    : t('discover.card.placeHidden', { district: districtName });
  const skill =
    event.skillMin === null && event.skillMax === null
      ? null
      : t('detail.skillRange', { min: event.skillMin ?? 1, max: event.skillMax ?? 5 });

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/e/[id]', params: { id: event.id } })}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: TOUCH_TARGET,
        gap: spacing[2],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
        opacity: pressed ? 0.85 : 1,
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      })}
    >
      {allBadges.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {allBadges.map((badge) => (
            <Pill key={badge.label} label={badge.label} tone={badge.tone} />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <SportBadge slug={sport?.slug} size={28} />
        <Text variant="caption" tone="secondary" style={{ flexShrink: 1 }}>
          {[
            sport && localizedName(sport.names, locale),
            format && localizedName(format.names, locale),
            event.setting && t(`setting.${event.setting}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text variant="titleSm" heading={2}>
        {event.title}
      </Text>
      <Text>{when}</Text>
      <Text tone="secondary">{where}</Text>
      <View style={{ gap: spacing[1] }}>
        <SlotMeter approved={event.approvedCount} capacity={event.capacity} />
        <Text variant="label">
          {[
            t('discover.card.slots', { approved: event.approvedCount, capacity: event.capacity }),
            status,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {[
          skill,
          event.costAmountMinor !== null
            ? [
                t('detail.costValue', { amount: formatCost(event.costAmountMinor, locale) }),
                event.costNote,
              ]
                .filter(Boolean)
                .join(' · ')
            : null,
          event.organizerName ? t('discover.card.organizer', { name: event.organizerName }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}
