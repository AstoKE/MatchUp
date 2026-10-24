import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SessionProvider } from '@/features/auth';
import { env } from '@/lib/env';
import { currentLocale, initI18n } from '@/lib/i18n';
import { configureLogger, initObservability, reportError } from '@/lib/observability';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { EmptyState, Screen, SkipLink, ThemeProvider, ToastProvider, useTheme } from '@/ui';

// Bundled resources, so initialization is synchronous and complete before first render.
initI18n();

// Development shows debug logs; release builds keep warnings and errors. Error reporting starts only
// when a DSN is configured, and everything is redacted before it leaves the device.
configureLogger({ minLevel: env.EXPO_PUBLIC_APP_ENV === 'development' ? 'debug' : 'warn' });
initObservability();

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/** Keeps <html lang> in sync with the UI language (screen-reader pronunciation, WCAG 3.1.1). */
function useDocumentLanguage() {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = currentLocale();
  }, [i18n.language]);
}

function Shell() {
  useDocumentLanguage();
  return (
    <>
      <SkipLink />
      <Stack screenOptions={{ headerShown: false }} />
      <ThemedStatusBar />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryProvider>
          <ToastProvider>
            <SessionProvider>
              <Shell />
            </SessionProvider>
          </ToastProvider>
        </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Last-resort boundary for render errors in any route (expo-router convention). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError('app', 'RENDER_ERROR', error);
  }, [error]);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBody onRetry={() => void retry()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ErrorBody({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['errors', 'common']);
  return (
    <Screen>
      <EmptyState title={t('errors:UNKNOWN')} actionLabel={t('common:retry')} onAction={onRetry} />
    </Screen>
  );
}
