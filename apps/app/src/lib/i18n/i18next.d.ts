import type { defaultNS, resources } from './resources';

// Type-safe translation keys: the Turkish resources are the structural source of truth, and a
// parity test guarantees English has exactly the same keys.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    // The administration and organization copy is loaded with its screens (features/admin, features/organizations), so it
    // is a type here and not a bundled resource.
    resources: (typeof resources)['tr'] & {
      admin: typeof import('@/locales/tr/admin.json');
      organizations: typeof import('@/locales/tr/organizations.json');
      organizationInvite: typeof import('@/locales/tr/organization-invite.json');
      businesses: typeof import('@/locales/tr/businesses.json');
      businessInvite: typeof import('@/locales/tr/business-invite.json');
    };
  }
}
