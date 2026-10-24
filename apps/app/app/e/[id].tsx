import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/ui';

/**
 * Public event route (deep link target: /e/<id>). Events do not exist until the Event Engine ships
 * (Phase 3), so every id is honestly "not found" for now.
 */
export default function EventDetail() {
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
