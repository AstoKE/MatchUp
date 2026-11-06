import { fetchCatalog, type Catalog } from './api/catalog-api';
import { readCachedCatalog, writeCachedCatalog } from './catalog-cache';

/** How long a kept catalog is used without asking the server. Districts change by law, not by the hour. */
export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Kept {
  savedAt: number;
  catalog: Catalog;
}

function parse(json: string | null): Kept | null {
  if (!json) return null;
  try {
    const kept = JSON.parse(json) as Partial<Kept>;
    const ok =
      typeof kept.savedAt === 'number' &&
      Array.isArray(kept.catalog?.cities) &&
      Array.isArray(kept.catalog?.sports) &&
      kept.catalog.cities.length > 0;
    return ok ? (kept as Kept) : null;
  } catch {
    return null;
  }
}

/**
 * The catalog: from the device when it was saved less than a day ago, else from the server (and saved). When the server
 * cannot be reached, an older saved catalog is better than none: the app still opens offline.
 */
export async function loadCatalog(now: number = Date.now()): Promise<Catalog> {
  const kept = parse(await readCachedCatalog());
  if (kept && now - kept.savedAt < CATALOG_MAX_AGE_MS) return kept.catalog;
  try {
    const catalog = await fetchCatalog();
    void writeCachedCatalog(JSON.stringify({ savedAt: now, catalog } satisfies Kept));
    return catalog;
  } catch (error) {
    if (kept) return kept.catalog;
    throw error;
  }
}
