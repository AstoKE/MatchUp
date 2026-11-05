import type { defaultNS, resources } from './resources';

// Type-safe translation keys: the Turkish resources are the structural source of truth, and a
// parity test guarantees English has exactly the same keys.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    // The administration copy is loaded with the console (features/admin), so it is a type here and not a bundled resource.
    resources: (typeof resources)['tr'] & { admin: typeof import('@/locales/tr/admin.json') };
  }
}
