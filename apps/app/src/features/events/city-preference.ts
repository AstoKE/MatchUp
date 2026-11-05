import { defaultCityId } from '@matchup/domain';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Catalog } from '@/features/catalog';

/**
 * The province last picked in Discover, kept on the device for guests too (ADR-0024 §6). Not a secret, stored the same
 * way as the theme; read synchronously so the list does not first load another province.
 */
const KEY = 'matchup.city';

export function readStoredCity(): string | null {
  try {
    return Platform.OS === 'web' ? globalThis.localStorage.getItem(KEY) : SecureStore.getItem(KEY);
  } catch {
    return null; // storage unavailable (private window, blocked site data)
  }
}

export function storeCity(cityId: string): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, cityId);
    else SecureStore.setItem(KEY, cityId);
  } catch {
    // The choice still applies for this session.
  }
}

/** Profile province, else the last pick on this device (`readStoredCity`), else Ankara. */
export function startingCityId(
  catalog: Catalog,
  profileCityId: string | null | undefined,
  storedCityId: string | null,
): string | null {
  return defaultCityId(catalog.cities, { profileCityId, storedCityId });
}
