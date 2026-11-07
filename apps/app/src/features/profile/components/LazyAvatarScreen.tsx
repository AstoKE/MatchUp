import { lazy, Suspense } from 'react';
import { Screen, Skeleton } from '@/ui';

// The avatar screen carries the photo picker and the image manipulator (PERFORMANCE): they load when it opens, not
// with Discover, which imports the profile feature for the header avatar.
const AvatarScreen = lazy(() =>
  import('../screens/AvatarScreen').then((m) => ({ default: m.AvatarScreen })),
);

export function LazyAvatarScreen() {
  return (
    <Suspense
      fallback={
        <Screen maxWidth={560}>
          <Skeleton height={320} radiusKey="lg" />
        </Screen>
      }
    >
      <AvatarScreen />
    </Suspense>
  );
}
