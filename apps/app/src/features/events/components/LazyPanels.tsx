import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/ui';
import type { AttendancePanel } from './AttendancePanel';
import type { RequestsPanel } from './RequestsPanel';
import type { ReviewPanel } from './ReviewPanel';

// The organizer's request queue, attendance and reviews are used only on an event's own page, after it is opened, but
// sharing them between two routes put them in the chunk every first visit loads (docs/PERFORMANCE.md §4 item 5).
const Requests = lazy(() => import('./RequestsPanel').then((m) => ({ default: m.RequestsPanel })));
const Attendance = lazy(() =>
  import('./AttendancePanel').then((m) => ({ default: m.AttendancePanel })),
);
const Review = lazy(() => import('./ReviewPanel').then((m) => ({ default: m.ReviewPanel })));

function Loading() {
  const { t } = useTranslation('common');
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loading')}>
      <Skeleton height={96} radiusKey="lg" />
    </View>
  );
}

function deferred<P extends object>(Component: ComponentType<P>) {
  return function Deferred(props: P) {
    return (
      <Suspense fallback={<Loading />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export const LazyRequestsPanel = deferred<ComponentProps<typeof RequestsPanel>>(Requests);
export const LazyAttendancePanel = deferred<ComponentProps<typeof AttendancePanel>>(Attendance);
export const LazyReviewPanel = deferred<ComponentProps<typeof ReviewPanel>>(Review);
