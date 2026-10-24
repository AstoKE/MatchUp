/**
 * Redaction for logs, analytics properties and error reports (SECURITY §6, §7; ARCHITECTURE §9).
 * Two layers: by KEY name (anything that might hold personal data or credentials is replaced
 * wholesale) and by VALUE pattern (emails, tokens, keys that slip into free text).
 */
export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|api[-_]?key|apikey|cookie|session|jwt|credential|email|e-mail|phone|lat(itude)?$|^lng$|^lon(gitude)?$|coordinates?|address|^bio$|message|description|display[-_]?name|notes?$/i;

const VALUE_PATTERNS: readonly [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [token]'],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{6,}/g, '[key]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/([?&](?:token|code|access_token|refresh_token|apikey|key)=)[^&#\s]+/gi, '$1[redacted]'],
];

export function redactString(value: string): string {
  return VALUE_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;

export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth-limit]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (value instanceof Error) {
    const code = (value as Error & { code?: unknown }).code;
    return {
      name: value.name,
      message: redactString(value.message),
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => redactValue(item, depth + 1, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1, seen),
    ]),
  );
}
