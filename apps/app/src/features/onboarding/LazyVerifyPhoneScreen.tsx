import { lazy, Suspense } from 'react';
import { Screen, Skeleton } from '@/ui';

// Most visits never need it (PERFORMANCE): the phone screen loads when it opens.
const VerifyPhoneScreen = lazy(() =>
  import('./screens/VerifyPhoneScreen').then((m) => ({ default: m.VerifyPhoneScreen })),
);

export function LazyVerifyPhoneScreen() {
  return (
    <Suspense
      fallback={
        <Screen maxWidth={560}>
          <Skeleton height={240} radiusKey="lg" />
        </Screen>
      }
    >
      <VerifyPhoneScreen />
    </Suspense>
  );
}
