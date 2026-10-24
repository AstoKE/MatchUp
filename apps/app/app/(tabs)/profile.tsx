import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth';
import { EmptyState, Screen } from '@/ui';

/** Profile — needs an account. Profile content is built in Phase 2. */
export default function Profile() {
  const { t } = useTranslation('nav');
  return (
    <RequireAuth>
      <Screen>
        <EmptyState title={t('profile')} />
      </Screen>
    </RequireAuth>
  );
}
