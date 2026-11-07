import type { ConfigContext, ExpoConfig } from 'expo/config';
import { brand } from '@matchup/config';
import { parseEnv } from './src/lib/env.schema.ts';

// Fail the build/start early (expo start, export, prebuild all evaluate this file) when the public
// configuration is missing or unsafe. Skipped only for explicit tooling runs.
if (process.env.SKIP_ENV_VALIDATION !== '1') {
  const env = parseEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  });
  // Real users must be able to reach a person, also from the suspended-account page (LAUNCH_CHECKLIST §3).
  if (env.EXPO_PUBLIC_APP_ENV === 'production' && !brand.contact.supportEmail) {
    throw new Error(
      'brand.contact.supportEmail (packages/config) must be set for a production build.',
    );
  }
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
    // "Near me" needs only an approximate position (SECURITY §7): iOS gives the reduced one unless the person changes it.
    infoPlist: { NSLocationDefaultAccuracyReduced: true },
  },
  android: {
    package: brand.identifiers.appId,
    // Approximate location only: the precise permission is never requested.
    blockedPermissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      // The photo picker needs neither (ADR-0027).
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
    ],
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
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-secure-store',
    // Phase 4 / M5: the map is native code (a new development build is needed after this change).
    '@maplibre/maplibre-react-native',
    // "Near me" only: asked when the person taps it, never in the background, never stored (SECURITY §7).
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Yakınındaki etkinlikleri sıralamak için, yalnızca sen istediğinde kullanılır. / Used only when you ask, to sort nearby events.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    // Phase 8 / M4: push notifications (ADR-0028). iOS needs an APNs key in EAS credentials, Android an FCM key.
    'expo-notifications',
    // Phase 8 / M3: a profile photo from the library only. No camera, no microphone (privacy by default, ADR-0027).
    [
      'expo-image-picker',
      {
        photosPermission:
          'Profil fotoğrafı seçmek için, yalnızca sen istediğinde kullanılır. / Used only when you ask, to pick a profile photo.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
});
