import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from '@/ui';
import type { EventsMap as Map } from './EventsMap';

// The map view and MapLibre stay out of the first load (docs/PERFORMANCE.md): loaded when someone switches to it.
const EventsMap = lazy(() => import('./EventsMap').then((m) => ({ default: m.EventsMap })));

export function LazyEventsMap(props: ComponentProps<typeof Map>) {
  return (
    <Suspense fallback={<Skeleton height={360} radiusKey="lg" />}>
      <EventsMap {...props} />
    </Suspense>
  );
}
