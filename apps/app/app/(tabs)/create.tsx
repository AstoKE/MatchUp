import { useTranslation } from 'react-i18next';
import { VerifyEmailBanner } from '@/features/auth';
import { RequireOnboarded } from '@/features/onboarding';
import { EmptyState, Screen } from '@/ui';

/** Create — needs an account. The guided creation flow is built in Phase 3. */
export default function Create() {
  const { t } = useTranslation('nav');
  return (
    <RequireOnboarded>
      <Screen>
        <VerifyEmailBanner />
        <EmptyState title={t('create')} />
      </Screen>
    </RequireOnboarded>
  );
}
