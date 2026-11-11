import { lazy, Suspense, type ReactNode } from 'react';
import { Screen, Skeleton } from '@/ui';

// Few visits need them (PERFORMANCE): the organization screens load when they open.
const MyOrganizationsScreen = lazy(() =>
  import('./screens').then((m) => ({ default: m.MyOrganizationsScreen })),
);
const OrganizationRequestScreen = lazy(() =>
  import('./screens').then((m) => ({ default: m.OrganizationRequestScreen })),
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

export function LazyMyOrganizationsScreen() {
  return (
    <Loading>
      <MyOrganizationsScreen />
    </Loading>
  );
}

export function LazyOrganizationRequestScreen() {
  return (
    <Loading>
      <OrganizationRequestScreen />
    </Loading>
  );
}
