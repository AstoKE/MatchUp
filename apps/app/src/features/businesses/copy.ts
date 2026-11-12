import { i18n } from '@/lib/i18n';
import enBusinesses from '@/locales/en/businesses.json';
import trBusinesses from '@/locales/tr/businesses.json';

let added = false;

/** The business screens' copy travels with their lazy chunk (PERFORMANCE; as the organizations'). Safe to call again. */
export function ensureBusinessesCopy(): void {
  if (added) return;
  i18n.addResourceBundle('tr', 'businesses', trBusinesses, true, true);
  i18n.addResourceBundle('en', 'businesses', enBusinesses, true, true);
  added = true;
}
