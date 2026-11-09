import * as Router from 'expo-router';
import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/ui';
import { useSession } from './session';

// Component tests replace expo-router with small mocks that have no focus hook: there every screen counts as focused.
const useIsFocused: () => boolean = Router.useIsFocused ?? (() => true);

/**
 * Route guard for screens that need an account (D-09). UX convenience only — never a security
 * boundary. Guests are sent to sign-in and returned to the same screen afterwards.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const focused = useIsFocused();
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
    // A screen kept mounted out of sight (a tab in the background) must not pull the person away: on sign-out the
    // profile tab would send them from the home page to sign-in (2026-11-09). It redirects when it comes into view.
    if (!focused) return null;
    return <Redirect href={{ pathname: '/sign-in', params: { returnTo: pathname } }} />;
  }
  return <>{children}</>;
}
