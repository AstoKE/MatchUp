import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SessionProvider } from '@/features/auth';
import { currentLocale, initI18n } from '@/lib/i18n';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { EmptyState, Screen, SkipLink, ThemeProvider, ToastProvider, useTheme } from '@/ui';

// Bundled resources, so initialization is synchronous and complete before first render.
initI18n();

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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}

/** Last-resort boundary for render errors in any route (expo-router convention). */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
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
