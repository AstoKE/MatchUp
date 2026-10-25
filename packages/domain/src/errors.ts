/**
 * Stable domain error codes shared by the database (RAISE EXCEPTION ... MESSAGE = code),
 * the API layer, and the UI (localized there). DATABASE.md §9 is the source of truth.
 */
export const DOMAIN_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'NOT_ALLOWED',
  'ACCOUNT_RESTRICTED',
  'EMAIL_NOT_VERIFIED',
  'ONBOARDING_REQUIRED',
  'ADULT_CONFIRMATION_REQUIRED',
  'CONSENT_VERSION_MISMATCH',
  'CONSENT_REQUIRED',
  'REAUTH_REQUIRED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'INVALID_TRANSITION',
  'EVENT_FULL',
  'REGISTRATION_CLOSED',
  'ALREADY_REQUESTED',
  'REQUEST_LIMIT_REACHED',
  'BLOCKED',
  'RATE_LIMITED',
  'REVIEW_NOT_ELIGIBLE',
  'ALREADY_REVIEWED',
  'WINDOW_CLOSED',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Client-side/transport failures that are not domain rules. */
export type TransportErrorCode = 'NETWORK' | 'TIMEOUT' | 'UNKNOWN';
export type AppErrorCode = DomainErrorCode | TransportErrorCode;

export function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && (DOMAIN_ERROR_CODES as readonly string[]).includes(value);
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'AppError';
    this.code = code;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * Maps a PostgREST/Supabase RPC error to an AppError. Our RPCs raise with SQLSTATE P0001 and a
 * stable code as the message; anything else is UNKNOWN (never leak raw DB text to users).
 */
export function mapRpcError(error: PostgrestLikeError | null | undefined): AppError {
  if (error?.code === 'P0001' && isDomainErrorCode(error.message)) {
    return new AppError(error.message, { cause: error });
  }
  if (error?.code === '42501') {
    return new AppError('NOT_ALLOWED', { cause: error });
  }
  return new AppError('UNKNOWN', { cause: error });
}
