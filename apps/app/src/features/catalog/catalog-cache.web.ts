/** The web version of catalog-cache.ts: localStorage (~150 kB of a few MB). Private windows may refuse; then no cache. */
const KEY = 'matchup.catalog.v1';

export async function readCachedCatalog(): Promise<string | null> {
  try {
    return globalThis.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeCachedCatalog(json: string): Promise<void> {
  try {
    globalThis.localStorage.setItem(KEY, json);
  } catch {
    // Quota or a blocked storage: not cached this time.
  }
}
