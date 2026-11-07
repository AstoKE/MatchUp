// Native Android validation runner (Phase 2 / P2-M0). Drives the REAL app on a REAL (emulated) device:
// Maestro for UI steps; adb + the local Mailpit/Supabase stack for everything a user does outside the app
// (tapping the emailed link, switching the language, losing the network).
//
//   node scripts/android/native-validation.mjs [--apk path] [--skip-install] [--only 01,02] [--device emulator-5554]
//
// Preconditions: emulator booted, `pnpm db:start` running, JDK/Maestro/adb on PATH (source scripts/android/env.sh).
// Results (JSON + screenshots + logcat excerpts) go to apps/app/e2e-mobile/results/<timestamp>/ (git-ignored);
// the curated summary is docs/NATIVE_VALIDATION.md.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { phase3Fixtures } from './phase3-fixtures.mjs';

const root = resolve(import.meta.dirname, '../..');
const appDir = join(root, 'apps/app');
const flowsDir = join(appDir, 'e2e-mobile/flows');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DEVICE = opt('--device', 'emulator-5554');
const APK = opt('--apk', join(appDir, '.android-build/matchup-debug-x86_64.apk'));
const ONLY = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const PKG = 'com.example.matchup.dev';
const SCHEME = 'matchup-dev';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(appDir, 'e2e-mobile/results', stamp);
mkdirSync(outDir, { recursive: true });

const sh = (cmd, cmdArgs, options = {}) =>
  execFileSync(cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    ...options,
  });
const adb = (...a) =>
  sh('adb', ['-s', DEVICE, ...a])
    .replace(/\r/g, '')
    .trim();

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function record(id, name, status, detail = '') {
  results.push({ id, name, status, detail });
  const mark = status === 'PASS' ? '✔' : status === 'SKIP' ? '–' : '✖';
  console.log(`${mark} ${id} ${name}${detail ? `\n    ${detail.split('\n').join('\n    ')}` : ''}`);
}

// ------------------------------------------------------------------ environment access
function stackInfo() {
  const raw = sh('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { cwd: root });
  return JSON.parse(raw.slice(raw.indexOf('{')));
}
const stack = stackInfo();

/** One value from the local database (test fixture checks only; the app never sees this connection). */
function dbScalar(sql) {
  return sh(
    'docker',
    [
      'exec',
      'supabase_db_matchup',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    { shell: false },
  ).trim();
}

async function waitForAuthLink(email, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${stack.MAILPIT_URL}/api/v1/messages`)).json();
    const msg = list.messages?.find((m) => m.To.some((r) => r.Address === email));
    if (msg) {
      const full = await (await fetch(`${stack.MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
      const m = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(
        `${full.Text}\n${full.HTML}`,
      );
      if (m) return m[0].replaceAll('&amp;', '&');
    }
    await sleep(400);
  }
  throw new Error(`no auth email for ${email}`);
}

/** Follows the emailed link the way a browser would, WITHOUT following the redirect to the app scheme. */
async function codeFromEmailLink(link) {
  const res = await fetch(link, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  if (!location.startsWith(`${SCHEME}://`))
    throw new Error(`verify redirected to "${location.slice(0, 80)}", expected ${SCHEME}://…`);
  return {
    location,
    code: new URL(location.replace(`${SCHEME}://`, 'http://x/')).searchParams.get('code'),
  };
}

const openDeepLink = (url) =>
  adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `"${url}"`, PKG);
const forceStop = () => adb('shell', 'am', 'force-stop', PKG);
const reverse = (on) =>
  on ? adb('reverse', 'tcp:54321', 'tcp:54321') : adb('reverse', '--remove', 'tcp:54321');

function maestro(flow, env = {}, tag = flow) {
  const dir = join(outDir, tag);
  mkdirSync(dir, { recursive: true });
  const a = ['--device', DEVICE, 'test'];
  for (const [k, v] of Object.entries(env)) a.push('-e', `${k}=${v}`);
  a.push('--test-output-dir', dir, '--debug-output', dir, join(flowsDir, flow));
  // Java reads flow files with the Windows default charset (cp1254 here) unless told otherwise,
  // which corrupts Turkish characters (İ ı Ş Ğ) in assertions.
  const childEnv = { ...process.env, JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8' };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // The Maestro CLI wrapper is a .bat on Windows; invoke it through the shell.
      const out = execFileSync('maestro', a, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        cwd: dir,
        timeout: 240000,
        env: childEnv,
      });
      return { ok: true, out };
    } catch (error) {
      const text = [error.stdout ?? '', error.stderr ?? ''].join('\n').trim();
      // First run on a fresh device: the Maestro driver APK is still being installed.
      if (attempt === 1 && /instrumentation could not be initialized/i.test(text)) continue;
      // The Maestro driver sometimes dies before running a single step (nothing was tested, so retrying
      // cannot hide an app defect). A flow that ran at least one step is never retried.
      const ranAStep = /\.\.\. (COMPLETED|FAILED)/.test(text);
      if (attempt === 1 && !ranAStep) {
        console.log(`    (Maestro ran no step for ${flow}; retrying once)`);
        continue;
      }
      return { ok: false, out: text.split('\n').slice(-25).join('\n') };
    }
  }
}

