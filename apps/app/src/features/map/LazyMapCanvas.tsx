import { lazy, Suspense } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/ui';
import type { MapCanvasProps } from './types';

// MapLibre is large (on the web about 250 kB gzip): it is loaded only when a map is actually shown, never in the first
// load (docs/PERFORMANCE.md, ratchet MAP in scripts/check-bundle-size.mjs). Metro picks MapCanvas.web.tsx on the web.
const MapCanvas = lazy(() => import('./MapCanvas'));

export function LazyMapCanvas(props: MapCanvasProps) {
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loading')}>
          <Skeleton height={props.height} radiusKey="lg" />
        </View>
      }
    >
      <MapCanvas {...props} />
    </Suspense>
  );
}
