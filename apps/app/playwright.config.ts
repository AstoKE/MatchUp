import { defineConfig, devices } from '@playwright/test';

import { join } from 'node:path';

const PORT = 4173;

// Load apps/app/.env.local (written by `pnpm env:local`) BEFORE building the public env below, so the
// exported SPA talks to the local Supabase stack. Existing environment variables win (CI).
try {
  process.loadEnvFile(join(__dirname, '.env.local'));
} catch {
  /* no local env file: placeholder values are used */
}

// Public, non-secret placeholder values so the SPA can be exported when no .env is present (CI sets
// the same ones). Tests that need a real backend (auth) use the local Supabase stack instead.
const publicEnv = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key-for-build-smoke-test',
  EXPO_PUBLIC_WEB_URL: `http://localhost:${PORT}`,
};

// `.env.local` can point at the hosted project (`pnpm env:hosted`), and the app under test would then sign up and sign in there.
if (!['127.0.0.1', 'localhost'].includes(new URL(publicEnv.EXPO_PUBLIC_SUPABASE_URL).hostname)) {
  throw new Error('E2E runs only against the local stack: run `pnpm env:local` first.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Locally Chromium shares the machine with the Supabase containers: more workers ran a 15 GB laptop out of memory.
  ...(process.env.CI ? {} : { workers: 3 }),
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