async function flow(id, name, file, env, before) {
  if (ONLY.length && !ONLY.includes(id)) return record(id, name, 'SKIP', 'not selected');
  try {
    await before?.();
    const r = maestro(file, env, `${id}-${file.replace('.yaml', '')}`);
    record(id, name, r.ok ? 'PASS' : 'FAIL', r.ok ? '' : r.out);
    return r.ok;
  } catch (error) {
    record(id, name, 'FAIL', String(error.message ?? error));
    return false;
  }
}

// ------------------------------------------------------------------ run
const email = `native-${randomUUID().slice(0, 8)}@test.invalid`;
const password = 'correct-horse-battery-staple';
const env = { EMAIL: email, PASSWORD: password };

console.log(`Native validation on ${DEVICE} — results in ${outDir}\n`);

// P0 device facts
const device = {
  model: adb('shell', 'getprop', 'ro.product.model'),
  android: adb('shell', 'getprop', 'ro.build.version.release'),
  api: adb('shell', 'getprop', 'ro.build.version.sdk'),
  abi: adb('shell', 'getprop', 'ro.product.cpu.abi'),
  locale:
    adb('shell', 'getprop', 'persist.sys.locale') || adb('shell', 'getprop', 'ro.product.locale'),
  density: adb('shell', 'wm', 'density'),
  size: adb('shell', 'wm', 'size'),
};
console.log('Device:', JSON.stringify(device));

// Pre-flight
const pre = [];
try {
  adb('reverse', 'tcp:54321', 'tcp:54321');
  adb('reverse', 'tcp:8081', 'tcp:8081');
  pre.push('adb reverse 54321, 8081 OK');
} catch (e) {
  pre.push(`adb reverse FAILED: ${e.message}`);
}
try {
  const h = await fetch(`${stack.API_URL}/auth/v1/health`, { headers: { apikey: stack.ANON_KEY } });
  pre.push(`supabase auth health ${h.status}`);
} catch {
  pre.push('supabase NOT reachable');
}
let metro = null;
try {
  metro = await (await fetch('http://localhost:8081/status')).text();
} catch {
  /* not running */
}
if (!metro?.includes('running')) {
  console.log('Starting Metro …');
  const m = spawn('pnpm', ['--filter', '@matchup/app', 'exec', 'expo', 'start', '--port', '8081'], {
    cwd: root,
    shell: true,
    // Never CI=1: it disables file watching and the device would run stale JavaScript.
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'CI')),
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000);
    try {
      metro = await (await fetch('http://localhost:8081/status')).text();
      if (metro.includes('running')) break;
    } catch {
      /* wait */
    }
  }
  process.on('exit', () => m.kill());
}
pre.push(`metro: ${metro?.includes('running') ? 'running' : 'NOT running'}`);
if (!args.includes('--skip-install')) {
  if (!existsSync(APK)) {
    console.error(`APK not found: ${APK}`);
    process.exit(2);
  }
  adb('install', '-r', APK);
  pre.push(`installed ${APK.split(/[\\/]/).pop()}`);
}
adb('shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS').toString();

