import { env } from '../env';
import { log } from './logger';
import { redactString, redactValue } from './redact';

type Json = Record<string, unknown>;

/**
 * Removes personal data from an error event BEFORE it leaves the device: user identity and IP,
 * request headers/cookies/bodies/query strings, free-text extras, and any email/token that ended up
 * inside messages or stack values. Pure function: unit-tested without a Sentry SDK.
 */
export function scrubEvent<T extends object>(event: T): T {
  const copy = { ...(event as Json) };
  delete copy.user;
  delete copy.server_name;
  if (copy.request && typeof copy.request === 'object') {
    const { url, method } = copy.request as { url?: string; method?: string };
    copy.request = {
      ...(url ? { url: redactString(url.split('?')[0] ?? '') } : {}),
      ...(method ? { method } : {}),
    };
  }
  if (typeof copy.message === 'string') copy.message = redactString(copy.message);
  for (const key of ['exception', 'breadcrumbs', 'extra', 'contexts', 'tags']) {
    if (key in copy) copy[key] = redactValue(copy[key]);
  }
  return copy as T;
}

export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
  const copy = { ...(breadcrumb as Json) };
  if (typeof copy.message === 'string') copy.message = redactString(copy.message);
  if (copy.data) copy.data = redactValue(copy.data);
  return copy as T;
}

let initialized = false;

/**
 * Starts error reporting only when a DSN is configured (it is public by design). Without one the
 * app still logs locally through `log`. `sendDefaultPii` stays off and no performance/replay data
 * is collected in the MVP.
 */
export function initObservability(): void {
  if (initialized || !env.EXPO_PUBLIC_SENTRY_DSN) return;
  initialized = true;
  void import('@sentry/react-native').then((Sentry) => {
    Sentry.init({
      dsn: env.EXPO_PUBLIC_SENTRY_DSN,
      environment: env.EXPO_PUBLIC_APP_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableAutoSessionTracking: false,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    });
  });
}

/** The one way to report an unexpected failure: logged locally (redacted) and sent if enabled. */
export function reportError(module: string, code: string, error: unknown, fields?: unknown): void {
  log.error(module, code, error, fields);
  if (!initialized) return;
  void import('@sentry/react-native').then((Sentry) => {
    Sentry.withScope((scope) => {
      scope.setTag('module', module);
      scope.setTag('code', code);
      if (fields !== undefined) scope.setExtras(redactValue(fields) as Json);
      Sentry.captureException(error);
    });
  });
}
