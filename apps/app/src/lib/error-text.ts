import { AppError } from '@matchup/domain';
import { i18n } from '@/lib/i18n';

const NETWORK_FAILURE = /network request failed|failed to fetch|networkerror|load failed/i;

/**
 * Localized, user-safe text for any failure. Domain errors carry a stable code; transport problems
 * are recognised by their wording; everything else is a generic message (never raw server text).
 */
export function errorText(error: unknown): string {
  if (error instanceof AppError) {
    return i18n.t(`errors:${error.code}` as 'errors:UNKNOWN');
  }
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && NETWORK_FAILURE.test(message)) return i18n.t('errors:NETWORK');
  return i18n.t('errors:UNKNOWN');
}
