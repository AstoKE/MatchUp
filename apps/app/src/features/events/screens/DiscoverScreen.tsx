import { brand } from '@matchup/config';
import {
  activeFilterCount,
  buildSearchPayload,
  EMPTY_DISCOVER_FILTERS,
  type DiscoverFilters as Filters,
} from '@matchup/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Button, EmptyState, Screen, Skeleton, Text, useTheme } from '@/ui';
import { DiscoverFilters } from '../components/DiscoverFilters';
import { EventCard } from '../components/EventCard';
import { useEventSearch } from '../hooks';

const logo = require('../../../../assets/brand/logo-provisional-512.png') as number;

/**
 * Discover (FL-2), open to guests (D-09): published public events from `search_events`, soonest first.
 * Phase 3 / M3: list, filters and paging. Join requests arrive with participation (M4); distance sort and
 * the map with Phase 4.
 */
export function DiscoverScreen() {
  const { t } = useTranslation(['events', 'common', 'nav']);
  const { spacing } = useTheme();
  const router = useRouter();
  const catalog = useCatalog();
  const [filters, setFilters] = useState<Filters>(EMPTY_DISCOVER_FILTERS);
  // Read the clock once per visit (render must stay pure); "today" is resolved server-side bounds only.
  const [openedAt] = useState(Date.now);
  // The pilot has one city; with several, a city picker would choose it here.
  const city = catalog.data?.cities[0];
  const payload = useMemo(
    () =>
      buildSearchPayload(filters, {
        now: new Date(openedAt),
        timeZone: city?.timeZone ?? 'Europe/Istanbul',
      }),
    [filters, openedAt, city?.timeZone],
  );
  const search = useEventSearch(payload);
  const items = search.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = activeFilterCount(filters) > 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Image
          source={logo}
          accessibilityLabel={t('common:logoAlt', { appName: brand.name })}
          style={{ width: 56, height: 56 }}
        />
        <View style={{ flexShrink: 1 }}>
          <Text variant="headline" heading={1}>
            {t('nav:discover')}
          </Text>
          <Text tone="secondary">{brand.taglines[currentLocale()]}</Text>
        </View>
      </View>

      {catalog.data ? (
        <DiscoverFilters
          filters={filters}
          onChange={setFilters}
          sports={catalog.data.sports}
          city={city}
        />
      ) : null}

      {catalog.isError || search.isError ? (
        <EmptyState
          title={t('events:discover.loadFailed')}
          body={errorText(catalog.error ?? search.error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            if (catalog.isError) void catalog.refetch();
            if (search.isError) void search.refetch();
          }}
        />
      ) : search.isPending || !catalog.data ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('common:loading')}
          style={{ gap: spacing[3] }}
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={140} radiusKey="lg" />
          ))}
        </View>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            title={t('events:discover.noMatchTitle')}
            body={t('events:discover.noMatchBody')}
            actionLabel={t('events:discover.clear')}
            onAction={() => setFilters(EMPTY_DISCOVER_FILTERS)}
          />
        ) : (
          <EmptyState
            title={t('events:discover.emptyTitle')}
            body={t('events:discover.emptyBody')}
            actionLabel={t('events:discover.emptyCreate')}
            onAction={() => router.push('/create')}
          />
        )
      ) : (
        <View style={{ gap: spacing[3] }}>
          <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
            {t('events:discover.resultCount', { count: items.length })}
          </Text>
          <View role="list" style={{ gap: spacing[3] }}>
            {items.map((event) => (
              <View key={event.id} role="listitem">
                <EventCard event={event} catalog={catalog.data} />
              </View>
            ))}
          </View>
          {search.hasNextPage ? (
            <Button
              label={t('events:discover.loadMore')}
              variant="secondary"
              loading={search.isFetchingNextPage}
              loadingLabel={t('events:discover.loadMoreLoading')}
              onPress={() => void search.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
