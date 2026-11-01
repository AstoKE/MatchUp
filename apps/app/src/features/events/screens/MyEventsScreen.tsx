import type { MyEventBucket } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { VerifyEmailBanner } from '@/features/auth';
import { useCatalog } from '@/features/catalog';
import { NotificationBell } from '@/features/notifications';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { i18n } from '@/lib/i18n';
import { Button, EmptyState, Screen, SegmentedChoice, Skeleton, Text, useTheme } from '@/ui';
import type { MyEventItem } from '../api/my-events-api';
import { EventListRow, type CardBadge } from '../components/EventListRow';
import { useMyEvents } from '../hooks';

/** What the caller should know at a glance, besides what the card already says: state + own request. */
function badgesFor(event: MyEventItem): CardBadge[] {
  const t = i18n.t.bind(i18n);
  const badges: CardBadge[] = [];
  if (event.status === 'DRAFT') badges.push({ label: t('events:status.DRAFT'), tone: 'neutral' });
  if (event.status === 'CANCELED') {
    badges.push({ label: t('events:status.CANCELED'), tone: 'danger' });
  }
  if (event.status === 'COMPLETED') {
    badges.push({ label: t('events:status.COMPLETED'), tone: 'neutral' });
  }
  if (event.pendingCount) {
    badges.push({
      label: t('events:mine.pendingRequests', { count: event.pendingCount }),
      tone: 'warning',
    });
  }
  if (event.myStatus && event.myStatus !== 'ORGANIZER') {
    const tone =
      event.myStatus === 'APPROVED'
        ? 'success'
        : event.myStatus === 'REJECTED' || event.myStatus === 'REMOVED'
          ? 'danger'
          : 'warning';
    badges.push({ label: t(`events:mine.status.${event.myStatus}`), tone });
  }
  return badges;
}

const TABS = ['UPCOMING', 'APPLIED', 'ORGANIZING', 'PAST'] as const;
type Tab = (typeof TABS)[number];
const PRIMARY_BUCKET: Record<Tab, MyEventBucket> = {
  UPCOMING: 'APPROVED',
  APPLIED: 'PENDING',
  ORGANIZING: 'ORGANIZING',
  PAST: 'PAST',
};

/**
 * My Events (docs/design.md §5.6): four tabs over the five server buckets; "applied" shows pending requests and the
 * waitlist as two sections, each with its own paging. Needs an account.
 */
export function MyEventsScreen() {
  // The queries live below the gate: a guest is redirected without ever asking the server.
  return (
    <RequireOnboarded>
      <MyEventsContent />
    </RequireOnboarded>
  );
}

function MyEventsContent() {
  const { t } = useTranslation(['events', 'common', 'nav']);
  const { spacing } = useTheme();
  const router = useRouter();
  const catalog = useCatalog();
  const [tab, setTab] = useState<Tab>('UPCOMING');
  const primary = useMyEvents(PRIMARY_BUCKET[tab]);
  const waitlist = useMyEvents('WAITLISTED', tab === 'APPLIED');
  const lists =
    tab === 'APPLIED'
      ? [
          { bucket: 'PENDING' as const, query: primary },
          { bucket: 'WAITLISTED' as const, query: waitlist },
        ]
      : [{ bucket: PRIMARY_BUCKET[tab], query: primary }];
  const failed = lists.find((l) => l.query.isError)?.query;
  const pending = lists.some((l) => l.query.isPending);
  const itemsOf = (query: typeof primary) => query.data?.pages.flatMap((page) => page.items) ?? [];
  const empty = lists.every((l) => itemsOf(l.query).length === 0);

  return (
    <Screen maxWidth={720}>
      <VerifyEmailBanner />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
        }}
      >
        <Text variant="headline" heading={1}>
          {t('nav:myEvents')}
        </Text>
        <NotificationBell />
      </View>
      <SegmentedChoice
        label={t('events:mine.tabLabel')}
        options={TABS.map((value) => ({ value, label: t(`events:mine.tab.${value}`) }))}
        value={tab}
        onChange={setTab}
      />

      {failed || catalog.isError ? (
        <EmptyState
          title={t('events:mine.loadFailed')}
          body={errorText(failed?.error ?? catalog.error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            lists.forEach((l) => {
              if (l.query.isError) void l.query.refetch();
            });
            if (catalog.isError) void catalog.refetch();
          }}
        />
      ) : pending || !catalog.data ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('common:loading')}
          style={{ gap: spacing[2] }}
        >
          {[0, 1].map((n) => (
            <Skeleton key={n} height={104} radiusKey="lg" />
          ))}
        </View>
      ) : empty ? (
        <EmptyState
          title={t(`events:mine.empty.${tab}.title`)}
          body={t(`events:mine.empty.${tab}.body`)}
          actionLabel={t(tab === 'ORGANIZING' ? 'events:mine.createFirst' : 'events:mine.browse')}
          onAction={() => router.push(tab === 'ORGANIZING' ? '/create' : '/')}
        />
      ) : (
        <View style={{ gap: spacing[4] }}>
          {lists.map(({ bucket, query }) => {
            const items = itemsOf(query);
            if (items.length === 0) return null;
            return (
              <View key={bucket} style={{ gap: spacing[2] }}>
                {tab === 'APPLIED' ? (
                  <Text variant="title" heading={2}>
                    {bucket === 'PENDING'
                      ? t('events:mine.section.PENDING', { count: items.length })
                      : t('events:mine.section.WAITLISTED', { count: items.length })}
                  </Text>
                ) : (
                  <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
                    {t('events:discover.resultCount', { count: items.length })}
                  </Text>
                )}
                <View role="list" style={{ gap: spacing[2] }}>
                  {items.map((event) => (
                    <View key={event.id} role="listitem">
                      <EventListRow
                        event={event}
                        catalog={catalog.data}
                        badges={badgesFor(event)}
                      />
                    </View>
                  ))}
                </View>
                {query.hasNextPage ? (
                  <Button
                    label={t('events:discover.loadMore')}
                    variant="secondary"
                    loading={query.isFetchingNextPage}
                    loadingLabel={t('events:discover.loadMoreLoading')}
                    onPress={() => void query.fetchNextPage()}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
