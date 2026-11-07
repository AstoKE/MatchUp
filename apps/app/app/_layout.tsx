import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SessionProvider } from '@/features/auth';
import { PushBridge } from '@/features/notifications';
import { env } from '@/lib/env';
import { currentLocale, initI18n, prepareLanguage } from '@/lib/i18n';
import { configureLogger, initObservability, reportError } from '@/lib/observability';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { EmptyState, Screen, SkipLink, ThemeProvider, ToastProvider, useTheme } from '@/ui';

// Turkish (and English on phones) is bundled, so this is synchronous; on the web English arrives with prepareLanguage.
initI18n();
// Started at once, awaited before the first render: the remembered or device language with its texts.
const languageReady = prepareLanguage();

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
      <PushBridge />
      <ThemedStatusBar />
    </>
  );
}

export default function RootLayout() {
  // Local assets: a short wait, and a failure falls back to the system font instead of blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const [languageLoaded, setLanguageLoaded] = useState(false);
  useEffect(() => {
    let current = true;
    void languageReady.then(() => {
      if (current) setLanguageLoaded(true);
    });
    return () => {
      current = false;
    };
  }, []);
  if ((!fontsLoaded && !fontError) || !languageLoaded) return null;
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
