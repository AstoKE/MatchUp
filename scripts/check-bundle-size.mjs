// Bundle-size ratchet for the web export (ARCHITECTURE §8 performance budgets).
//
// The long-term target is an initial route < 350 kB gzip (docs/PERFORMANCE.md has the measured gap and
// the plan). This script enforces *ratchets*, not the target: two numbers may not grow beyond the
// recorded baseline + headroom. Lower them as optimizations land; never raise one without writing down
// why. This is a regression guard, not a claim that the budget is met.
//
//   TOTAL   all web JS chunks (gzip)                       measured  863 kB on 2026-10-29
//   INITIAL scripts referenced by index.html (gzip)        measured  537 kB on 2026-10-25 (first paint cost,
//           before any route chunk; lazily loaded chunks such as Sentry are not in it)
//
// INITIAL was raised 540 -> 555 on purpose (2026-10-25): the in-house SVG tab icons put react-native-svg
// (~16 kB) into the shared chunk, but removed the 149 kB Ionicons chunk that every tabbed screen loaded
// right after it, so the first tabbed screen got ~130 kB cheaper (docs/PERFORMANCE.md §3.5).
//
// TOTAL lowered 940 -> 900 (2026-10-29): Sentry session replay and the feedback widget no longer ship on
// web (docs/PERFORMANCE.md §3.6); 939 -> 882 kB.
//
// Both lowered again (2026-10-29): TOTAL 900 -> 885, INITIAL 570 -> 555. Supabase Realtime and Storage no longer ship
// on web (docs/PERFORMANCE.md §3.7); INITIAL 565 -> 541 kB.
//
// INITIAL raised again 555 -> 570 (2026-10-27, Phase 3 / M2): the event screens share their form, API
// and hooks across four routes, and Metro's web splitting puts code used by more than one route into
// __common, which index.html always loads (app code in __common 102 -> 158 kB minified, +14 kB gzip).
// Structural follow-up in docs/PERFORMANCE.md §4 (item 5) before the next raise.
//
// TOTAL raised 885 -> 897 on purpose (2026-11-05, Phase 6 / M5): the administration console is one lazy, web-only chunk
// (AdminGate, 10 kB gzip: second-factor screens, the queue, people, flags, disputes and the record, with their server calls
// and copy). Nobody but an administrator downloads it, and INITIAL did not move (554 kB). A change that lifts the total
// beyond this needs its own reason here.
//
// TOTAL raised 897 -> 898 (2026-11-05, Phase 6 / M6): four notification texts in two languages, the suspended-account
// page and the display-name check are in the main bundle, since every signed-in person needs them. INITIAL stays 555 and
// is now exactly on it: nothing more can join the first load without something leaving it.
//
// TOTAL raised 898 -> 901 (2026-11-06, Phase 4 / M1-M2): the province picker of Discover, the search box of the province
// and district fields, the Turkish name matching and the nested catalog read (+2 kB), and the event form moved into its
// own lazy chunk (EventStepper, 4 kB gzip; about 1 kB of that is the cost of splitting). The move is what made room for
// the picker in the first load: INITIAL went 557 -> 554 kB and stays under 555.
//
// TOTAL raised 901 -> 905 (2026-11-07, Phase 4 / M3-M4): the console's venues section (AdminGate 11 -> 13 kB, lazy, admins
// only), the venue field of the event form (in the lazy EventStepper chunk) and the parsing of points and venues in the
// event and search reads. INITIAL is 555 again, exactly on its limit: the map (M5) must arrive as its own lazy chunk.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_RATCHET_KB = 905;
const INITIAL_RATCHET_KB = 555;
const dir = process.argv[2] ?? 'apps/app/dist/_expo/static/js/web';

if (!existsSync(dir)) {
  console.error(`Build output not found: ${dir} (export the web app first)`);
  process.exit(2);
}

const gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).length;

let totalGz = 0;
const rows = [];
for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  if (!name.endsWith('.js') || !statSync(path).isFile()) continue;
  const gz = gzipSize(path);
  totalGz += gz;
  rows.push([name.slice(0, 40), Math.round(gz / 1024)]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [name, kb] of rows.slice(0, 6))
  console.log(`  ${String(kb).padStart(5)} kB gzip  ${name}`);

// dist/_expo/static/js/web -> dist/index.html
const distRoot = join(dirname(dir), '..', '..', '..');
const indexHtml = join(distRoot, 'index.html');
let initialGz = 0;
if (existsSync(indexHtml)) {
  const html = readFileSync(indexHtml, 'utf8');
  for (const [, src] of html.matchAll(/src="([^"]+\.js)"/g)) {
    const file = join(distRoot, src);
    if (existsSync(file)) initialGz += gzipSize(file);
  }
} else {
  console.warn(`index.html not found next to ${dir}; the initial-load check is skipped`);
}

const totalKb = Math.round(totalGz / 1024);
const initialKb = Math.round(initialGz / 1024);
console.log(`total web JS: ${totalKb} kB gzip (ratchet ${TOTAL_RATCHET_KB} kB)`);
if (initialGz > 0)
  console.log(`initial scripts: ${initialKb} kB gzip (ratchet ${INITIAL_RATCHET_KB} kB)`);

let failed = false;
if (totalKb > TOTAL_RATCHET_KB) {
  console.error(
    'Total web JS grew beyond the recorded baseline. Investigate or justify before merging.',
  );
  failed = true;
}
if (initialGz > 0 && initialKb > INITIAL_RATCHET_KB) {
  console.error(
    'Initial-load JS grew beyond the recorded baseline. Investigate or justify before merging.',
  );
  failed = true;
}
if (failed) process.exit(1);
