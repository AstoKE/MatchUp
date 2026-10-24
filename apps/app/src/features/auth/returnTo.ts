/**
 * `returnTo` is user-controllable (a link can carry it), so it must never become an open
 * redirect: only same-app absolute paths are accepted.
 */
export function sanitizeReturnTo(value: string | string[] | undefined | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return '/';
  // Must be an in-app absolute path: "/x", not "//host", not "/\host", no scheme, no control chars.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f]/.test(raw)) return '/';
  // Never bounce back into the auth screens.
  if (/^\/(sign-in|sign-up|forgot-password|reset-password|verify-email)(\/|\?|$)/.test(raw)) {
    return '/';
  }
  return raw.length > 512 ? '/' : raw;
}
