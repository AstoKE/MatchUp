#!/usr/bin/env node
// The four CI jobs of .github/workflows/ci.yml, run on this machine (docs/GITHUB_SETUP.md, "Local CI").
//
//   pnpm ci:local                 # the committed HEAD
//   pnpm ci:local --comment 94    # ... and post the report on PR #94
//   pnpm ci:local --skip-native   # without the Hermes compile (slow; CI keeps it)
//
// Why not just the gates in the working copy: CI starts from a clean checkout and an empty database. So does this.
// - The committed HEAD is checked out into a temporary git worktree: a file that was never committed fails here too.
// - The local Supabase stack is stopped WITHOUT a backup and started again from the worktree: every migration and seed
//   runs on an empty database, as in CI. Local development data is lost (hosted is never touched).
// - Steps run one after another, never in parallel: this laptop has 15 GB and froze once under parallel load.
// Exit code 0 only if every step exited 0. The report (markdown) is printed and saved next to the logs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const commentOn = args.includes('--comment') ? args[args.indexOf('--comment') + 1] : null;
const skipNative = args.includes('--skip-native');
if (commentOn !== null && !/^\d+$/.test(commentOn ?? '')) {
  console.error('usage: pnpm ci:local [--comment <PR number>] [--skip-native]');
  process.exit(2);
}

const repo = resolve(new URL('../..', import.meta.url).pathname);
const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' }).stdout.trim();
const sha = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (git('status', '--porcelain')) {
  console.warn(
    'note: uncommitted changes are NOT part of this run (only the committed HEAD is checked).',
  );
}

const work = mkdtempSync(join(tmpdir(), `matchup-ci-${sha.slice(0, 8)}-`));
const tree = join(work, 'tree');
const logs = join(work, 'logs');
mkdirSync(logs);

// The same public placeholders as the CI quality job (never a real key).
const placeholders = {
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key-for-build-smoke-test',
  EXPO_PUBLIC_WEB_URL: 'http://localhost:8081',
};
// Nothing from the developer's shell may leak in (a hosted URL, a map key): only PATH-like basics, plus each step's own.
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('EXPO_PUBLIC_') && k !== 'CI'),
);

const GITLEAKS = 'ghcr.io/gitleaks/gitleaks:v8.30.1'; // keep in sync with ci.yml

const steps = [
  [
    'setup',
    'worktree of the commit',
    'git',
    ['worktree', 'add', '--detach', tree, sha],
    { cwd: repo },
  ],
  ['setup', 'pnpm install --frozen-lockfile', 'pnpm', ['install', '--frozen-lockfile']],
  ['quality', 'typecheck', 'pnpm', ['typecheck']],
  ['quality', 'lint', 'pnpm', ['lint']],
  ['quality', 'format:check', 'pnpm', ['format:check']],
  ['quality', 'check:brand', 'pnpm', ['check:brand']],
  ['quality', 'test:scripts', 'pnpm', ['test:scripts']],
  ['quality', 'unit + component tests', 'pnpm', ['test']],
  [
    'quality',
    'web export',
    'pnpm',
    ['--filter', '@matchup/app', 'export:web'],
    { env: placeholders },
  ],
  ['quality', 'no credentials in the web bundle', 'pnpm', ['check:bundle']],
  ['quality', 'bundle size ratchet', 'pnpm', ['check:bundle-size']],
  ...(skipNative
    ? []
    : [
        [
          'quality',
          'native bundle compile',
          'pnpm',
          ['--filter', '@matchup/app', 'export:native'],
          { env: placeholders },
        ],
      ]),
  [
    'quality',
    'expo doctor',
    'npx',
    ['--yes', 'expo-doctor@latest'],
    // It fetches package metadata from the internet: a failed fetch failed it once (2026-11-09), then it passed twice.
    { cwd: 'apps/app', env: placeholders, retries: 1 },
  ],
  [
    'quality',
    'dependency audit (high+)',
    'pnpm',
    ['audit', '--audit-level', 'high', '--prod'],
    { retries: 1 },
  ],
  // The history lives in the main repository (a worktree's .git is only a pointer), and --all scans every ref.
  [
    'secret scan',
    'gitleaks, full history',
    'docker',
    [
      'run',
      '--rm',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '-v',
      `${repo}:/repo:ro`,
      '-w',
      '/repo',
      '-e',
      'HOME=/tmp',
      GITLEAKS,
      'git',
      '.',
      '--config',
      '.gitleaks.toml',
      '--log-opts=--all',
      '--no-banner',
      '--redact',
    ],
    { cwd: repo },
  ],
  ['database', 'stop the stack, no backup', 'pnpm', ['exec', 'supabase', 'stop', '--no-backup']],
  ['database', 'start it empty (migrations + seed)', 'pnpm', ['db:start']],
  // The edge runtime sometimes exits right after a start on this machine (health test); CI's does not.
  ['database', 'edge runtime up', 'docker', ['start', 'supabase_edge_runtime_matchup']],
  ['database', 'pgTAP', 'pnpm', ['db:test']],
  ['database', 'integration tests', 'pnpm', ['test:integration']],
  [
    'database',
    'generated types match the migrations',
    'sh',
    ['-c', 'pnpm db:types && git diff --exit-code apps/app/src/types/supabase.generated.ts'],
  ],
  ['e2e', 'local env (worktree only)', 'pnpm', ['env:local']],
  [
    'e2e',
    'Playwright + axe',
    'pnpm',
    ['--filter', '@matchup/app', 'test:e2e'],
    { env: { REQUIRE_STACK: '1' } },
  ],
];

