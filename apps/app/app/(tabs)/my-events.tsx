import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth';
import { EmptyState, Screen } from '@/ui';

/** My Events — needs an account. The dashboard itself is built in Phase 3. */
export default function MyEvents() {
  const { t } = useTranslation(['common', 'nav']);
  return (
    <RequireAuth>
      <Screen>
        <EmptyState title={t('nav:myEvents')} body={t('common:emptyDiscoverTitle')} />
      </Screen>
    </RequireAuth>
  );
}
