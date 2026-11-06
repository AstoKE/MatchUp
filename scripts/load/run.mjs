// Phase 7 / M3: seed pilot-scale data into the LOCAL stack and run the load scenarios (ARCHITECTURE §8).
//
//   node scripts/load/run.mjs --fresh     # resets the local database first (destroys local data), then seeds and runs
//   node scripts/load/run.mjs             # seeds into the current local database (must not hold a previous seed)
//
// Never runs against hosted: it refuses any API URL that is not on this machine. k6 is not an app dependency; it runs
// in the pinned grafana/k6 container. Results: printed, and written to scripts/load/out/ (git-ignored). `pnpm db:reset`
// afterwards removes the seed.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const out = join(here, 'out');
const K6_IMAGE = 'grafana/k6:1.3.0';
const DB = 'supabase_db_matchup';

const status = Object.fromEntries(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const base = status.API_URL;
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  console.error('Refusing: the load test runs only against the local stack (pnpm db:start).');
  process.exit(2);
}

const psql = (sql) =>
  execFileSync(
    'docker',
    ['exec', '-i', DB, 'psql', '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  ).trim();

if (process.argv.includes('--fresh')) {
  console.log('resetting the local database…');
  execFileSync('pnpm', ['exec', 'supabase', 'db', 'reset', '--local'], {
    cwd: root,
    stdio: 'ignore',
  });
}
if (psql("select count(*) from auth.users where email like 'load-%'") !== '0') {
  console.error(
    'A previous seed is present: run with --fresh (resets the local database) or `pnpm db:reset` first.',
  );
  process.exit(2);
}

console.log('seeding (100k events, ~500k participations)…');
let t0 = Date.now();
const seedOut = psql(readFileSync(join(here, 'seed.sql'), 'utf8'));
const seed = JSON.parse(seedOut.split('\n').at(-1));
const seedSeconds = (Date.now() - t0) / 1000;
console.log(
  `  ${seed.events} events, ${seed.participations} participations in ${seedSeconds.toFixed(0)} s`,
);

// 6. Cron sweep: complete_due_events over the 10 000 events that ended an hour ago.
const sweep = JSON.parse(
  psql(`do $$ declare t timestamptz := clock_timestamp(); begin perform private.complete_due_events();
          perform set_config('load.ms', (extract(epoch from clock_timestamp() - t) * 1000)::text, false); end $$;
        select json_build_object('ms', round(current_setting('load.ms')::numeric),
          'left_due', (select count(*) from public.events where status = 'PUBLISHED' and ends_at < now() - interval '30 minutes'));`),
);
console.log(`  complete_due_events: ${sweep.ms} ms, ${sweep.left_due} due events left`);

// Tokens signed with the local JWT secret: the scenarios measure the app's functions, not Auth's sign-in limits.
const sign = (sub) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', aal: 'aal1', iat: now, exp: now + 3600 })}`;
  return `${body}.${createHmac('sha256', status.JWT_SECRET).update(body).digest('base64url')}`;
};
const id = (n) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
const tokens = {};
for (let n = 1; n <= 300; n++) tokens[id(n)] = sign(id(n));
for (let n = 4001; n <= 4200; n++) tokens[id(n)] = sign(id(n));
const organizers = Object.fromEntries(
  Object.entries(seed.fixtures).map(([k, v]) => [k, sign(v.organizer_id)]),
);
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, 'inputs.json'),
  JSON.stringify({
    base,
    anon: status.ANON_KEY,
    fixtures: {
      ...seed.fixtures,
      race_participations: seed.race_participations,
      cities: seed.cities,
      sports: seed.sports,
    },
    tokens,
    organizers,
  }),
);

// Table-scan counters before the run (resetting them needs a superuser); the difference is what the scenarios did.
const scanSql = `select json_object_agg(relname, json_build_object('seq_scan', seq_scan, 'seq_tup_read', seq_tup_read,
                   'idx_scan', coalesce(idx_scan, 0)))
                   from pg_stat_user_tables where relname in ('events', 'event_participations', 'event_private_details', 'notifications')`;
