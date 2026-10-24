import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { getStack } from './stack';

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function anonClient() {
  const { apiUrl, anonKey } = getStack();
  return createClient(apiUrl, anonKey, { auth: authOptions });
}

/** TEST-ONLY privileged client for creating fixtures. */
export function adminClient() {
  const { apiUrl, serviceRoleKey } = getStack();
  return createClient(apiUrl, serviceRoleKey, { auth: authOptions });
}

let pool: pg.Pool | undefined;
/** Direct superuser connection to the local database (fixtures + assertions the API cannot make). */
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getStack().dbUrl, max: 40 });
  return pool;
}
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export const uniqueEmail = (label = 'user') => `${label}-${randomUUID().slice(0, 8)}@test.invalid`;
export const STRONG_PASSWORD = 'correct-horse-battery-staple';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const created: string[] = [];

/** Creates a user through the Auth admin API (bypasses email delivery). */
export async function createUser(options: { confirmed?: boolean } = {}): Promise<TestUser> {
  const email = uniqueEmail();
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: STRONG_PASSWORD,
    email_confirm: options.confirmed ?? true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  return { id: data.user.id, email, password: STRONG_PASSWORD };
}

export async function deleteCreatedUsers(): Promise<void> {
  const admin = adminClient();
  await Promise.all(created.splice(0).map((id) => admin.auth.admin.deleteUser(id)));
}

export function trackUser(id: string): void {
  created.push(id);
}

/** A client signed in as the given user, plus the raw access token for HTTP-level tests. */
export async function signedInClient(user: TestUser) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) throw error ?? new Error('sign-in failed');
  return { client, accessToken: data.session.access_token };
}

/** Calls PostgREST directly so tests see exactly what a hostile HTTP client would. */
export async function rest(path: string, init: RequestInit & { token?: string } = {}) {
  const { apiUrl, anonKey } = getStack();
  const { token, headers, ...rest } = init;
  return fetch(`${apiUrl}/rest/v1${path}`, {
    ...rest,
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

/** Waits for an email to `to` in the local Mailpit inbox and returns its text body. */
export async function waitForEmailBody(to: string, timeoutMs = 15_000): Promise<string> {
  const { mailpitUrl } = getStack();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${mailpitUrl}/api/v1/messages`)).json()) as {
      messages?: MailpitMessage[];
    };
    const match = list.messages?.find((m) => m.To.some((r) => r.Address === to));
    if (match) {
      const full = (await (await fetch(`${mailpitUrl}/api/v1/message/${match.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      return `${full.Text ?? ''}\n${full.HTML ?? ''}`;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email for ${to} within ${timeoutMs}ms`);
}

/** Extracts the first Supabase verify/recovery link from an email body. */
export function extractAuthLink(body: string): string {
  const match = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(body);
  if (!match) throw new Error('No auth link found in email body');
  return match[0].replaceAll('&amp;', '&');
}

export interface AccountRow {
  user_id: string;
  account_status: string;
  email_verified: boolean;
  is_admin: boolean;
}

/** The caller's server-authoritative account state via the get_my_account RPC (typed for tests). */
export async function myAccount(
  client: ReturnType<typeof anonClient>,
): Promise<AccountRow | undefined> {
  // The test package has no generated Database type, so the RPC result is intentionally narrowed here.
  const result = (await client.rpc('get_my_account')) as {
    data: AccountRow[] | null;
    error: Error | null;
  };
  if (result.error) throw result.error;
  return result.data?.[0];
}
