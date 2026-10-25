import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  /** TEST-ONLY: creates fixtures through the Auth admin API. Never passed to the app under test. */
  serviceRoleKey: string;
  mailpitUrl: string;
}

const repoRoot = resolve(__dirname, '../../../..');
let cached: LocalStack | null | undefined;

/** Returns the running LOCAL stack, or null when it is not up (auth tests then skip or fail by policy). */
export function getLocalStack(): LocalStack | null {
  if (cached !== undefined) return cached;
  try {
    const raw = execSync('pnpm exec supabase status -o json', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
    const stack: LocalStack = {
      apiUrl: status.API_URL ?? '',
      anonKey: status.ANON_KEY ?? '',
      serviceRoleKey: status.SERVICE_ROLE_KEY ?? '',
      mailpitUrl: status.MAILPIT_URL ?? '',
    };
    const host = new URL(stack.apiUrl).hostname;
    cached =
      Object.values(stack).every(Boolean) && ['127.0.0.1', 'localhost'].includes(host)
        ? stack
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.invalid`;
export const PASSWORD = 'correct-horse-battery-staple';

/** A pre-verified account created via the admin API (skips the email step for unrelated tests). */
export async function createVerifiedUser(stack: LocalStack, email: string, password = PASSWORD) {
  const response = await fetch(`${stack.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: stack.serviceRoleKey,
      Authorization: `Bearer ${stack.serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`createVerifiedUser failed: ${response.status}`);
  return (await response.json()) as { id: string };
}

/**
 * A verified account that has ALSO completed onboarding, through the real `complete_onboarding` RPC
 * as that user (so tests that are not about onboarding see the same state a real user has).
 */
export async function createOnboardedUser(
  stack: LocalStack,
  email: string,
  options: { displayName?: string; visibility?: 'EVERYONE' | 'EVENT_PEERS' } = {},
) {
  const user = await createVerifiedUser(stack, email);
  const tokenResponse = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string };
  const headers = {
    apikey: stack.anonKey,
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  const sports = (await (
    await fetch(`${stack.apiUrl}/rest/v1/sports?select=id&slug=eq.football`, { headers })
  ).json()) as { id: string }[];
  const rpc = async (name: string, body: unknown) => {
    const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
  };
  await rpc('complete_onboarding', {
    p_adult_confirmed: true,
    p_terms_version: 'draft-0.1',
    p_privacy_version: 'draft-0.1',
    p_marketing_consent: false,
    p_display_name: options.displayName ?? 'E2E Kullanıcı',
    p_city_id: null,
    p_district_id: null,
    p_sports: [{ sport_id: sports[0]?.id, level: 3, position_ids: [] }],
  });
  if (options.visibility) {
    await rpc('update_my_settings', {
      p_locale: 'tr',
      p_theme: 'system',
      p_profile_visibility: options.visibility,
      p_show_reliability: true,
      p_show_badges: true,
    });
  }
  return user;
}

export async function deleteUser(stack: LocalStack, id: string) {
  await fetch(`${stack.apiUrl}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: stack.serviceRoleKey, Authorization: `Bearer ${stack.serviceRoleKey}` },
  });
}

/** Waits for the newest email to `to` and returns the first Supabase auth link in it. */
export async function waitForAuthLink(stack: LocalStack, to: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${stack.mailpitUrl}/api/v1/messages`)).json()) as {
      messages?: { ID: string; To: { Address: string }[] }[];
    };
    const match = list.messages?.find((m) => m.To.some((r) => r.Address === to));
    if (match) {
      const full = (await (
        await fetch(`${stack.mailpitUrl}/api/v1/message/${match.ID}`)
      ).json()) as {
        Text?: string;
        HTML?: string;
      };
      const body = `${full.Text ?? ''}\n${full.HTML ?? ''}`;
      const link = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(body);
      if (link) return link[0].replaceAll('&amp;', '&');
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 300));
  }
  throw new Error(`No auth email for ${to} within ${timeoutMs}ms`);
}
