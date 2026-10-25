import type { AppErrorCode } from '@matchup/domain';

/** Auth-specific outcomes plus the shared transport/domain codes. */
export type AuthFailure =
  'INVALID_CREDENTIALS' | 'EMAIL_NOT_CONFIRMED' | 'CAPTCHA_FAILED' | AppErrorCode;

interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
  message?: string | undefined;
}

/**
 * Maps a Supabase Auth error to a stable failure code. Pure and dependency-free so it is unit
 * testable. Never surfaces raw server text to users, and never distinguishes "no such user" from
 * "wrong password" (account enumeration).
 */
export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthFailure {
  if (!error) return 'UNKNOWN';
  const { code, status, name } = error;

  if (code === 'invalid_credentials') return 'INVALID_CREDENTIALS';
  if (code === 'email_not_confirmed') return 'EMAIL_NOT_CONFIRMED';
  // Missing, expired, reused or rejected Turnstile token (Supabase Auth CAPTCHA protection).
  if (code === 'captcha_failed') return 'CAPTCHA_FAILED';
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_sms_send_rate_limit'
  ) {
    return 'RATE_LIMITED';
  }
  if (code === 'weak_password' || code === 'validation_failed') return 'VALIDATION_FAILED';
  if (name === 'AbortError' || name === 'TimeoutError') return 'TIMEOUT';
  // supabase-js reports unreachable servers as AuthRetryableFetchError with status 0 (or 5xx proxies).
  if (name === 'AuthRetryableFetchError' || status === 0) return 'NETWORK';
  return 'UNKNOWN';
}

export class AuthFlowError extends Error {
  readonly failure: AuthFailure;
  constructor(failure: AuthFailure, options?: { cause?: unknown }) {
    super(failure, options);
    this.name = 'AuthFlowError';
    this.failure = failure;
  }
}

/** i18n key (namespace `auth`) or shared error key (namespace `errors`) for a failure. */
export function failureMessage(failure: AuthFailure): { ns: 'auth' | 'errors'; key: string } {
  switch (failure) {
    case 'INVALID_CREDENTIALS':
      return { ns: 'auth', key: 'errors.invalidCredentials' };
    case 'EMAIL_NOT_CONFIRMED':
      return { ns: 'auth', key: 'errors.emailNotConfirmed' };
    case 'RATE_LIMITED':
      return { ns: 'auth', key: 'errors.rateLimited' };
    case 'CAPTCHA_FAILED':
      return { ns: 'auth', key: 'errors.captchaFailed' };
    default:
      return { ns: 'errors', key: failure };
  }
}

/**
 * Supabase Auth answers a sign-up for an already-confirmed address with `user_already_exists`
 * (observed on the local stack; an API-level enumeration signal we cannot remove client-side).
 * The UI must not turn it into a visible difference, so it is treated like a successful sign-up.
 */
export function isAlreadyRegistered(error: AuthErrorLike | null | undefined): boolean {
  return error?.code === 'user_already_exists';
}
