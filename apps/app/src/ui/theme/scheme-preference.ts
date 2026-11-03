import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type SchemePreference = 'system' | 'light' | 'dark';

/** Kept on the device, for guests too; not a secret, stored the same way as the language (lib/i18n/locale-preference). */
const KEY = 'matchup.theme';

/** Read synchronously, so a person who chose dark never sees a flash of the default. */
export function readStoredScheme(): SchemePreference | null {
  try {
    const raw =
      Platform.OS === 'web' ? globalThis.localStorage.getItem(KEY) : SecureStore.getItem(KEY);
    return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null; // storage unavailable (private window, blocked site data): the default theme
  }
}

export function storeScheme(preference: SchemePreference): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, preference);
    else SecureStore.setItem(KEY, preference);
  } catch {
    // The choice still applies for this session.
  }
}
