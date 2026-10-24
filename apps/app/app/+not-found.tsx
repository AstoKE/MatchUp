import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/ui';

export default function NotFound() {
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
