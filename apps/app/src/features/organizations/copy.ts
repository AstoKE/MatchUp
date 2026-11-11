import { i18n } from '@/lib/i18n';
import enOrganizations from '@/locales/en/organizations.json';
import trOrganizations from '@/locales/tr/organizations.json';

let added = false;

/**
 * The organization screens' copy travels with them, not with the first load (PERFORMANCE; same as the console's). Called
 * when one of them renders, which is after i18n started, and safe to call again.
 */
export function ensureOrganizationsCopy(): void {
  if (added) return;
  i18n.addResourceBundle('tr', 'organizations', trOrganizations, true, true);
  i18n.addResourceBundle('en', 'organizations', enOrganizations, true, true);
  added = true;
}
