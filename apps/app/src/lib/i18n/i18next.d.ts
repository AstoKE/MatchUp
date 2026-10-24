import type { defaultNS, resources } from './resources';

// Type-safe translation keys: the Turkish resources are the structural source of truth, and a
// parity test guarantees English has exactly the same keys.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['tr'];
  }
}
