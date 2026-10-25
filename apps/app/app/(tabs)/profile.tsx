import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RequireAuth, signOut, useSession, VerifyEmailBanner } from '@/features/auth';
import { LanguagePicker } from '@/features/settings';
import { Button, EmptyState, Screen, Text } from '@/ui';

/** Profile — needs an account. Profile content is built in Phase 2; sign-out is needed already. */
export default function Profile() {
  const { t } = useTranslation(['nav', 'auth', 'common']);
  const session = useSession();
  const router = useRouter();
  // After signing out, land on the guest home page rather than a sign-in prompt.
  const logout = useMutation({ mutationFn: signOut, onSuccess: () => router.replace('/') });
  return (
    <RequireAuth>
      <Screen>
        <VerifyEmailBanner />
        <EmptyState title={t('nav:profile')} />
        {session.status === 'authenticated' && session.email ? (
          <Text tone="secondary" style={{ textAlign: 'center' }}>
            {t('auth:signedInAs', { email: session.email })}
          </Text>
        ) : null}
        <LanguagePicker />
        <Button
          label={t('auth:signOut')}
          variant="secondary"
          loading={logout.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => logout.mutate()}
        />
      </Screen>
    </RequireAuth>
  );
}
