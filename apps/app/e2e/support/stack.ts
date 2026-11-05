import { execFileSync, execSync } from 'node:child_process';
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
  const user = (await response.json()) as { id: string };
  // Not a new account: accounts under 7 days get tighter quotas (PHASE6_PLAN M6), and tests create many events.
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `update public.profiles set created_at = now() - interval '30 days' where id = '${user.id}'`,
  ]);
  return user;
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

/**
 * TEST-ONLY: makes ONE user's legal acceptance outdated by revoking it in the local database
 * (bumping app_config instead would race every other test that onboards). API roles have no write
 * access to user_consents by design, so this goes through psql in the local stack's DB container.
 */
export function revokeLegalConsent(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('not a uuid');
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `update public.user_consents set revoked_at = now() where user_id = '${userId}' and kind = 'PRIVACY_NOTICE'`,
  ]);
}

/** TEST-ONLY: publishes a football 5v5 event in Ankara/Çankaya for `email` through the real RPC, 2 days ahead. */
export async function createPublishedEvent(
  stack: LocalStack,
  email: string,
  title: string,
  options: {
    publish?: boolean;
    autoApprove?: boolean;
    inviteOnly?: boolean;
    capacity?: number;
    sportSlug?: string;
    formatSlug?: string;
    citySlug?: string;
    districtSlug?: string;
  } = {},
): Promise<string> {
  const base = { apikey: stack.anonKey, 'content-type': 'application/json' };
  const tokenResponse = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: base,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string };
  const headers = { ...base, Authorization: `Bearer ${token}` };
  const get = async <T>(path: string) =>
    ((await (await fetch(`${stack.apiUrl}/rest/v1/${path}`, { headers })).json()) as T[])[0]!;
  const sport = await get<{ id: string }>(
    `sports?select=id&slug=eq.${options.sportSlug ?? 'football'}`,
  );
  const format = await get<{ id: string }>(
    `sport_formats?select=id&slug=eq.${options.formatSlug ?? '5v5'}&sport_id=eq.${sport.id}`,
  );
  const city = await get<{ id: string }>(
    `cities?select=id&slug=eq.${options.citySlug ?? 'ankara'}`,
  );
  const district = await get<{ id: string }>(
    `districts?select=id&slug=eq.${options.districtSlug ?? 'cankaya'}&city_id=eq.${city.id}`,
  );
  const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/create_event`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_client_request_id: randomUUID(),
      p_publish: options.publish ?? true,
      p_input: {
        sport_id: sport.id,
        sport_format_id: format.id,
        title,
        starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        duration_minutes: 90,
        city_id: city.id,
        district_id: district.id,
        location_label: 'ODTÜ Halı Saha 2',
        capacity: options.capacity ?? 12,
        auto_approve: options.autoApprove ?? false,
        visibility: options.inviteOnly ? 'INVITE_ONLY' : 'PUBLIC',
      },
    }),
  });
  if (!response.ok)
    throw new Error(`create_event failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as string;
}

/**
 * TEST-ONLY: deleting an Auth user leaves its events behind (no FK, ADR-0003), so Discover would keep
 * listing them for later runs. API roles cannot delete events, hence psql in the DB container.
 */
export function deleteEventsOf(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('not a uuid');
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `delete from public.events where organizer_id = '${userId}'`,
  ]);
}

/** TEST-ONLY: an administrator is a row written with service credentials; no client can do it. */
export function makeAdmin(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('not a uuid');
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `insert into public.platform_admins (user_id) values ('${userId}') on conflict do nothing`,
  ]);
}

/** TEST-ONLY: a report through the real RPC, as that user. */
export async function reportAs(
  stack: LocalStack,
  email: string,
  target: { type: 'USER' | 'EVENT'; id: string },
  reason = 'SPAM',
) {
  await rpcAs(stack, email, 'report', {
    p_target_type: target.type,
    p_target_id: target.id,
    p_reason: reason,
    p_details: 'Deneme bildirimi',
  });
}

async function rpcAs(stack: LocalStack, email: string, name: string, body: unknown) {
  const base = { apikey: stack.anonKey, 'content-type': 'application/json' };
  const tokenResponse = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: base,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string };
  const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...base, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
  return response;
}

/** TEST-ONLY: a player requests through the real RPC, and nobody has answered yet. */
export async function requestToJoin(stack: LocalStack, eventId: string, playerEmail: string) {
  await rpcAs(stack, playerEmail, 'request_join', { p_event_id: eventId });
}

/** TEST-ONLY: a player requests through the real RPC; the organizer approves through the real RPC. */
export async function joinApproved(
  stack: LocalStack,
  eventId: string,
  playerEmail: string,
  organizerEmail: string,
) {
  await requestToJoin(stack, eventId, playerEmail);
  const requests = (await (
    await rpcAs(stack, organizerEmail, 'list_event_requests', { p_event_id: eventId })
  ).json()) as { items: { id: string; status: string }[] };
  for (const row of requests.items.filter((r) => r.status === 'REQUESTED')) {
    await rpcAs(stack, organizerEmail, 'approve_participation', { p_participation_id: row.id });
  }
}

/** TEST-ONLY: starts the event, marks every approved player present and finalizes, through the real RPCs. */
export async function finalizeAllPresent(
  stack: LocalStack,
  eventId: string,
  organizerEmail: string,
) {
  startEvent(eventId);
  const base = { apikey: stack.anonKey, 'content-type': 'application/json' };
  const tokenResponse = await fetch(`${stack.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: base,
    body: JSON.stringify({ email: organizerEmail, password: PASSWORD }),
  });
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string };
  const call = async (name: string, body: unknown) => {
    const response = await fetch(`${stack.apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...base, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`${name} failed: ${response.status} ${await response.text()}`);
    return response;
  };
  const view = (await (await call('get_event_attendance', { p_event_id: eventId })).json()) as {
    roster: { participation_id: string; is_organizer: boolean }[];
  };
  for (const row of view.roster.filter((r) => !r.is_organizer)) {
    await call('mark_attendance', { p_participation_id: row.participation_id, p_value: 'PRESENT' });
  }
  await call('finalize_attendance', { p_event_id: eventId });
}

/** TEST-ONLY: a skill snapshot for one user: the job that writes it would close every due window in the shared database. */
export function setFootballRating(userId: string, rating: number, confidence: number) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('not a uuid');
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `insert into public.user_sport_ratings (user_id, sport_id, rating, confidence, sample_events)
     select '${userId}', id, ${rating}, ${confidence}, 1 from public.sports where slug = 'football'`,
  ]);
}

/** TEST-ONLY: moves an event's start into the past; no API can do that, hence psql in the DB container. */
export function startEvent(eventId: string) {
  if (!/^[0-9a-f-]{36}$/.test(eventId)) throw new Error('not a uuid');
  execFileSync('docker', [
    'exec',
    'supabase_db_matchup',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `update public.events set starts_at = now() - interval '1 hour' where id = '${eventId}'`,
  ]);
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