// After JavaScript changes Metro builds the bundle on the first app start (up to a minute or two): wait
// once for the home screen, so a cold bundle is not mistaken for an app defect by the first flow.
async function warmUpApp() {
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/warm.xml');
      const screen = adb('shell', 'cat', '/sdcard/warm.xml');
      if (/Discover|Keşfet/.test(screen)) return true;
    } catch {
      /* the app is still starting */
    }
  }
  return false;
}
pre.push(`app warm-up ${(await warmUpApp()) ? 'OK' : 'TIMED OUT'}`);
console.log('Pre-flight:', pre.join(' · '), '\n');

// ---- flows
await flow(
  'N01',
  'Cold start, guest discovery, tabs, protected-route redirect',
  '01-launch-and-navigation.yaml',
);
await flow('N02', 'Sign up → "check your email" screen', '02-signup.yaml', env);

let code = null;
try {
  const link = await waitForAuthLink(email);
  const r = await codeFromEmailLink(link);
  code = r.code;
  record(
    'N02b',
    'Verification email delivered; Supabase redirects to the app scheme with a PKCE code',
    'PASS',
    `redirect → ${SCHEME}://auth/callback?code=<redacted>`,
  );
} catch (e) {
  record('N02b', 'Verification email → redirect to app scheme', 'FAIL', String(e.message));
}

if (code) {
  // WARM deep link: the app is in the foreground on the "check your email" screen.
  openDeepLink(`${SCHEME}://auth/callback?code=${code}`);
  await sleep(2500);
  await flow(
    'N03',
    'Deep link (warm) completes verification → signed in; unonboarded account is sent to onboarding',
    '03-signed-in-after-verification.yaml',
    env,
  );
  const onboarded = await flow(
    'N03b',
    'Onboarding on the device: 18+/terms/name/sport rules, then profile saved',
    '15-onboarding.yaml',
    env,
  );
  if (onboarded) {
    // What the UI did must be what the SERVER recorded (consent evidence, profile, sport level).
    const row = dbScalar(
      `select (p.onboarded_at is not null)::text || ',' || (p.adult_confirmed_at is not null)::text || ',' || p.display_name || ',' ||
        (select count(*) from public.user_consents c where c.user_id = p.id and c.kind in ('TERMS','PRIVACY_NOTICE') and c.version = 'draft-0.1' and c.revoked_at is null) || ',' ||
        (select count(*) from public.user_consents c where c.user_id = p.id and c.kind = 'MARKETING') || ',' ||
        coalesce((select string_agg(s.slug || ':' || usp.self_assessed_level, ';') from public.user_sport_profiles usp join public.sports s on s.id = usp.sport_id where usp.user_id = p.id), '')
       from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'`,
    );
    const expected = 'true,true,Ayse Yilmaz,2,0,football:3.5';
    record(
      'N03c',
      'Server state matches the UI: 18+ confirmed, terms+privacy consent versions recorded, no marketing consent, football 3.5',
      row === expected ? 'PASS' : 'FAIL',
      row === expected ? '' : `expected ${expected} but database has ${row}`,
    );
  }
  const edited = onboarded
    ? await flow(
        'N03d',
        'Profile on the device: edit bio, add a sport, make the profile visible to everyone',
        '16-profile-edit.yaml',
        env,
      )
    : false;
  if (edited) {
    const row = dbScalar(
      `select coalesce(p.bio, '') || ',' || s.profile_visibility::text || ',' ||
        coalesce((select string_agg(sp.slug || ':' || usp.self_assessed_level, ';' order by sp.slug) from public.user_sport_profiles usp join public.sports sp on sp.id = usp.sport_id where usp.user_id = p.id), '')
       from public.profiles p join public.user_settings s on s.user_id = p.id join auth.users u on u.id = p.id where u.email = '${email}'`,
    );
    const expected = 'Plays on weekends,EVERYONE,football:3.5;tennis:3.0';
    record(
      'N03e',
      'Server state matches the edits: bio, visibility EVERYONE, football 3.5 + tennis 3.0',
      row === expected ? 'PASS' : 'FAIL',
      row === expected ? '' : `expected ${expected} but database has ${row}`,
    );
  }
  await flow(
    'N04',
    'Session persists after the process is killed and relaunched',
    '04-session-persists-after-restart.yaml',
    env,
  );
  await flow('N05', 'Sign out → guest home; still signed out after restart', '05-sign-out.yaml');
} else {
  for (const id of ['N03', 'N04', 'N05']) record(id, 'depends on N02b', 'SKIP', 'no code');
}

