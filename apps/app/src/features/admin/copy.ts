import { i18n } from '@/lib/i18n';
import enAdmin from '@/locales/en/admin.json';
import trAdmin from '@/locales/tr/admin.json';

let added = false;

/**
 * The console's copy travels with the console, not with the app: nobody but an administrator ever needs it. Called when the
 * console first renders, which is after i18n started, and safe to call again.
 */
export function ensureAdminCopy(): void {
  if (added) return;
  i18n.addResourceBundle('tr', 'admin', trAdmin, true, true);
  i18n.addResourceBundle('en', 'admin', enAdmin, true, true);
  added = true;
}
