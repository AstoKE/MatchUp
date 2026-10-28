import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Text, TOUCH_TARGET, useTheme } from '@/ui';
import type { EventListItem } from '../api/search-api';
import { formatCost, formatEventStart } from '../format';
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
}: {
  event: EventListItem;
  catalog: Catalog;
  /** Extra state labels (e.g. "Draft", "Request sent"), shown above the sport line. */
  badges?: readonly CardBadge[];
}) {
  const { t } = useTranslation('events');
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const locale = currentLocale();

  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const districtName = district ? localizedName(district.names, locale) : '';
  const when = formatEventStart(event.startsAt, city?.timeZone ?? 'Europe/Istanbul', locale);
  const full = event.openSlots <= 0;
  const status = full
    ? t(event.waitlistEnabled ? 'discover.card.fullWaitlist' : 'discover.card.full')
    : !event.registrationOpen
      ? t('discover.card.closed')
      : null;
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
      {badges.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {badges.map((badge) => (
            <Pill key={badge.label} label={badge.label} tone={badge.tone} />
          ))}
        </View>
      ) : null}
      <Text variant="caption" tone="secondary">
        {[
          sport && localizedName(sport.names, locale),
          format && localizedName(format.names, locale),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
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
