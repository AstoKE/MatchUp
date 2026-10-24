import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Public, non-secret placeholder values so the SPA can be exported when no .env is present (CI sets
// the same ones). Tests that need a real backend (auth) use the local Supabase stack instead.
const publicEnv = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key-for-build-smoke-test',
  EXPO_PUBLIC_WEB_URL: `http://localhost:${PORT}`,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Exports the SPA with the public env above, then serves it with SPA fallback (like static hosting).
    command: `pnpm run export:web && pnpm exec serve -s dist -l ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { ...publicEnv, CI: '1' },
  },
});
