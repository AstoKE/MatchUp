import { Redirect, useRouter, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth, signOut } from '@/features/auth';
import { SupportContact } from '@/features/settings';
import { errorText } from '@/lib/error-text';
import { EmptyState, Screen, useTheme } from '@/ui';
import { useMyAccount } from './hooks';

/**
 * Route guard for screens that need a completed profile (18+ confirmed, consent recorded). Guests go
 * to sign-in; signed-in users who have not onboarded go to the onboarding flow, and onboarded users
 * whose consent predates the current legal versions go to the re-consent screen; both come back here.
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
  // A suspended person is told that, and nothing else: no reason, and no way to use the app (the server refuses every write).
  if (account.data.status === 'SUSPENDED') {
    return <SuspendedPage />;
  }
  // A pending deletion outranks everything: the only things left to do are cancel or sign out.
  if (account.data.status === 'PENDING_DELETION') {
    return <Redirect href="/account-deletion" />;
  }
  if (!account.data.onboarded) {
    return <Redirect href={{ pathname: '/onboarding', params: { returnTo: pathname } }} />;
  }
  // Phase 8 (ADR-0029): when the server requires a verified phone, it comes before anything else is done.
  if (account.data.phoneRequired && !account.data.phoneVerified) {
    return <Redirect href={{ pathname: '/verify-phone', params: { returnTo: pathname } }} />;
  }
  if (!account.data.legalConsentCurrent) {
    return <Redirect href={{ pathname: '/consent-update', params: { returnTo: pathname } }} />;
  }
  return <>{children}</>;
}

function SuspendedPage() {
  const { t } = useTranslation('account');
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title={t('suspended.title')}
        body={t('suspended.body')}
        actionLabel={t('suspended.signOut')}
        onAction={() => void signOut().then(() => router.replace('/'))}
      />
      <SupportContact align="center" />
    </Screen>
  );
}
