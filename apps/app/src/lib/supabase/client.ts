import 'react-native-url-polyfill/auto';
import './crypto-polyfill';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import type { Database } from '@/types/supabase.generated';
import { env } from '../env';
import { createChunkedStorage } from './chunked-storage';

/**
 * The single Supabase client. It only ever holds the PUBLIC anon/publishable key (env.ts rejects
 * service-role/secret keys), so everything it can do is bounded by RLS and RPC checks.
 *
 * Session storage: native → OS keystore (chunked SecureStore); web → supabase-js default
 * (localStorage), protected by CSP/HTTPS headers (SECURITY §3). PKCE flow is used for email links.
 */
const nativeStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      // Readable after first unlock so background token refresh works, never synced/backed up.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});

export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      ...(Platform.OS === 'web' ? {} : { storage: nativeStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  },
);

// Native apps have no page-visibility events: pause token refresh in the background.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
