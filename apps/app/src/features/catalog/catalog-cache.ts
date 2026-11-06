import { File, Paths } from 'expo-file-system';

/**
 * The catalog kept between starts (Phase 7 / M3): 81 provinces and 973 districts are ~150 kB and change only with a
 * migration, so the app asks for them at most once a day. Native: a file in the app's private cache (the OS may clear
 * it; then the next start downloads again). Never holds anything personal.
 */
const FILE = 'catalog-v1.json';

export async function readCachedCatalog(): Promise<string | null> {
  try {
    const file = new File(Paths.cache, FILE);
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

export async function writeCachedCatalog(json: string): Promise<void> {
  try {
    const file = new File(Paths.cache, FILE);
    file.create({ overwrite: true });
    await file.write(json);
  } catch {
    // Not cached this time: the next start downloads again.
  }
}
