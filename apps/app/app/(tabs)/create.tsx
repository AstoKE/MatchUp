import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth';
import { EmptyState, Screen } from '@/ui';

/** Create — needs an account. The guided creation flow is built in Phase 3. */
export default function Create() {
  const { t } = useTranslation('nav');
  return (
    <RequireAuth>
      <Screen>
        <EmptyState title={t('create')} />
      </Screen>
    </RequireAuth>
  );
}
