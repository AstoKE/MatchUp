import type { ConfigContext, ExpoConfig } from 'expo/config';
import { brand } from '@matchup/config';
import { parseEnv } from './src/lib/env.schema.ts';

// Fail the build/start early (expo start, export, prebuild all evaluate this file) when the public
// configuration is missing or unsafe. Skipped only for explicit tooling runs.
if (process.env.SKIP_ENV_VALIDATION !== '1') {
  parseEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  });
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.name,
  slug: brand.identifiers.slug,
  owner: brand.identifiers.expoOwner,
  scheme: brand.identifiers.scheme,
  extra: { ...config.extra, eas: { projectId: brand.identifiers.easProjectId } },
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: brand.identifiers.appId,
    supportsTablet: true,
  },
  android: {
    package: brand.identifiers.appId,
    adaptiveIcon: {
      backgroundColor: '#F2F5F1',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    // ADR-0002: client-rendered SPA on static hosting (SDK 58 defaults to "server").
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router', 'expo-localization', 'expo-secure-store'],
  experiments: { typedRoutes: true },
});
