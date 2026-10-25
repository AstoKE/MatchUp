import { classifyAuthError, failureMessage, isAlreadyRegistered } from './classify-auth-error';

describe('classifyAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'INVALID_CREDENTIALS'],
    [{ code: 'email_not_confirmed', status: 400 }, 'EMAIL_NOT_CONFIRMED'],
    [{ code: 'captcha_failed', status: 400 }, 'CAPTCHA_FAILED'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'RATE_LIMITED'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'RATE_LIMITED'],
    [{ status: 429 }, 'RATE_LIMITED'],
    [{ code: 'weak_password', status: 422 }, 'VALIDATION_FAILED'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'NETWORK'],
    [{ name: 'AbortError' }, 'TIMEOUT'],
    [{ code: 'something_new', status: 500 }, 'UNKNOWN'],
    [null, 'UNKNOWN'],
    [undefined, 'UNKNOWN'],
  ])('%j → %s', (error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });

  it('never exposes server prose', () => {
    expect(classifyAuthError({ message: 'User not found in database table auth.users' })).toBe(
      'UNKNOWN',
    );
  });

  it('does not distinguish unknown users from wrong passwords', () => {
    // GoTrue answers both with invalid_credentials; there must be no separate "user not found" outcome.
    expect(classifyAuthError({ code: 'user_not_found', status: 400 })).toBe('UNKNOWN');
  });
});

describe('failureMessage', () => {
  it('maps auth-specific failures to the auth namespace', () => {
    expect(failureMessage('INVALID_CREDENTIALS')).toEqual({
      ns: 'auth',
      key: 'errors.invalidCredentials',
    });
    expect(failureMessage('RATE_LIMITED').ns).toBe('auth');
    expect(failureMessage('CAPTCHA_FAILED')).toEqual({ ns: 'auth', key: 'errors.captchaFailed' });
  });
  it('maps shared failures to the errors namespace', () => {
    expect(failureMessage('NETWORK')).toEqual({ ns: 'errors', key: 'NETWORK' });
    expect(failureMessage('UNKNOWN')).toEqual({ ns: 'errors', key: 'UNKNOWN' });
  });
});

describe('isAlreadyRegistered', () => {
  it('recognizes the duplicate-address response so the UI can treat it like success', () => {
    expect(isAlreadyRegistered({ code: 'user_already_exists', status: 422 })).toBe(true);
  });
  it('does not swallow other failures', () => {
    expect(isAlreadyRegistered({ code: 'weak_password' })).toBe(false);
    expect(isAlreadyRegistered({ status: 429 })).toBe(false);
    expect(isAlreadyRegistered(null)).toBe(false);
  });
});