await flow(
  'N06',
  'Sign in with credentials returns to the page that required sign-in',
  '06-sign-in.yaml',
  env,
);
await flow('N07', 'Wrong password → one generic error', '07-wrong-password.yaml', env);

// Network behavior: server unreachable, then recovery without restarting the app
if (!ONLY.length || ONLY.includes('N08')) {
  reverse(false);
  const r8 = maestro('08-sign-in-when-server-unreachable.yaml', env, 'N08');
  record(
    'N08',
    'Server unreachable → clear, localized network error',
    r8.ok ? 'PASS' : 'FAIL',
    r8.ok ? '' : r8.out,
  );
  reverse(true);
  const r9 = maestro('09-retry-after-recovery.yaml', env, 'N09');
  record(
    'N09',
    'Connectivity restored → same form succeeds without restart',
    r9.ok ? 'PASS' : 'FAIL',
    r9.ok ? '' : r9.out,
  );
}

// ---- Phase 3 on the device: discovery, requesting with the keyboard open, approval and inbox, auto-approve and
// invite-only events. The player is the account of the flows above (signed in by N09, football + tennis);
// the organizer and the events are created through the real RPCs, and every UI result is checked against the
// server's own record.
if (!ONLY.length || ONLY.some((id) => /^N(1[7-9]|2[0-2])/.test(id))) {
  const fixtures = phase3Fixtures(stack);
  const tag = randomUUID().slice(0, 6);
  const title = `Native Mac ${tag}`;
  const autoTitle = `Native Otomatik ${tag}`;
  const inviteTitle = `Native Davetli ${tag}`;
  const message = 'Orta saha oynarim';
  let host = null;
  try {
    host = await fixtures.createOrganizer('Native Duzenleyen');
    const eventId = await host.publish(title);
    const autoId = await host.publish(autoTitle, { autoApprove: true });
    const inviteId = await host.publish(inviteTitle, { inviteOnly: true });
    const playerId = `(select id from auth.users where email = '${email}')`;
    const row = (id) =>
      dbScalar(
        `select coalesce((select status || '|' || coalesce(request_message, '') from public.event_participations where event_id = '${id}' and user_id = ${playerId}), 'none')`,
      );

    const discovered = await flow(
      'N17',
      'Discover on the device: chooses a sport, filters behind a button, join action on the first screen',
      '17-discover-phase3.yaml',
      { TITLE: title },
    );
    const requested = discovered
      ? await flow(
          'N18',
          'Request to join with the on-screen keyboard open (pinned form stays usable)',
          '18-request-to-join.yaml',
          { MSG: message },
        )
      : false;
    if (requested) {
      const r = row(eventId);
      record(
        'N18b',
        'Server state matches: the request exists, REQUESTED, with the typed message',
        r === `REQUESTED|${message}` ? 'PASS' : 'FAIL',
        r === `REQUESTED|${message}` ? '' : `expected REQUESTED|${message} but database has ${r}`,
      );
      const pid = dbScalar(
        `select id from public.event_participations where event_id = '${eventId}' and user_id = ${playerId}`,
      );
      await host.approve(pid);
      await flow(
        'N19',
        'After approval: My Events → Approved, bell and inbox carry it, the event page shows the roster',
        '19-approved-and-inbox.yaml',
        { TITLE: title },
      );
    } else {
      record('N19', 'depends on N18', 'SKIP', 'no request');
    }

    await flow(
      'N20',
      'Auto-approve event admits the player at once',
      '20-auto-approve.yaml',
      { TITLE: autoTitle },
      async () => {
        forceStop();
        openDeepLink(`${SCHEME}://e/${autoId}`);
        await sleep(6000);
      },
    );
    const autoRow = row(autoId);
    record(
      'N20b',
      'Server state matches: APPROVED without the organizer doing anything',
      autoRow.startsWith('APPROVED') ? 'PASS' : 'FAIL',
      autoRow.startsWith('APPROVED') ? '' : `database has ${autoRow}`,
    );

    const token = dbScalar(`select invite_token from public.events where id = '${inviteId}'`);
    await flow(
      'N21',
      'Invite-only event without its token: does not exist for the player (deep link)',
      '21-invite-without-token.yaml',
      {},
      async () => {
        forceStop();
        openDeepLink(`${SCHEME}://e/${inviteId}`);
        await sleep(6000);
      },
    );
    await flow(
      'N22',
      'Invite-only event with the link token: visible and requestable',
      '22-invite-with-token.yaml',
      { TITLE: inviteTitle },
      async () => {
        forceStop();
        openDeepLink(`${SCHEME}://e/${inviteId}?invite=${token}`);
        await sleep(6000);
      },
    );
    const inviteRow = row(inviteId);
    record(
      'N22b',
      'Server state matches: the invite request exists (REQUESTED)',
      inviteRow.startsWith('REQUESTED') ? 'PASS' : 'FAIL',
      inviteRow.startsWith('REQUESTED') ? '' : `database has ${inviteRow}`,
    );
  } catch (error) {
    record('N17', 'Phase 3 fixtures', 'FAIL', String(error.message ?? error));
  } finally {
    if (host) {
      try {
        dbScalar(`delete from public.events where organizer_id = '${host.id}' returning 1`);
      } catch {
        /* test data on the local stack only */
      }
      await fixtures.deleteUser(host.id);
    }
  }
}

