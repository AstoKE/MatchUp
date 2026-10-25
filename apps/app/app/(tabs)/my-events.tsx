import { useTranslation } from 'react-i18next';
import { VerifyEmailBanner } from '@/features/auth';
import { RequireOnboarded } from '@/features/onboarding';
import { EmptyState, Screen } from '@/ui';

/** My Events — needs an account. The dashboard itself is built in Phase 3. */
export default function MyEvents() {
  const { t } = useTranslation(['common', 'nav']);
  return (
    <RequireOnboarded>
      <Screen>
        <VerifyEmailBanner />
        <EmptyState title={t('nav:myEvents')} body={t('common:emptyDiscoverTitle')} />
      </Screen>
    </RequireOnboarded>
  );
}
