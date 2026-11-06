import type { GeoPoint } from '@matchup/domain';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Catalog, CatalogCity } from '@/features/catalog';
import { MapCanvas, type MapMarker } from '@/features/map';
import { mapStyleUrl } from '@/lib/map-config';
import { Text, useTheme } from '@/ui';
import type { EventListItem } from '../api/search-api';
import { EventListRow } from './EventListRow';

/** Where a province's map opens when nothing better is known: the middle of Turkey. */
const TURKEY: GeoPoint = { lat: 39.0, lon: 35.2 };

/**
 * Discover as a map (Phase 4 / M5): the same results as the list. An exact point is a pin; a hidden location's cell or a
 * district centre is drawn as an area, never as a pin. Choosing a marker shows its card under the map.
 */
export function EventsMap({
  items,
  city,
  near,
  catalog,
}: {
  items: readonly EventListItem[];
  city: CatalogCity | undefined;
  near: GeoPoint | null;
  catalog: Catalog;
}) {
  const { t } = useTranslation('events');
  const { spacing, breakpoint } = useTheme();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const markers = useMemo<MapMarker[]>(
    () =>
      items.flatMap((e) =>
        e.point
          ? [
              {
                id: e.id,
                point: e.point,
                kind: e.pointPrecision === 'EXACT' ? ('pin' as const) : ('area' as const),
                label: e.title,
              },
            ]
          : [],
      ),
    [items],
  );
  if (!mapStyleUrl) return null;
  const chosen = items.find((e) => e.id === chosenId);
  return (
    <View style={{ gap: spacing[3] }}>
      <MapCanvas
        styleUrl={mapStyleUrl}
        center={near ?? city?.center ?? markers[0]?.point ?? TURKEY}
        zoom={near ? 12 : city?.center ? 10 : 5}
        markers={markers}
        onPressMarker={setChosenId}
        accessibilityLabel={t('discover.map.label', { count: markers.length })}
        height={breakpoint === 'compact' ? 360 : 480}
      />
      <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
        {markers.length < items.length
          ? t('discover.map.someMissing', { shown: markers.length, count: items.length })
          : t('discover.map.hint')}
      </Text>
      {chosen ? <EventListRow event={chosen} catalog={catalog} showDate /> : null}
    </View>
  );
}
