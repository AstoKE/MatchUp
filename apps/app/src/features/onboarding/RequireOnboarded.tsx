import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth';
import { errorText } from '@/lib/error-text';
import { EmptyState, useTheme } from '@/ui';
import { useMyAccount } from './hooks';

/**
 * Route guard for screens that need a completed profile (18+ confirmed, consent recorded). Guests go
 * to sign-in; signed-in users who have not onboarded go to the onboarding flow and come back here.
 * UX only — the database enforces the same rule on every write (private.assert_onboarded_user).
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <OnboardedGate>{children}</OnboardedGate>
    </RequireAuth>
  );
}

function OnboardedGate({ children }: { children: ReactNode }) {
  const account = useMyAccount();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { t } = useTranslation('common');

  if (account.isPending) {
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
  if (account.isError) {
    return (
      <EmptyState
        title={errorText(account.error)}
        actionLabel={t('retry')}
        onAction={() => void account.refetch()}
      />
    );
  }
  if (!account.data.onboarded) {
    return <Redirect href={{ pathname: '/onboarding', params: { returnTo: pathname } }} />;
  }
  return <>{children}</>;
}
