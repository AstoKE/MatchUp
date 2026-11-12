import { lazy, Suspense, type ReactNode } from 'react';
import { Screen, Skeleton } from '@/ui';

// Few visits need them (PERFORMANCE): the business screens load when they open.
const MyBusinessesScreen = lazy(() =>
  import('./screens').then((m) => ({ default: m.MyBusinessesScreen })),
);
const BusinessEditScreen = lazy(() =>
  import('./screens').then((m) => ({ default: m.BusinessEditScreen })),
);
const BusinessRequestScreen = lazy(() =>
  import('./screens').then((m) => ({ default: m.BusinessRequestScreen })),
);

function Loading({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Screen maxWidth={560}>
          <Skeleton height={240} radiusKey="lg" />
        </Screen>
      }
    >
      {children}
    </Suspense>
  );
}

export function LazyMyBusinessesScreen() {
  return (
    <Loading>
      <MyBusinessesScreen />
    </Loading>
  );
}

export function LazyBusinessRequestScreen() {
  return (
    <Loading>
      <BusinessRequestScreen />
    </Loading>
  );
}

export function LazyBusinessEditScreen() {
  return (
    <Loading>
      <BusinessEditScreen />
    </Loading>
  );
}
