import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { SportArtwork, Text, useTheme } from '@/ui';
import type { EventDetails } from '../api/events-api';
import { formatCost, formatEventStart } from '../format';

/** What the player is asking to join (docs/design.md §5.3). A stated cost is information, never an in-app charge. */
export function EventSummaryPanel({ event, catalog }: { event: EventDetails; catalog: Catalog }) {
  const { t } = useTranslation('events');
  const { colors, radius, spacing } = useTheme();
  const locale = currentLocale();
  const sport = catalog.sports.find((s) => s.id === event.sportId);
  const format = sport?.formats.find((f) => f.id === event.formatId);
  const city = catalog.cities.find((c) => c.id === event.cityId);
  const district = city?.districts.find((d) => d.id === event.districtId);
  const districtName = district ? localizedName(district.names, locale) : '';
  const place = event.private?.placeLabel ?? event.publicPlaceLabel;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <SportArtwork slug={sport?.slug} size={60} />
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text variant="titleSm">{event.title}</Text>
        <Text variant="caption" tone="secondary">
          {[
            sport && localizedName(sport.names, locale),
            format && localizedName(format.names, locale),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text variant="caption" tone="secondary">
          {formatEventStart(event.startsAt, city?.timeZone ?? 'Europe/Istanbul', locale)}
        </Text>
        <Text variant="caption" tone="secondary">
          {place
            ? [districtName, place].filter(Boolean).join(' · ')
            : t('detail.whereHidden', { district: districtName })}
        </Text>
        {event.costAmountMinor !== null ? (
          <Text variant="caption" tone="secondary">
            {t('join.costNote', { amount: formatCost(event.costAmountMinor, locale) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
