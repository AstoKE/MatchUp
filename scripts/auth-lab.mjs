// A throw-away second local Supabase stack ("lab") to test auth-abuse mitigations without touching the
// developer stack (docs/AUTH_ABUSE.md).
//
//   node scripts/auth-lab.mjs up      generate supabase-lab/ from supabase/config.toml and start it
//   node scripts/auth-lab.mjs down    stop it
//   node scripts/auth-lab.mjs status  print its API URL and keys (JSON)
//
// What differs from the main config (everything else is copied, so the lab behaves like the real stack):
//   - project_id "matchup-lab" and every 54xxx port moved to 55xxx (so both stacks can run side by side)
//   - CAPTCHA on, provider Turnstile, with Cloudflare's documented TEST secret that always passes
//     (1x…AA) — real keys are never used here; tokens are not verified against a real widget
//   - low rate limits, so limit behaviour can be observed in seconds
//   - only the services auth needs (database, gateway, auth, mail catcher)
// The folder supabase-lab/ is generated, git-ignored, and safe to delete.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const labRoot = join(root, 'supabase-lab');
const labConfigDir = join(labRoot, 'supabase');
const TURNSTILE_TEST_SECRET_ALWAYS_PASSES = '1x0000000000000000000000000000000AA';
const EXCLUDED_SERVICES = [
  'realtime',
  'storage-api',
  'imgproxy',
  'postgrest',
  'postgres-meta',
  'studio',
  'edge-runtime',
  'logflare',
  'vector',
  'supavisor',
];

function labConfig() {
  let text = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
  const mustReplace = (pattern, replacement, what) => {
    if (!pattern.test(text))
      throw new Error(`config.toml no longer matches the expected shape: ${what}`);
    text = text.replace(pattern, replacement);
  };
  mustReplace(/^project_id = "matchup"$/m, 'project_id = "matchup-lab"', 'project_id');
  text = text.replace(/^(\s*(?:shadow_)?port\s*=\s*)54(\d{3})/gm, '$155$2');
  text = text.replace(/^(\s*inspector_port\s*=\s*)8083/gm, '$19083');
  mustReplace(/^email_sent = \d+$/m, 'email_sent = 12', 'rate_limit.email_sent');
  mustReplace(/^sign_in_sign_ups = \d+$/m, 'sign_in_sign_ups = 20', 'rate_limit.sign_in_sign_ups');
  mustReplace(
    /# \[auth\.captcha\]\n# enabled = true\n# provider = "hcaptcha"\n# secret = ""/,
    `[auth.captcha]\nenabled = true\nprovider = "turnstile"\nsecret = "${TURNSTILE_TEST_SECRET_ALWAYS_PASSES}"`,
    'auth.captcha block',
  );
  return text;
}

const cli = (extra) =>
  execFileSync('pnpm', ['exec', 'supabase', '--workdir', labRoot, ...extra], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

const command = process.argv[2];
if (command === 'up') {
  mkdirSync(labConfigDir, { recursive: true });
  writeFileSync(join(labConfigDir, 'config.toml'), labConfig());
  cli(['start', '-x', EXCLUDED_SERVICES.join(',')]);
} else if (command === 'down') {
  cli(['stop', '--no-backup']);
} else if (command === 'status') {
  cli(['status', '-o', 'json']);
} else {
  console.error('usage: node scripts/auth-lab.mjs up|down|status');
  process.exit(2);
}
