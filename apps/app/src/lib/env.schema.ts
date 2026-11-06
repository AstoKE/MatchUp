import * as z from 'zod/mini';

/**
 * Public (client-bundled) configuration. Everything here ships to users, so it must never contain
 * secrets: only the Supabase *anon/publishable* key is allowed — service-role/secret keys are rejected.
 */

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const payload: unknown = JSON.parse(json);
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
  } catch {
    return null;
  }
  return null;
}

const supabaseKey = z.string().check(
  z.minLength(20, 'looks too short to be a Supabase key'),
  z.refine((key) => !key.startsWith('sb_secret_'), 'a Supabase SECRET key must never be bundled'),
  z.refine(
    (key) => decodeJwtRole(key) !== 'service_role',
    'a service_role key must never be bundled in a client',
  ),
);

export const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']),
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
  EXPO_PUBLIC_WEB_URL: z._default(z.url(), 'http://localhost:8081'),
  // An empty variable means "not configured".
  EXPO_PUBLIC_SENTRY_DSN: z.pipe(
    z.transform((value) => (value === '' ? undefined : value)),
    z.optional(z.url()),
  ),
  // Cloudflare Turnstile site key (public by design). Empty = CAPTCHA off, which must match the
  // Supabase project: when its Auth CAPTCHA is on, every sign-up/sign-in/reset needs a token.
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.pipe(
    z.transform((value) => (value === '' ? undefined : value)),
    z.optional(z.string().check(z.regex(/^[0-9A-Za-z_-]{10,64}$/, 'not a Turnstile site key'))),
  ),
  // MapLibre style URL of the tile provider (ADR-0024 §3), with its key restricted to the app's origins and bundle ids;
  // public by design. Empty = no map: Discover stays a list and the pin picker is not offered.
  EXPO_PUBLIC_MAP_STYLE_URL: z.pipe(
    z.transform((value) => (value === '' ? undefined : value)),
    z.optional(z.url().check(z.refine((url) => url.startsWith('https://'), 'must be https'))),
  ),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}\n` +
        'See apps/app/.env.example. Local values: run `pnpm env:local` (requires the Supabase local stack).',
    );
    this.name = 'EnvError';
    this.issues = issues;
  }
}

/** Pure parser (used by the app, app.config.ts and tests). Never echoes values, only key names. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
