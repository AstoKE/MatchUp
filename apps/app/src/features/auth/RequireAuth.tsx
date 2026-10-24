import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui';
import { useSession } from './session';

/**
 * Route guard for screens that need an account (D-09). UX convenience only — never a security
 * boundary. Guests are sent to sign-in and returned to the same screen afterwards.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { t } = useTranslation('common');

  if (session.status === 'loading') {
    return (
      <View
        accessible
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel={t('loading')}
        accessibilityRole="progressbar"
      >
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  if (session.status === 'guest') {
    return <Redirect href={{ pathname: '/sign-in', params: { returnTo: pathname } }} />;
  }
  return <>{children}</>;
}
