import { isSupportedLocale, type Locale } from '@matchup/config';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The language the user picked inside the app. It overrides the device language and works for
 * guests too; for signed-in users it can later be mirrored to `user_settings.locale`. It is not a
 * secret, but the keystore is already a dependency and has the same API on both native platforms.
 */
const KEY = 'matchup.locale';

export async function readStoredLocale(): Promise<Locale | null> {
  try {
    const raw =
      Platform.OS === 'web'
        ? globalThis.localStorage.getItem(KEY)
        : await SecureStore.getItemAsync(KEY);
    return raw && isSupportedLocale(raw) ? raw : null;
  } catch {
    return null; // storage unavailable (private window, blocked site data): fall back to the device language
  }
}

export async function storeLocale(locale: Locale): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, locale);
    else await SecureStore.setItemAsync(KEY, locale);
  } catch {
    // The choice still applies for this session.
  }
}
