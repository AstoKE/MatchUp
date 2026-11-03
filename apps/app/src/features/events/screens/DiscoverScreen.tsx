import {
  activeFilterCount,
  buildSearchPayload,
  EMPTY_DISCOVER_FILTERS,
  groupByLocalDay,
  relativeDay,
  type DiscoverFilters as Filters,
} from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { NotificationBell } from '@/features/notifications';
import { useMyProfile } from '@/features/profile';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Button, EmptyState, Screen, Skeleton, Text, TOUCH_TARGET, useTheme } from '@/ui';
import { DiscoverFilters } from '../components/DiscoverFilters';
import { SportPicker, SportStrip } from '../components/DiscoverSports';
import { EventListRow } from '../components/EventListRow';
import { ALL_SPORTS, readDiscoverSport, storeDiscoverSport } from '../discover-sport-preference';
import { formatDayHeading } from '../format';
import { useEventSearch } from '../hooks';

/**
 * Discover (FL-2), open to guests (D-09): published public events from `search_events`, soonest first.
 * The first visit asks which sport; after that one sport, or all of them, is remembered on the device and changed
 * from the strip above the list. Distance sort and the map arrive with Phase 4.
 */
export function DiscoverScreen() {
  const { t } = useTranslation(['events', 'common', 'nav']);
  const { spacing, breakpoint } = useTheme();
  const expanded = breakpoint === 'expanded';
  const router = useRouter();
  const catalog = useCatalog();
  const profile = useMyProfile();
  const [filters, setFilters] = useState<Filters>(EMPTY_DISCOVER_FILTERS);
  // undefined while the device is being read; null when nothing is chosen yet.
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void readDiscoverSport().then((value) => {
      if (current) setStored(value);
    });
    return () => {
      current = false;
    };
  }, []);
  const choose = (next: string) => {
    setStored(next);
    void storeDiscoverSport(next);
  };
  // A remembered sport the catalog no longer has counts as no choice.
  const choice =
    stored === ALL_SPORTS || catalog.data?.sports.some((sport) => sport.id === stored)
      ? (stored as string)
      : null;
  // The player's own sports come first; the order waits for the profile, so nothing moves under a finger.
  const sports = useMemo(() => {
    const all = catalog.data?.sports ?? [];
    const own = new Set(profile.data?.sports.map((s) => s.sportId));
    return [...all.filter((s) => own.has(s.id)), ...all.filter((s) => !own.has(s.id))];
  }, [catalog.data, profile.data]);
  const ready =
    stored !== undefined &&
    catalog.data !== undefined &&
    (!profile.isPending || profile.fetchStatus === 'idle');
  // Read the clock once per visit (render must stay pure); "today" is resolved server-side bounds only.
  const [openedAt] = useState(Date.now);
  // The pilot has one city; with several, a city picker would choose it here.
  const city = catalog.data?.cities[0];
  const payload = useMemo(
    () =>
      buildSearchPayload(
        { ...filters, sportIds: choice === null || choice === ALL_SPORTS ? [] : [choice] },
        {
          now: new Date(openedAt),
          timeZone: city?.timeZone ?? 'Europe/Istanbul',
        },
      ),
    [filters, choice, openedAt, city?.timeZone],
  );
  const search = useEventSearch(payload, ready && choice !== null);
  const items = useMemo(
    () => search.data?.pages.flatMap((page) => page.items) ?? [],
    [search.data],
  );
  const filtered = activeFilterCount(filters) > 0;
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const groups = useMemo(() => groupByLocalDay(items, timeZone), [items, timeZone]);
  const locale = currentLocale();
  const chosenSport = catalog.data?.sports.find((sport) => sport.id === choice);
  const asking = ready && choice === null;

  return (
    // A new key after the choice: the list starts at its top, not where the picker was scrolled to.
    <Screen key={asking ? 'asking' : 'list'} maxWidth={expanded ? 1280 : 720}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
          minHeight: TOUCH_TARGET,
        }}
      >
        {city ? (
          <Text variant="label" tone="secondary">
            {localizedName(city.names, locale)}
          </Text>
        ) : (
          <View />
        )}
        <NotificationBell />
      </View>
      <Text
        variant="headline"
        heading={1}
        style={
          expanded && asking
            ? { fontSize: 60, lineHeight: 62, letterSpacing: -1.5, maxWidth: 640 }
            : undefined
        }
      >
        {asking ? t('events:discover.pickerTitle') : t('nav:discover')}
      </Text>

      {ready && choice !== null ? (
        <>
          <SportStrip sports={sports} choice={choice} onChoose={choose} />
          <DiscoverFilters filters={filters} onChange={setFilters} city={city} />
        </>
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
      ) : asking ? (
        <SportPicker sports={sports} onChoose={choose} />
      ) : search.isPending || !catalog.data || !ready ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('common:loading')}
          style={{ gap: spacing[3] }}
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={104} radiusKey="lg" />
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
        ) : chosenSport ? (
          <EmptyState
            title={t('events:discover.noSportTitle', {
              sport: localizedName(chosenSport.names, locale),
            })}
            body={t('events:discover.noSportBody')}
            actionLabel={t('events:discover.allSports')}
            onAction={() => choose(ALL_SPORTS)}
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
                <View
                  role="list"
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}
                >
                  {group.items.map((event) => (
                    <View
                      key={event.id}
                      role="listitem"
                      style={{
                        width: expanded ? '32.6%' : breakpoint === 'medium' ? '49%' : '100%',
                      }}
                    >
                      <EventListRow event={event} catalog={catalog.data} showDate={false} />
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
