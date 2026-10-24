import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionContext, type SessionState } from '@/features/auth';
import { initI18n } from '@/lib/i18n';
import { ThemeProvider, ToastProvider } from '@/ui';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Renders with the same provider stack as the app (theme, i18n, query, toast, session). */
export async function renderApp(
  ui: ReactElement,
  options: { session?: SessionState; locale?: 'tr' | 'en' } = {},
) {
  initI18n(options.locale ?? 'tr');
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <SessionContext.Provider value={options.session ?? { status: 'guest' }}>
              {ui}
            </SessionContext.Provider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