// ---- Phase 4–6 on the device: province search, the native map, near me with the OS permission, and reporting an
// event. Self-contained: its own organizer and player (created through the real RPCs), so it runs with --only too.
if (!ONLY.length || ONLY.some((id) => /^N2[3-6]/.test(id))) {
  const fixtures = phase3Fixtures(stack);
  const tag = randomUUID().slice(0, 6);
  const title = `Native Harita ${tag}`;
  let host = null;
  let player = null;
  try {
    host = await fixtures.createOrganizer('Native Harita Duzenleyen');
    player = await fixtures.createOrganizer('Native Harita Oyuncu');
    // A pin at ODTÜ, a public place: drawn as a pin, a few hundred metres from where the emulator will stand.
    const eventId = await host.publish(title, { point: { lat: 39.895, lon: 32.7795 } });
    const signedIn = await flow('N23a', 'Phase 4 player signs in', '06-sign-in.yaml', {
      EMAIL: player.email,
      PASSWORD: 'correct-horse-battery-staple',
    });
    if (signedIn) {
      await flow(
        'N23',
        'Province sheet searches without Turkish letters; Discover switches to the native map with the event marker',
        '23-province-and-map.yaml',
        { TITLE: title },
      );
      await flow(
        'N24',
        'Near me: the OS asks once (approximate), the list is sorted by distance with the distance shown',
        '24-near-me.yaml',
        { TITLE: title },
        async () => {
          // The emulator's position, a few hundred metres from the pin (longitude first for geo fix).
          adb('emu', 'geo', 'fix', '32.7810', '39.8960');
          await sleep(1500);
        },
      );
      const reported = await flow('N25', 'Report an event from its page', '25-report-event.yaml', {
        TITLE: title,
      });
      if (reported) {
        const n = dbScalar(
          `select count(*) from public.reports where target_type = 'EVENT' and target_id = '${eventId}' and reason = 'FAKE_EVENT' and reporter_id = '${player.id}'`,
        );
        record(
          'N25b',
          'Server state matches: one FAKE_EVENT report by that player',
          n === '1' ? 'PASS' : 'FAIL',
          n === '1' ? '' : `database has ${n}`,
        );
      }
    } else {
      record('N23', 'depends on N23a', 'SKIP', 'not signed in');
    }
  } catch (error) {
    record('N23', 'Phase 4–6 fixtures', 'FAIL', String(error.message ?? error));
  } finally {
    for (const who of [host, player]) {
      if (!who) continue;
      try {
        dbScalar(`delete from public.events where organizer_id = '${who.id}' returning 1`);
      } catch {
        /* test data on the local stack only */
      }
      await fixtures.deleteUser(who.id);
    }
  }
}

