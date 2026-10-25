import { i18n } from '@/lib/i18n';

/** Turns the stable validation keys from `@matchup/domain` profile schemas into localized text. */
export function profileValidationMessage(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  const full = `profile:validation.${key}`;
  return i18n.exists(full)
    ? i18n.t(full as 'profile:validation.NAME_INVALID')
    : i18n.t('errors:VALIDATION_FAILED');
}
