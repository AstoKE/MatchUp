import type { GeoPoint } from '@matchup/domain';
import * as Location from 'expo-location';

export type NearMeResult = { point: GeoPoint } | { error: 'DENIED' | 'UNAVAILABLE' };

/**
 * The device's position, once, after asking (SECURITY §7: location is optional and transient). Never stored or sent
 * anywhere but the one search. Native only: the web uses near-me.web.ts.
 */
export async function locateMe(): Promise<NearMeResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { error: 'DENIED' };
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { point: { lat: position.coords.latitude, lon: position.coords.longitude } };
  } catch {
    return { error: 'UNAVAILABLE' };
  }
}
