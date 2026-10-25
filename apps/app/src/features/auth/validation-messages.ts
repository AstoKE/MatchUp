import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@matchup/domain';
import { i18n } from '@/lib/i18n';
import { AuthFlowError, failureMessage, type AuthFailure } from './api/classify-auth-error';

/** Turns the stable validation keys emitted by `@matchup/domain` auth schemas into localized text. */
export function validationMessage(key: string | undefined): string | undefined {
  switch (key) {
    case undefined:
      return undefined;
    case 'EMAIL_INVALID':
      return i18n.t('auth:validation.emailInvalid');
    case 'PASSWORD_REQUIRED':
      return i18n.t('auth:validation.passwordRequired');
    case 'PASSWORD_TOO_SHORT':
      return i18n.t('auth:validation.passwordTooShort', { min: PASSWORD_MIN_LENGTH });
    case 'PASSWORD_TOO_LONG':
      return i18n.t('auth:validation.passwordTooLong', { max: PASSWORD_MAX_LENGTH });
    default:
      return i18n.t('errors:VALIDATION_FAILED');
  }
}

/** Localized text for any error thrown by the auth API (unknown errors stay generic). */
export function authErrorText(error: unknown): string {
  return failureText(error instanceof AuthFlowError ? error.failure : 'UNKNOWN');
}

export function failureText(failure: AuthFailure): string {
  const { ns, key } = failureMessage(failure);
  return ns === 'auth'
    ? i18n.t(`auth:${key}` as 'auth:signIn')
    : i18n.t(`errors:${key}` as 'errors:UNKNOWN');
}
