import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  closeDb,
  createUser,
  db,
  deleteCreatedUsers,
  rest,
  signedInClient,
  trackUser,
  type TestUser,
} from './helpers';

/**
 * Account deletion and data export over real HTTP with real Supabase tokens (ADR-0017): the `amr`
 * re-authentication check against GoTrue's actual claim, the purge removing the auth user, and the
 * export rate limit under parallel calls.
 */
interface RpcError {
  code?: string;
  message?: string;
}

async function rpc(name: string, token?: string) {
  const response = await rest(`/rpc/${name}`, { method: 'POST', token, body: '{}' });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

async function status(id: string) {
  const { rows } = await db().query<{ account_status: string; requested: Date | null }>(
    'select account_status::text, deletion_requested_at as requested from public.profiles where id = $1',
    [id],
  );
  return rows[0];
}

async function auditCount(target: string, action: string) {
  const { rows } = await db().query<{ n: number }>(
    'select count(*)::int as n from private.audit_logs where target_id = $1 and action = $2',
    [target, action],
  );
  return rows[0]?.n ?? 0;
}

afterAll(async () => {
  await deleteCreatedUsers();
  await closeDb();
});

describe('account deletion over the Data API', () => {
  let user: TestUser;
  let token: string;

  beforeAll(async () => {
    user = await createUser();
    token = (await signedInClient(user)).accessToken; // a real password sign-in → fresh `amr`
  });

  it('accepts a request right after a password sign-in (real amr claim) and survives parallel calls', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rpc('request_account_deletion', token)),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    const dues = new Set(results.map((r) => r.body as string));
    expect(dues.size).toBe(1); // every call reports the same schedule
    expect((await status(user.id))?.account_status).toBe('PENDING_DELETION');
    expect(await auditCount(user.id, 'ACCOUNT_DELETION_REQUESTED')).toBe(1);
  });

  it('reports the schedule and blocks writes while pending', async () => {
    const account = (await rpc('get_my_account', token)).body as { deletion_due_at: string }[];
    expect(new Date(account[0]!.deletion_due_at).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
    const write = await rest('/rpc/set_marketing_consent', {
      method: 'POST',
      token,
      body: JSON.stringify({ p_granted: true }),
    });
    expect((await write.json()) as RpcError).toMatchObject({ message: 'ACCOUNT_RESTRICTED' });
  });

  it('can be cancelled during the grace period', async () => {
    expect((await rpc('cancel_account_deletion', token)).status).toBe(204);
    expect(await status(user.id)).toEqual({ account_status: 'ACTIVE', requested: null });
  });

  it('refuses guests', async () => {
    expect([401, 403]).toContain((await rpc('request_account_deletion')).status);
    expect([401, 403]).toContain((await rpc('export_my_data')).status);
  });

  it('after the grace period the daily job removes the login and anonymizes the profile', async () => {
    expect((await rpc('request_account_deletion', token)).status).toBe(200);
    await db().query(
      `update public.profiles set deletion_requested_at = now() - interval '31 days' where id = $1`,
      [user.id],
    );
    const { rows } = await db().query<{ n: number }>(
      'select private.process_deletion_queue() as n',
    );
    expect(rows[0]?.n).toBeGreaterThanOrEqual(1);

    expect((await status(user.id))?.account_status).toBe('DELETED');
    const auth = await db().query('select 1 from auth.users where id = $1', [user.id]);
    expect(auth.rowCount).toBe(0);
    const signIn = await anonClient().auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(signIn.error?.code).toBe('invalid_credentials');
    // The old access token may still be cryptographically valid until it expires; it no longer maps to
    // an account, so account RPCs fail instead of acting on the tombstone.
    const stale = await rpc('get_my_account', token);
    expect(Array.isArray(stale.body) ? stale.body : []).toEqual([]);
  });

  it('lets the same address register again as a brand-new account (nothing is re-linked)', async () => {
    const { data, error } = await (await import('./helpers')).adminClient().auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    trackUser(data.user!.id);
    expect(data.user!.id).not.toBe(user.id);
    expect((await status(data.user!.id))?.account_status).toBe('ACTIVE');
  });
});

describe('data export over the Data API', () => {
  it('returns only the caller’s data, once per 24 hours even under parallel calls', async () => {
    const user = await createUser();
    const other = await createUser();
    const token = (await signedInClient(user)).accessToken;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => rpc('export_my_data', token)),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 400).map((r) => (r.body as RpcError).message),
    ).toEqual(Array(4).fill('RATE_LIMITED'));

    const doc = ok[0]!.body as { account: { user_id: string; email: string } };
    expect(doc.account).toMatchObject({ user_id: user.id, email: user.email });
    expect(JSON.stringify(doc)).not.toContain(other.email);
    expect(await auditCount(user.id, 'DATA_EXPORTED')).toBe(1);
  });
});
