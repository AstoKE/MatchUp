import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { exchangeCode } from '../api/auth-api';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { sanitizeCallbackNext } from '../returnTo';
import { useSession } from '../session';

/**
 * Landing page for emailed links (verify / recover).
 *  - Web: supabase-js detects the PKCE `code` in the URL and signs in by itself; we just wait.
 *  - Native: the deep link opens this route with `?code=`; we exchange it ourselves (single use).
 * Anything that does not end in a session is shown as an invalid/expired link.
 */
export function AuthCallbackScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<{
    code?: string;
    next?: string;
    error?: string;
    error_description?: string;
  }>();
  const [failed, setFailed] = useState(Boolean(params.error));
  const exchanged = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !params.code || exchanged.current) return;
    exchanged.current = true;
    exchangeCode(params.code).catch(() => setFailed(true));
  }, [params.code]);

  const next = sanitizeCallbackNext(params.next);
  useEffect(() => {
    // Once the emailed link produced a session, continue to the allow-listed destination.
    if (session.status === 'authenticated') router.replace(next);
  }, [session.status, router, next]);

  // No session within a few seconds and no code to wait for → the link is not usable.
  useEffect(() => {
    if (session.status === 'authenticated') return;
    const timer = setTimeout(() => setFailed(true), 8000);
    return () => clearTimeout(timer);
  }, [session.status]);

  if (failed && session.status !== 'authenticated') {
    return (
      <AuthScreenLayout title={t('linkInvalidTitle')} subtitle={t('linkInvalidBody')}>
        <AuthLink href="/sign-in" label={t('backToSignIn')} />
      </AuthScreenLayout>
    );
  }
  return (
    <AuthScreenLayout title={t('verifying')}>
      <ActivityIndicator accessibilityLabel={t('verifying')} />
    </AuthScreenLayout>
  );
}
