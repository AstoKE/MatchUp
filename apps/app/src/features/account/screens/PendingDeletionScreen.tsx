import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth, signOut } from '@/features/auth';
import { useMyAccount } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { Banner, Button, EmptyState, Screen, Text, useTheme } from '@/ui';
import { useCancelDeletion } from '../hooks';

/**
 * Where a signed-in account in its 30-day grace period lands (RequireOnboarded sends it here): the
 * purge date, cancel, or sign out. Everything else stays blocked by the server meanwhile.
 */
export function PendingDeletionScreen() {
  return (
    <RequireAuth>
      <PendingDeletion />
    </RequireAuth>
  );
}

function PendingDeletion() {
  const { t, i18n } = useTranslation(['account', 'auth', 'common']);
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const account = useMyAccount();
  const cancel = useCancelDeletion();
  const logout = useMutation({ mutationFn: signOut, onSuccess: () => router.replace('/') });
  const [error, setError] = useState<string | null>(null);

  if (account.isPending) {
    return (
      <Screen maxWidth={560}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  if (account.isError) {
    return (
      <Screen maxWidth={560}>
        <EmptyState
          title={errorText(account.error)}
          actionLabel={t('common:retry')}
          onAction={() => void account.refetch()}
        />
      </Screen>
    );
  }
  if (account.data.status !== 'PENDING_DELETION' || !account.data.deletionDueAt) {
    return <Redirect href="/" />;
  }

  const due = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
    new Date(account.data.deletionDueAt),
  );

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('account:pending.title')}
      </Text>
      <Text>{t('account:pending.body', { date: due })}</Text>
      <Text tone="secondary">{t('account:pending.meanwhile')}</Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <View style={{ gap: spacing[3] }}>
        <Button
          label={t('account:pending.cancel')}
          loading={cancel.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => {
            setError(null);
            cancel.mutate(undefined, {
              onSuccess: () => router.replace('/profile'),
              onError: (failure) => setError(errorText(failure)),
            });
          }}
          fullWidth
        />
        <Button
          variant="secondary"
          label={t('auth:signOut')}
          loading={logout.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => logout.mutate()}
          fullWidth
        />
      </View>
    </Screen>
  );
}
