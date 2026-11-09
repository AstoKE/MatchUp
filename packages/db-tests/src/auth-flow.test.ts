import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  closeDb,
  createUser,
  db,
  deleteCreatedUsers,
  myAccount,
  extractAuthLink,
  signedInClient,
  STRONG_PASSWORD,
  trackUser,
  uniqueEmail,
  waitForEmailBody,
} from './helpers';
import { getStack } from './stack';

afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('registration with email verification (PKCE, real Auth + Mailpit)', () => {
  it('creates profile + settings, blocks sign-in until verified, then verifies via the emailed link', async () => {
    const { apiUrl, anonKey } = getStack();
    const email = uniqueEmail('signup');
    const client = createClient(apiUrl, anonKey, {
      auth: {
        flowType: 'pkce',
        storage: memoryStorage(),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const signUp = await client.auth.signUp({
      email,
      password: STRONG_PASSWORD,
      options: { emailRedirectTo: 'http://localhost:4173/auth/callback' },
    });
    expect(signUp.error).toBeNull();
    const userId = signUp.data.user?.id;
    expect(userId).toBeTruthy();
    trackUser(userId!);

    // The trigger created the private rows (Phase 1 bootstrap).
    const rows = await db().query(
      `select p.account_status, s.profile_visibility, s.locale
         from public.profiles p join public.user_settings s on s.user_id = p.id where p.id = $1`,
      [userId],
    );
    expect(rows.rows).toEqual([
      { account_status: 'ACTIVE', profile_visibility: 'EVENT_PEERS', locale: 'tr' },
    ]);

    // Unverified accounts cannot sign in at all (server-enforced, not a UI convention).
    const early = await anonClient().auth.signInWithPassword({ email, password: STRONG_PASSWORD });
    expect(early.error?.code).toBe('email_not_confirmed');
    expect(early.data.session).toBeNull();

    // Follow the emailed link exactly as a browser would, but without following the redirect.
    const link = extractAuthLink(await waitForEmailBody(email));
    const verify = await fetch(link, { redirect: 'manual' });
    expect([302, 303]).toContain(verify.status);
    const location = new URL(verify.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe('http://localhost:4173/auth/callback');
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    // The client completes PKCE with its stored verifier. A different client could not.
    const exchanged = await client.auth.exchangeCodeForSession(code!);
    expect(exchanged.error).toBeNull();
    expect(exchanged.data.session?.user.email_confirmed_at).toBeTruthy();

    // Server-side account state agrees.
    const account = await client.rpc('get_my_account');
    expect(account.error).toBeNull();
    // A brand-new account has verified its email but has not yet confirmed 18+, onboarded or consented.
    expect(account.data).toEqual([
      {
        user_id: userId,
        account_status: 'ACTIVE',
        email_verified: true,
        is_admin: false,
        adult_confirmed: false,
        onboarded: false,
        legal_consent_current: false,
        deletion_due_at: null,
        phone_verified: false,
        phone_required: false,
      },
    ]);

    // The code is single-use.
    const replay = await client.auth.exchangeCodeForSession(code!);
    expect(replay.error).not.toBeNull();
  });

  it('a stolen code cannot be redeemed by a different client (PKCE verifier mismatch)', async () => {
    const { apiUrl, anonKey } = getStack();
    const email = uniqueEmail('pkce');
    const victim = createClient(apiUrl, anonKey, {
      auth: {
        flowType: 'pkce',
        storage: memoryStorage(),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const res = await victim.auth.signUp({
      email,
      password: STRONG_PASSWORD,
      options: { emailRedirectTo: 'http://localhost:4173/auth/callback' },
    });
    trackUser(res.data.user!.id);
    const link = extractAuthLink(await waitForEmailBody(email));
    const verify = await fetch(link, { redirect: 'manual' });
    const code = new URL(verify.headers.get('location') ?? '').searchParams.get('code')!;

    const attacker = createClient(apiUrl, anonKey, {
      auth: {
        flowType: 'pkce',
        storage: memoryStorage(),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const attempt = await attacker.auth.exchangeCodeForSession(code);
    expect(attempt.data.session).toBeNull();
    expect(attempt.error).not.toBeNull();
  });
});

describe('server-side password policy', () => {
  it('rejects passwords shorter than 10 characters even if a client skipped validation', async () => {
    const result = await anonClient().auth.signUp({
      email: uniqueEmail('weak'),
      password: 'short-pw9',
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('weak_password');
  });
});

describe('account enumeration resistance', () => {
  it('a CONFIRMED duplicate sign-up now looks like a normal one (pinned)', async () => {
    // Until 2026-11-07 GoTrue answered 422 user_already_exists here (ADR-0016's sign-up signal). Since phone
    // confirmations are on as well (ADR-0029, the only Auth setting changed), it answers like a new sign-up, without a
    // session. Pinned so an upstream or configuration change (good or bad) is noticed; hosted must run with both
    // confirmations on (hosted-surface.mjs checks). The client still treats user_already_exists as success.
    const existing = await createUser();
    const dup = await anonClient().auth.signUp({
      email: existing.email,
      password: STRONG_PASSWORD,
    });
    expect(dup.error).toBeNull();
    expect(dup.data.session).toBeNull();
  });

  it('sign-up for an UNCONFIRMED duplicate looks like a normal sign-up (decoy, no error)', async () => {
    const email = uniqueEmail('unconfirmed');
    const first = await anonClient().auth.signUp({ email, password: STRONG_PASSWORD });
    if (first.data.user) trackUser(first.data.user.id);
    // Wait out the per-address email frequency limit (config.toml max_frequency = 1s locally). A fixed
    // sleep was flaky under parallel load (the window starts when the mail is sent, not when signUp
    // returns), so retry only on that specific code, within a bound.
    let again = await anonClient().auth.signUp({ email, password: STRONG_PASSWORD });
    for (let i = 0; i < 10 && again.error?.code === 'over_email_send_rate_limit'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      again = await anonClient().auth.signUp({ email, password: STRONG_PASSWORD });
    }
    expect(first.error).toBeNull();
    expect(again.error).toBeNull();
    expect(again.data.session).toBeNull();
  });

  it('wrong password and unknown email produce the same error', async () => {
    const user = await createUser();
    const wrong = await anonClient().auth.signInWithPassword({
      email: user.email,
      password: 'definitely-wrong-password',
    });
    const unknown = await anonClient().auth.signInWithPassword({
      email: uniqueEmail('ghost'),
      password: 'definitely-wrong-password',
    });
    expect(wrong.error?.code).toBe('invalid_credentials');
    expect(unknown.error?.code).toBe('invalid_credentials');
    expect(unknown.error?.message).toBe(wrong.error?.message);
    expect(unknown.error?.status).toBe(wrong.error?.status);
  });

  it('password reset answers the same for known and unknown addresses', async () => {
    const user = await createUser();
    const known = await anonClient().auth.resetPasswordForEmail(user.email);
    const unknown = await anonClient().auth.resetPasswordForEmail(uniqueEmail('ghost'));
    expect(known.error).toBeNull();
    expect(unknown.error).toBeNull();
  });
});

describe('sessions and account state', () => {
  it('reports server-authoritative state, including suspension and admin status', async () => {
    const user = await createUser();
    const { client } = await signedInClient(user);

    expect(await myAccount(client)).toMatchObject({
      account_status: 'ACTIVE',
      email_verified: true,
      is_admin: false,
    });

    await db().query(`update public.profiles set account_status = 'SUSPENDED' where id = $1`, [
      user.id,
    ]);
    expect((await myAccount(client))?.account_status).toBe('SUSPENDED');

    await db().query(`insert into public.platform_admins (user_id) values ($1)`, [user.id]);
    expect((await myAccount(client))?.is_admin).toBe(true);

    await db().query(`update public.platform_admins set revoked_at = now() where user_id = $1`, [
      user.id,
    ]);
    expect((await myAccount(client))?.is_admin).toBe(false);
  });

  it('a signed-out (local scope) client loses access to its own data', async () => {
    const user = await createUser();
    const { client } = await signedInClient(user);
    expect((await client.from('profiles').select('id').eq('id', user.id)).data).toHaveLength(1);
    await client.auth.signOut({ scope: 'local' });
    const after = await client.from('profiles').select('id');
    expect(after.error?.code ?? 'none').toBe('42501'); // back to anon: no grants
  });

  it('an access token for a deleted user stops working for data access', async () => {
    const user = await createUser();
    const { accessToken } = await signedInClient(user);
    // Delete the auth user (the app-side account-deletion flow arrives in Phase 6).
    const { error } = await (
      await import('./helpers')
    )
      .adminClient()
      .auth.admin.deleteUser(user.id);
    expect(error).toBeNull();
    const { rest } = await import('./helpers');
    const response = await rest('/rpc/get_my_account', {
      method: 'POST',
      token: accessToken,
      body: '{}',
    });
    // The JWT is still cryptographically valid until expiry, but the function finds no profile/auth row.
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body) ? body : []).toHaveLength(0);
  });
});
