import { Redirect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth';
import { useMyAccount } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { EmptyState, Screen, useTheme } from '@/ui';
import { MfaChallenge, MfaEnroll } from './components/MfaPanels';
import { ensureAdminCopy } from './copy';
import { useAdminSecurity } from './hooks';
import Console from './screens/AdminScreen';

function Waiting() {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <ActivityIndicator color={colors.textSecondary} />
    </View>
  );
}

/**
 * /admin. A guest signs in first. Anyone who is no administrator sees the page of a route that does not exist, so the
 * console is not even confirmed. An administrator with a first factor only is asked for the second, or helped to set it
 * up. This is convenience: the database refuses every admin call without aal2 (S-14).
 */
export default function AdminGate() {
  ensureAdminCopy();
  return (
    <RequireAuth>
      <Gate />
    </RequireAuth>
  );
}

function NotThere() {
  const { t } = useTranslation(['errors', 'nav']);
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title={t('errors:NOT_FOUND')}
        actionLabel={t('nav:discover')}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}

function Gate(): ReactNode {
  const { t } = useTranslation('common');
  const router = useRouter();
  const account = useMyAccount();
  const isAdmin = account.data?.isAdmin === true;
  // Nobody who is no administrator even gets as far as asking about a second factor.
  const security = useAdminSecurity(isAdmin);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (account.isPending) return <Waiting />;
  if (account.isError) {
    return (
      <Screen>
        <EmptyState
          title={errorText(account.error)}
          actionLabel={t('retry')}
          onAction={() => void account.refetch()}
        />
      </Screen>
    );
  }
  if (!isAdmin) return <NotThere />;
  if (account.data.status === 'PENDING_DELETION') return <Redirect href="/account-deletion" />;
  if (security.isPending) return <Waiting />;
  if (security.isError) {
    return (
      <Screen>
        <EmptyState
          title={errorText(security.error)}
          actionLabel={t('retry')}
          onAction={() => void security.refetch()}
        />
      </Screen>
    );
  }
  if (!security.data.secondFactorDone) {
    return security.data.factorId ? (
      <MfaChallenge factorId={security.data.factorId} onBack={back} />
    ) : (
      <MfaEnroll onBack={back} />
    );
  }
  return <Console />;
}
