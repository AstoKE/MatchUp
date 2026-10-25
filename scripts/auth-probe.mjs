// Account-enumeration probe against a Supabase Auth API (docs/AUTH_ABUSE.md, ADR-0014).
//
// Question it answers with data: can a caller who talks to the Auth API directly tell a REGISTERED email
// address from an unregistered one, by (a) the response or (b) the response time?
//
//   node scripts/auth-probe.mjs [--n 40] [--lab] [--captcha-token TOKEN] [--url URL --anon-key KEY --service-key KEY]
//
// Defaults to the LOCAL stack (`supabase status`). It creates one confirmed user through the admin API
// and removes it at the end. Never point it at a project you do not own; it sends real requests (and
// emails to *.invalid addresses) in volume.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const N = Number(opt('--n', '40'));
const captchaToken = opt('--captcha-token', undefined);

function localStack() {
  // --lab targets the throw-away stack from scripts/auth-lab.mjs instead of the developer stack.
  const workdir = args.includes('--lab') ? ['--workdir', 'supabase-lab'] : [];
  const raw = execFileSync('pnpm', ['exec', 'supabase', ...workdir, 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(raw.slice(raw.indexOf('{')));
}
const status = args.includes('--url') ? null : localStack();
const API = opt('--url', status?.API_URL);
const ANON = opt('--anon-key', status?.ANON_KEY);
const SERVICE = opt('--service-key', status?.SERVICE_ROLE_KEY);
if (!API || !ANON || !SERVICE)
  throw new Error('need --url, --anon-key and --service-key (or a running local stack)');

const PASSWORD = 'correct-horse-battery-staple';
const email = (label) => `probe-${label}-${randomUUID().slice(0, 8)}@test.invalid`;
const headers = { apikey: ANON, 'content-type': 'application/json' };

async function call(path, body) {
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const ms = performance.now() - started;
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  // What an observer can see, with all per-request noise (ids, timestamps, tokens, the address itself) removed.
  const signature = JSON.stringify({
    status: response.status,
    code: json?.error_code ?? json?.code ?? null,
    keys: json && typeof json === 'object' ? Object.keys(json).sort() : null,
    msg: typeof json?.msg === 'string' ? json.msg.replace(/[^ ]*@[^ ]*/g, '<email>') : null,
  });
  return { ms, signature };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (xs, p) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];
/**
 * Best accuracy of ANY single-threshold rule on the response time, in either direction ("slower than t =>
 * registered" or "faster than t => registered"). 50 % means timing carries no signal; 100 % means a
 * single request is enough to tell the groups apart.
 */
function bestThresholdAccuracy(registered, unregistered) {
  const all = [...registered, ...unregistered].sort((a, b) => a - b);
  let best = 0.5;
  for (const t of all) {
    const slowerIsRegistered =
      (registered.filter((x) => x >= t).length + unregistered.filter((x) => x < t).length) /
      (registered.length + unregistered.length);
    best = Math.max(best, slowerIsRegistered, 1 - slowerIsRegistered);
  }
  return best;
}

const existing = email('existing');
const created = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { ...headers, apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  body: JSON.stringify({ email: existing, password: PASSWORD, email_confirm: true }),
});
if (!created.ok) throw new Error(`could not create the probe user: ${created.status}`);
const { id } = await created.json();

const gotrueCaptcha = captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {};
const endpoints = {
  'sign-up': (address) =>
    call('/auth/v1/signup', { email: address, password: PASSWORD, ...gotrueCaptcha }),
  'sign-in (wrong password)': (address) =>
    call('/auth/v1/token?grant_type=password', {
      email: address,
      password: 'definitely-wrong-password',
      ...gotrueCaptcha,
    }),
  'password reset': (address) => call('/auth/v1/recover', { email: address, ...gotrueCaptcha }),
};

console.log(
  `Auth probe against ${API}  (n=${N} per group${captchaToken ? ', with captcha token' : ', no captcha token'})\n`,
);
try {
  for (const [name, run] of Object.entries(endpoints)) {
    const registered = [];
    const unregistered = [];
    // Interleave so drift (warm-up, load) hits both groups equally.
    for (let i = 0; i < N; i += 1) {
      registered.push(await run(existing));
      unregistered.push(await run(email('ghost')));
    }
    const sigR = new Set(registered.map((r) => r.signature));
    const sigU = new Set(unregistered.map((r) => r.signature));
    const sameResponse = sigR.size === 1 && sigU.size === 1 && [...sigR][0] === [...sigU][0];
    const tR = registered.map((r) => r.ms);
    const tU = unregistered.map((r) => r.ms);
    console.log(`== ${name}`);
    console.log(`   response for a registered address:   ${[...sigR].join('  |  ')}`);
    console.log(`   response for an unregistered address: ${[...sigU].join('  |  ')}`);
    console.log(
      `   identical response: ${sameResponse ? 'YES' : 'NO  <-- distinguishable by content'}`,
    );
    console.log(
      `   time ms  registered median ${median(tR).toFixed(0)} (p10 ${pct(tR, 10).toFixed(0)}, p90 ${pct(tR, 90).toFixed(0)})` +
        `  |  unregistered median ${median(tU).toFixed(0)} (p10 ${pct(tU, 10).toFixed(0)}, p90 ${pct(tU, 90).toFixed(0)})`,
    );
    console.log(
      `   best single-threshold timing classifier accuracy: ${(bestThresholdAccuracy(tR, tU) * 100).toFixed(0)}% (50% = no signal)\n`,
    );
  }
} finally {
  await fetch(`${API}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
}