const scansBefore = JSON.parse(psql(`${scanSql};`));
console.log('running k6 (about 2 minutes)…');
t0 = Date.now();
let k6Failed = false;
try {
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'host',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '-v',
      `${here}:/scripts`,
      '-w',
      '/scripts',
      K6_IMAGE,
      'run',
      '--quiet',
      '--summary-export',
      'out/summary.json',
      'scenarios.js',
    ],
    { stdio: 'inherit' },
  );
} catch {
  k6Failed = true; // thresholds crossed; the summary is still written
}

// Statistics reach pg_stat_user_tables a moment after the queries; read them before the checks below add their own.
execFileSync('sleep', ['2']);
const scansAfter = JSON.parse(psql(`${scanSql};`));
const after = JSON.parse(
  psql(`select json_build_object(
    'storm', (select json_build_object('requested', count(*) filter (where status = 'REQUESTED'),
                'waitlisted', count(*) filter (where status = 'WAITLISTED'))
              from public.event_participations where event_id = '${seed.fixtures.storm.event_id}' and not is_organizer),
    'burst', (select json_build_object('requested', count(*) filter (where status = 'REQUESTED'),
                'waitlisted', count(*) filter (where status = 'WAITLISTED'))
              from public.event_participations where event_id = '${seed.fixtures.burst.event_id}' and not is_organizer),
    'race', (select json_build_object('approved_count', approved_count, 'capacity', capacity) from public.events
              where id = '${seed.fixtures.race.event_id}'),
    'fanout_notifications', (select count(*) from public.notifications n
              where n.payload ->> 'event_id' = '${seed.fixtures.fanout.event_id}'),
    'over_capacity', (select count(*) from public.events where approved_count > capacity));`),
);
after.seq_scans = Object.fromEntries(
  Object.entries(scansAfter).map(([t, v]) => [
    t,
    {
      seq_scan: v.seq_scan - (scansBefore[t]?.seq_scan ?? 0),
      seq_tup_read: v.seq_tup_read - (scansBefore[t]?.seq_tup_read ?? 0),
      idx_scan: v.idx_scan - (scansBefore[t]?.idx_scan ?? 0),
    },
  ]),
);
const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
const results = {
  when: new Date().toISOString(),
  seed: { events: seed.events, participations: seed.participations, seconds: seedSeconds },
  sweep,
  after,
  k6: summary.metrics,
  thresholdsCrossed: k6Failed,
};
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));

const trend = (name) => {
  const m = summary.metrics[name];
  return m
    ? `p50 ${m['p(50)'].toFixed(0)} ms · p95 ${m['p(95)'].toFixed(0)} ms · p99 ${m['p(99)'].toFixed(0)} ms · max ${m.max.toFixed(0)} ms`
    : 'n/a';
};
console.log('\nresults');
for (const s of ['discovery', 'storm', 'burst', 'race', 'dashboard', 'fanout', 'stress']) {
  console.log(`  ${s.padEnd(10)} ${trend(`http_req_duration{scenario:${s}}`)}`);
}
console.log(`  storm      ${JSON.stringify(after.storm)}; burst ${JSON.stringify(after.burst)}`);
console.log(
  `  race       ${JSON.stringify(after.race)}, approvals succeeded: ${summary.metrics.race_approvals_succeeded?.count}`,
);
console.log(`  fanout     ${after.fanout_notifications} notifications`);
console.log(`  events over capacity: ${after.over_capacity}`);
console.log(`  table scans: ${JSON.stringify(after.seq_scans)}`);
console.log(
  `  thresholds ${k6Failed ? 'CROSSED' : 'met'}; full results in scripts/load/out/results.json`,
);
process.exit(k6Failed ? 1 : 0);