// Deep links: COLD start (process dead) for each
await flow(
  'N10',
  'Forged/expired link code is rejected clearly (cold-start deep link)',
  '10-deeplink-invalid-code.yaml',
  {},
  async () => {
    // Must start signed out: with a live session the callback route just continues to the home screen.
    forceStop();
    adb('shell', 'pm', 'clear', PKG);
    openDeepLink(`${SCHEME}://auth/callback?code=forged-code-0000`);
    await sleep(9000);
  },
);
await flow(
  'N11',
  'Event deep link → honest not-found (cold start)',
  '11-deeplink-event-not-found.yaml',
  {},
  async () => {
    forceStop();
    adb('shell', 'pm', 'clear', PKG);
    openDeepLink(`${SCHEME}://e/00000000-0000-0000-0000-000000000000`);
    await sleep(5000);
  },
);
await flow(
  'N12',
  'Protected route deep link while signed out → sign-in (cold start)',
  '12-deeplink-protected-route-as-guest.yaml',
  {},
  async () => {
    forceStop();
    adb('shell', 'pm', 'clear', PKG);
    openDeepLink(`${SCHEME}://my-events`);
    await sleep(5000);
  },
);

// In-app language selector (does not depend on the device language)
await flow(
  'N14L',
  'In-app language selector switches the UI and persists across a restart',
  '14-language-selector.yaml',
);

// Localization: per-app locale (Android 13+); falls back to the system locale on failure.
// Clearing app data also resets the per-app language, so the language is set AFTER the clear and the
// flow itself must not use clearState.
await flow(
  'N13',
  'Turkish device language → Turkish UI incl. İ ı Ş Ğ characters',
  '13-turkish-localization.yaml',
  {},
  async () => {
    forceStop();
    adb('shell', 'pm', 'clear', PKG);
    adb('shell', 'cmd', 'locale', 'set-app-locales', PKG, '--locales', 'tr-TR');
  },
);
try {
  adb('shell', 'cmd', 'locale', 'set-app-locales', PKG, '--locales', 'en-US');
} catch {
  /* ignore */
}

// Crash / error evidence
let crashes = '';
try {
  crashes = adb('logcat', '-d', '-b', 'crash');
} catch {
  /* ignore */
}
const fatal = adb('logcat', '-d', '-s', 'AndroidRuntime:E')
  .split('\n')
  .filter((l) => l.includes(PKG) || l.includes('FATAL'))
  .slice(0, 5)
  .join('\n');
const jsErrors = adb('logcat', '-d', '-s', 'ReactNativeJS:E').split('\n').filter(Boolean);
record(
  'N14',
  'No native crashes or fatal exceptions during the whole run',
  !crashes.trim() && !fatal.trim() ? 'PASS' : 'FAIL',
  `${crashes.trim().slice(0, 300)}${fatal}`,
);
record(
  'N15',
  'JavaScript error log (ReactNativeJS:E) is empty',
  jsErrors.length === 0 ? 'PASS' : 'FAIL',
  jsErrors.slice(0, 5).join('\n'),
);

try {
  const t = adb('shell', 'am', 'start', '-W', '-S', '-n', `${PKG}/.MainActivity`)
    .split('\n')
    .filter((l) => /TotalTime|WaitTime|ThisTime/.test(l))
    .join(' · ');
  record('N16', 'Cold start timing (DEBUG build with Metro — not a performance claim)', 'PASS', t);
} catch (e) {
  record('N16', 'Cold start timing', 'SKIP', String(e.message).slice(0, 120));
}

writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify({ stamp, device, email: '<redacted>', results }, null, 2),
);
const failed = results.filter((r) => r.status === 'FAIL');
console.log(
  `\n${results.filter((r) => r.status === 'PASS').length} passed, ${failed.length} failed, ${results.filter((r) => r.status === 'SKIP').length} skipped → ${join(outDir, 'results.json')}`,
);
process.exit(failed.length ? 1 : 0);
