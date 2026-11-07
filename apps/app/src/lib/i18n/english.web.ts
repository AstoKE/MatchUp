import type { enResources } from './en-resources';

/**
 * The web: English is its own chunk, downloaded only by people who use it (the first load carries Turkish, the default
 * and fallback). PERFORMANCE §4 item 5.
 */
export const bundledEnglish: typeof enResources | null = null;
export const loadEnglish = (): Promise<typeof enResources> =>
  import('./en-resources').then((m) => m.enResources);
