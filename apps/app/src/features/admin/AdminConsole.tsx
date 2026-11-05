import { lazy, Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui';

// The whole console (gate, second factor, screens, server calls, copy) is one chunk: it stays out of the first load of
// everybody else, and the phone app does not contain it at all (the route exists on the web only).
const Gate = lazy(() => import('./AdminGate'));

/** /admin. */
export function AdminConsole() {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('loading')}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      }
    >
      <Gate />
    </Suspense>
  );
}
