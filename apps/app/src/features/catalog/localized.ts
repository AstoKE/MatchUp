import type { Locale } from '@matchup/config';
import type { LocalizedName } from './api/catalog-api';

/** Picks the name for the UI language; the other language is a safe fallback. */
export function localizedName(names: LocalizedName, locale: Locale): string {
  return names[locale] || names.tr || names.en;
}
