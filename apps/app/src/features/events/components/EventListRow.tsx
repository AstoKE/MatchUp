import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { StatusChip, Text, TimeTile, TOUCH_TARGET, useTheme, type StatusChipKind } from '@/ui';
import type { EventListItem } from '../api/search-api';
import { formatEventStart, formatEventTime } from '../format';
import { Pill } from './SlotMeter';

export interface CardBadge {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  /** Where the person stands: a chip with an icon, instead of a plain label. */
  chip?: StatusChipKind;
}

/**
 * One event in a list (docs/design.md §5.1): time on the sport's color, then sport, title, place and availability. Only guest-readable
 * fields. Availability is words, not a bar; skill range, organizer and the cost amount are on the event page.
 */
export function EventListRow({
  event,
  catalog,
  badges = [],
  showDate = true,
}: {
  event: EventListItem;
  catalog: Catalog;
  /** Inside a day group the heading already names the day: show only the time. */
  showDate?: boolean;
  /** Extra state labels (e.g. "Draft", "Request sent"). */
  badges?: readonly CardBadge[];
}) {
  const { t } = useTranslation('events');
  const { breakpoint, colors, radius, spacing } = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const locale = currentLocale();
  // Read the clock once per row (render must stay pure); the server decides what is still joinable.
  const [shownAt] = useState(Date.now);

  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const districtName = district ? localizedName(district.names, locale) : '';
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const full = event.openSlots <= 0;
  const msToStart = Date.parse(event.startsAt) - shownAt;
  // Time pressure only for events that can still be joined.
  const joinable = !full && event.registrationOpen && msToStart > 0;
  const availability: CardBadge = full
    ? {
        label: t(event.waitlistEnabled ? 'discover.card.fullWaitlist' : 'discover.card.full'),
        tone: 'warning',
      }
    : !event.registrationOpen
      ? { label: t('discover.card.closed'), tone: 'neutral' }
      : event.openSlots === 1
        ? { label: t('detail.lastSpot'), tone: 'warning' }
        : { label: t('detail.spotsLeft', { count: event.openSlots }), tone: 'neutral' };
  const allBadges: CardBadge[] = [
    ...badges,
    availability,
    ...(joinable && msToStart < 2 * 3_600_000
      ? [{ label: t('detail.startsSoon'), tone: 'warning' as const }]
      : []),
    ...(event.costAmountMinor !== null
      ? [{ label: t('discover.card.paid'), tone: 'neutral' as const }]
      : []),
  ];
  const where = event.placeLabel
    ? [districtName, event.placeLabel].filter(Boolean).join(' · ')
    : t('discover.card.placeHidden', { district: districtName });

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/e/[id]', params: { id: event.id } })}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: TOUCH_TARGET,
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: pressed ? colors.surfaceOverlay : colors.surfaceRaised,
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
      <TimeTile
        slug={sport?.slug}
        time={formatEventTime(event.startsAt, timeZone, locale)}
        size={breakpoint === 'expanded' ? 80 : 64}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="secondary">
          {[
            sport && localizedName(sport.names, locale),
            format && localizedName(format.names, locale),
            event.setting && t(`setting.${event.setting}`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text variant="titleSm" heading={showDate ? 2 : 3}>
          {event.title}
        </Text>
        {showDate ? (
          <Text variant="bodySm">{formatEventStart(event.startsAt, timeZone, locale)}</Text>
        ) : null}
        <Text variant="caption" tone="secondary">
          {where}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: spacing[2],
            marginTop: spacing[1],
          }}
        >
          {allBadges.map((badge) =>
            badge.chip ? (
              <StatusChip key={badge.label} kind={badge.chip} label={badge.label} />
            ) : badge.tone === 'neutral' ? (
              <Text key={badge.label} variant="micro">
                {badge.label}
              </Text>
            ) : (
              <Pill key={badge.label} label={badge.label} tone={badge.tone} />
            ),
          )}
        </View>
      </View>
    </Pressable>
  );
}
