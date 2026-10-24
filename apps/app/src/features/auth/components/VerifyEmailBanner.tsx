import { useTranslation } from 'react-i18next';
import { Banner } from '@/ui';
import { useSession } from '../session';

/** Shown to a signed-in user whose email is not verified. UX only: the database blocks the actions. */
export function VerifyEmailBanner() {
  const session = useSession();
  const { t } = useTranslation('auth');
  if (session.status !== 'authenticated' || session.emailVerified) return null;
  return <Banner kind="warning" message={t('unverifiedBanner')} />;
}