const results = [];
let failed = false;
for (const [job, name, cmd, cmdArgs, opts = {}] of steps) {
  // After a failure only the setup is pointless to continue; the jobs are independent, as in CI.
  if (failed && job === 'setup') break;
  const log = join(
    logs,
    `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.log`,
  );
  const started = Date.now();
  process.stdout.write(`[${job}] ${name} ... `);
  // Only the steps that depend on the internet get a second try; the report says when one was needed.
  let run;
  let attempts = 0;
  let output = '';
  do {
    attempts += 1;
    run = spawnSync(cmd, cmdArgs, {
      cwd: opts.cwd === repo ? repo : join(tree, opts.cwd ?? ''),
      env: { ...baseEnv, ...(opts.env ?? {}) },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    output += `--- attempt ${attempts} ---\n${run.stdout ?? ''}\n${run.stderr ?? ''}${run.error ? `\n${run.error.message}` : ''}\n`;
  } while (run.status !== 0 && attempts <= (opts.retries ?? 0));
  writeFileSync(log, output);
  const ok = run.status === 0;
  const seconds = Math.round((Date.now() - started) / 1000);
  const note = attempts > 1 ? ` (attempt ${attempts})` : '';
  console.log(
    `${ok ? 'ok' : `FAILED (exit ${run.status ?? run.signal ?? run.error?.message})`}${note} ${seconds}s`,
  );
  results.push({ job, name, ok, seconds, log, note });
  if (!ok) failed = true;
}

spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: repo });

const jobs = [...new Set(results.map((r) => r.job))];
const lines = [
  `### Local CI: ${failed ? '❌ failed' : '✅ all green'}`,
  '',
  `Commit \`${sha.slice(0, 12)}\` (${branch}), clean worktree, empty database. \`scripts/ci/local-ci.mjs\` runs the jobs of \`ci.yml\` on the developer's machine while GitHub Actions minutes are exhausted (docs/GITHUB_SETUP.md).`,
  '',
  '| Job | Step | Result | Time |',
  '|---|---|---|---|',
  ...results.map(
    (r) => `| ${r.job} | ${r.name} | ${r.ok ? '✅' : '❌'}${r.note} | ${r.seconds}s |`,
  ),
  '',
  `Jobs: ${jobs.map((j) => `${j} ${results.filter((r) => r.job === j).every((r) => r.ok) ? '✅' : '❌'}`).join(' · ')}${skipNative ? ' · native compile skipped' : ''}`,
];
const report = lines.join('\n');
const reportPath = join(work, 'report.md');
writeFileSync(reportPath, `${report}\n`);
console.log(`\n${report}\n\nLogs: ${logs}\nReport: ${reportPath}`);

if (commentOn) {
  const posted = spawnSync('gh', ['pr', 'comment', commentOn, '--body-file', reportPath], {
    cwd: repo,
    encoding: 'utf8',
  });
  console.log(
    posted.status === 0
      ? `Posted on PR #${commentOn}.`
      : `Could not post on PR #${commentOn} (is gh on PATH and signed in?): ${posted.error?.message ?? posted.stderr}`,
  );
}
process.exit(failed ? 1 : 0);
