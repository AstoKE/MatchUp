import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** One sport, or every sport. Nothing stored means the person has not chosen yet, and Discover asks. */
export const ALL_SPORTS = 'ALL';

/** Kept on the device, for guests too; not a secret, stored the same way as the language (lib/i18n/locale-preference). */
const KEY = 'matchup.discover.sport';

export async function readDiscoverSport(): Promise<string | null> {
  try {
    return Platform.OS === 'web'
      ? globalThis.localStorage.getItem(KEY)
      : await SecureStore.getItemAsync(KEY);
  } catch {
    return null; // storage unavailable (private window, blocked site data): ask again
  }
}

export async function storeDiscoverSport(choice: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, choice);
    else await SecureStore.setItemAsync(KEY, choice);
  } catch {
    // The choice still applies for this session.
  }
}
