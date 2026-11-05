import { lazy, Suspense, type ComponentProps } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui';
import type { EventStepper as Stepper } from './EventStepper';

// The event form is shared by the create and edit routes, so Metro's web splitting put it in the chunk every first visit
// loads (docs/PERFORMANCE.md §4 item 5). Loaded on demand, it costs only the people who open a form.
const EventStepper = lazy(() =>
  import('./EventStepper').then((m) => ({ default: m.EventStepper })),
);

export function LazyEventStepper(props: ComponentProps<typeof Stepper>) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      }
    >
      <EventStepper {...props} />
    </Suspense>
  );
}
