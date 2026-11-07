import { enResources } from './en-resources';

/** Phones (and tests): English is part of the bundle, ready at start. The web version loads it on demand. */
export const bundledEnglish: typeof enResources | null = enResources;
export const loadEnglish = (): Promise<typeof enResources> => Promise.resolve(enResources);
