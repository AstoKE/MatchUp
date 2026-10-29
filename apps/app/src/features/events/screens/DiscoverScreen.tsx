import { brand } from '@matchup/config';
import {
  activeFilterCount,
  buildSearchPayload,
  EMPTY_DISCOVER_FILTERS,
  groupByLocalDay,
  relativeDay,
  type DiscoverFilters as Filters,
} from '@matchup/domain';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '@/features/catalog';
import { NotificationBell } from '@/features/notifications';
import { useMyProfile } from '@/features/profile';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Button, EmptyState, Screen, Skeleton, Text, useTheme } from '@/ui';
import { DiscoverFilters } from '../components/DiscoverFilters';
import { EventCard } from '../components/EventCard';
import { formatDayHeading } from '../format';
import { useEventSearch } from '../hooks';

const logo = require('../../../../assets/brand/logo-provisional-512.png') as number;

/**
 * Discover (FL-2), open to guests (D-09): published public events from `search_events`, soonest first.
 * Phase 3 / M3: list, filters and paging. Join requests arrive with participation (M4); distance sort and
 * the map with Phase 4.
 */
export function DiscoverScreen() {
  const { t } = useTranslation(['events', 'common', 'nav']);
  const { spacing, breakpoint } = useTheme();
  const router = useRouter();
  const catalog = useCatalog();
  // On a phone the filter panel would fill the first screen and push the events below the fold: it sits
  // behind a button there (with the number of active filters); wider screens keep it open.
  const compact = breakpoint === 'compact';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const profile = useMyProfile();
  // Signed-in players open Discover on their own sports (USER_FLOWS FL-2); `chosen` is set the moment they
  // touch a filter or clear them, and from then on it wins. Guests and people without sports see everything.
  const [chosen, setChosen] = useState<Filters | null>(null);
  const profileSports = useMemo(
    () => profile.data?.sports.map((s) => s.sportId) ?? [],
    [profile.data],
  );
  const filters = useMemo<Filters>(
    () => chosen ?? { ...EMPTY_DISCOVER_FILTERS, sportIds: profileSports },
    [chosen, profileSports],
  );
  const fromProfile = chosen === null && profileSports.length > 0;
  // The first search waits for the profile, so a signed-in player never sees an unfiltered flash.
  const ready = !profile.isPending || profile.fetchStatus === 'idle';
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
  const search = useEventSearch(payload, ready);
  const items = useMemo(
    () => search.data?.pages.flatMap((page) => page.items) ?? [],
    [search.data],
  );
  const filtered = activeFilterCount(filters) > 0;
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const groups = useMemo(() => groupByLocalDay(items, timeZone), [items, timeZone]);
  const locale = currentLocale();

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
        <NotificationBell />
      </View>

      {compact ? (
        <Button
          variant="secondary"
          label={
            activeFilterCount(filters) > 0
              ? t('events:discover.filtersWithCount', { count: activeFilterCount(filters) })
              : t('events:discover.filtersTitle')
          }
          aria-expanded={filtersOpen}
          onPress={() => setFiltersOpen((open) => !open)}
        />
      ) : null}
      {catalog.data && (!compact || filtersOpen) ? (
        <DiscoverFilters
          filters={filters}
          onChange={setChosen}
          sports={catalog.data.sports}
          city={city}
        />
      ) : null}

      {fromProfile ? (
        <Text variant="caption" tone="secondary">
          {t('events:discover.fromProfile')}
        </Text>
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
      ) : search.isPending || !catalog.data || !ready ? (
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
            onAction={() => setChosen(EMPTY_DISCOVER_FILTERS)}
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
          {groups.map((group) => {
            const named = relativeDay(group.date, new Date(openedAt), timeZone);
            return (
              <View key={group.date} style={{ gap: spacing[3] }}>
                <Text variant="title" heading={2}>
                  {named ? t(`events:discover.day.${named}`) : formatDayHeading(group.date, locale)}
                </Text>
                <View role="list" style={{ gap: spacing[3] }}>
                  {group.items.map((event) => (
                    <View key={event.id} role="listitem">
                      <EventCard event={event} catalog={catalog.data} showDate={false} />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
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
