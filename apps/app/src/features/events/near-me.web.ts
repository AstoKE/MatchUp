import type { NearMeResult } from './near-me';

/**
 * The web version of locateMe: the browser's own Geolocation API, asked once. expo-location would add a chunk and its
 * loader to the first load for the same thing (docs/PERFORMANCE.md).
 */
export function locateMe(): Promise<NearMeResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ error: 'UNAVAILABLE' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ point: { lat: position.coords.latitude, lon: position.coords.longitude } }),
      (error) =>
        resolve({ error: error.code === error.PERMISSION_DENIED ? 'DENIED' : 'UNAVAILABLE' }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
