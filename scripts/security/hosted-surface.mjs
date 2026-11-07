// What a stranger with the public (publishable / anon) key can see of a Supabase project, checked from the outside.
// Phase 7 / M2 (docs/SECURITY_REVIEW.md). Read-only: it signs nobody up and writes nothing. Run by the founder against
// hosted (Claude does not read hosted); the local stack works too, for a dry run.
//
//   node scripts/security/hosted-surface.mjs --url https://<ref>.supabase.co --anon-key <publishable key> [--signup open]
//
// --signup says which state public sign-up should be in: `closed` (the default) or `open` (ADR-0026, only after the
// steps of DEPLOYMENT §14). With `open`, CAPTCHA must be enforced: one password-reset request without a token is sent
// for a reserved address (example.invalid, so no mail goes out) and must be refused for the missing CAPTCHA.
//
// Exit code 1 when a check fails; warnings do not fail.
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const url = args.url?.replace(/\/$/, '');
const key = args['anon-key'];
const signup = args.signup ?? 'closed';
if (!url || !key || !['closed', 'open'].includes(signup)) {
  console.error(
    'usage: node scripts/security/hosted-surface.mjs --url <project url> --anon-key <publishable key> [--signup closed|open]',
  );
  process.exit(2);
}
if (key.startsWith('sb_secret_')) {
  console.error('That is a secret key. This check must only ever use the public one.');
  process.exit(2);
}

// The guest-callable RPCs the review accepted (01_security_baseline enforces the same list in the database).
const GUEST_RPCS = ['catalog_places', 'get_event', 'search_events', 'search_venues'];
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const results = [];
const report = (level, check, detail) => results.push({ level, check, detail });

async function get(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* not JSON */
  }
  return { status: response.status, body };
}

// 1. Auth: public sign-up in the expected state, no auto-confirm, no unexpected providers.
{
  const { status, body } = await get('/auth/v1/settings');
  if (status !== 200 || !body) report('FAIL', 'auth settings', `HTTP ${status}`);
  else {
    const open = body.disable_signup === false;
    report(
      open === (signup === 'open') ? 'PASS' : 'FAIL',
      `public sign-up ${signup === 'open' ? 'enabled' : 'disabled'}`,
      `disable_signup=${body.disable_signup}`,
    );
    report(
      body.mailer_autoconfirm ? 'FAIL' : 'PASS',
      'email confirmation required',
      `mailer_autoconfirm=${body.mailer_autoconfirm}`,
    );
    const external = Object.entries(body.external ?? {})
      .filter(([name, on]) => on && name !== 'email')
      .map(([name]) => name);
    report(
      external.length === 0 ? 'PASS' : 'WARN',
      'no providers besides email',
      external.join(', ') || 'none',
    );
    report(
      body.external?.phone ? 'WARN' : 'PASS',
      'phone sign-in off',
      `phone=${Boolean(body.external?.phone)}`,
    );
  }
}

// 1b. Open sign-up only with CAPTCHA (ADR-0026). GoTrue checks the token before anything else, so a reset request
// without one is refused with captcha_failed and nothing is sent.
if (signup === 'open') {
  const { status, body } = await get('/auth/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'surface-check@example.invalid' }),
  });
  const refused = status === 400 && /captcha/i.test(`${body?.error_code ?? ''} ${body?.msg ?? ''}`);
  report(
    refused ? 'PASS' : 'FAIL',
    'CAPTCHA enforced',
    `HTTP ${status} ${body?.error_code ?? ''}`.trim(),
  );
}

// 2. What PostgREST's OpenAPI root shows a guest: tables it may read and functions it may call.
{
  const { status, body } = await get('/rest/v1/', {
    headers: { Accept: 'application/openapi+json' },
  });
  // New publishable keys get no OpenAPI document at all (401/403): nothing is listed to a stranger.
  if (status === 401 || status === 403)
    report('PASS', 'OpenAPI root not served to the public key', `HTTP ${status}`);
  else if (status !== 200 || !body?.paths) report('WARN', 'OpenAPI root', `HTTP ${status}`);
  else {
    const rpcs = Object.keys(body.paths)
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.slice(5))
      .sort();
    const unexpected = rpcs.filter((r) => !GUEST_RPCS.includes(r));
    report(
      unexpected.length === 0 ? 'PASS' : 'FAIL',
      'guest-callable functions are the reviewed ones',
      rpcs.join(', '),
    );
    const tables = Object.keys(body.paths).filter((p) => p !== '/' && !p.startsWith('/rpc/'));
    report(
      'INFO',
      'tables a guest may read (RLS still filters rows)',
      tables.map((t) => t.slice(1)).join(', '),
    );
  }
}

// 3. GraphQL: if pg_graphql is on, a guest can introspect the schema. RLS still applies, but names leak and it is a
// second API to keep in mind. The app does not use it.
{
  const { status, body } = await get('/graphql/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' }),
  });
  const fields = body?.data?.__schema?.queryType?.fields?.map((f) => f.name) ?? [];
  if (fields.length > 0)
    report(
      'WARN',
      'GraphQL is enabled and introspectable',
      `${fields.length} query fields (disable pg_graphql if unused)`,
    );
  else
    report(
      'PASS',
      'GraphQL not exposed',
      `HTTP ${status}${body?.errors?.[0]?.message ? `: ${body.errors[0].message}` : ''}`,
    );
}

// 4. A guest cannot read private data even by asking for it directly.
for (const table of [
  'profiles',
  'event_private_details',
  'reports',
  'venues',
  'user_blocks',
  'notifications',
]) {
  const { status, body } = await get(`/rest/v1/${table}?select=*&limit=1`);
  const rows = Array.isArray(body) ? body.length : 0;
  report(
    rows === 0 ? 'PASS' : 'FAIL',
    `guest reads nothing from ${table}`,
    `HTTP ${status}, ${rows} rows`,
  );
}

// 5. The health function answers without data.
{
  const { status, body } = await get('/functions/v1/health');
  const keys = body && typeof body === 'object' ? Object.keys(body).sort().join(',') : '';
  report(status === 200 ? 'PASS' : 'WARN', 'health endpoint', `HTTP ${status} ${keys}`);
}

const width = Math.max(...results.map((r) => r.check.length));
for (const r of results) console.log(`${r.level.padEnd(4)}  ${r.check.padEnd(width)}  ${r.detail}`);
process.exit(results.some((r) => r.level === 'FAIL') ? 1 : 0);
