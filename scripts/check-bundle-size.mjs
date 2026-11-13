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
//
// MAP is a third ratchet (2026-11-07, Phase 4 / M5): MapLibre GL JS is about 286 kB gzip on its own, loaded only when
// someone opens the map or the pin picker (MapCanvas chunk; its worker is a separate file in public/vendor, not counted).
// It is measured on its own and left out of TOTAL, so TOTAL keeps meaning "the app's code". TOTAL 905 -> 913 for M5: the
// map view of Discover, the pin picker and the venue suggestion form (lazy chunks), the lazy-loading glue of each split.
// INITIAL raised 555 -> 556 for M5, with the reason: "near me" and the list/map switch sit on Discover (+2.9 kB), and the
// event page's request, attendance and review panels moved out of the first load to pay for them (-2.3 kB). Measured
// 555.26 kB on main before, 555.6 kB after.
// TOTAL 913 -> 916 and INITIAL 556 -> 558 (2026-11-07, Phase 7 / M4): the explicit usage-data consent text in two
// languages sits in the profile translations, which every first load carries (all namespaces are bundled up front), plus
// the small usage hooks on Discover and the event page; the console's pilot section is in the lazy admin chunk (+2 kB).
// Splitting more screens into lazy chunks has stopped paying (~1 kB of loader per split). The structural fix is loading
// translations per language on demand (PERFORMANCE §4 item 5), scheduled in Phase 7 / M5.
// INITIAL lowered 558 -> 548 (2026-11-07, Phase 7 / M5): English is its own chunk on the web (en-resources, 12 kB gzip),
// loaded only for English users before the first render (lib/i18n/english.web.ts); measured 547 kB. TOTAL 916 -> 917 for
// the split's loader.
// TOTAL 917 -> 918 (2026-11-07, Phase 7 / M7 and Phase 8 / M1): the support contact, and Discover's sport strip as
// court tiles with a measured grid in the filter sheet. INITIAL unchanged at 548.
// TOTAL 918 -> 920 and INITIAL 548 -> 550 (2026-11-07, Phase 8 / M2): the wheel picker (ui/WheelPicker, the date and
// time wheels) is used by Discover's date sheet and by the event form. A lazy chunk for Discover's sheet was tried and
// measured: Metro moves a module shared by two lazy chunks into __common, which index.html loads, so it saved nothing.
// TOTAL 920 -> 935 and INITIAL 550 -> 555 (2026-11-07, Phase 8 / M3): avatars and photos. The avatar screen with the photo
// picker and the image manipulator is a lazy chunk (AvatarScreen, ~8 kB gzip; INITIAL was 563 before that split). What stays
// in the first load is what Discover's header avatar needs: the avatar API and hooks, the drawings' asset table (the
// pictures themselves load as images), the gender question of onboarding and their copy.
// TOTAL 935 -> 937 and INITIAL 555 -> 557 (2026-11-07, Phase 8 / M4): push. expo-notifications is native only (the web uses
// push-device.web.ts, checked: not in any chunk); what grows is the root PushBridge (it renders nothing on the web), the
// Settings section that points to the phone app, the push API and hooks, and their Turkish copy.
// TOTAL 937 -> 940 and INITIAL 557 -> 558 (2026-11-07, Phase 8 phone verification, ADR-0029): the phone screen is a lazy
// chunk (INITIAL was 559 before that split); the first load keeps the gate's check, the Settings row, the number helpers
// and the Turkish copy.
// TOTAL 940 -> 941 and INITIAL 558 -> 559 (2026-11-09, minor/patch dependency updates): @tanstack/query-core and the
// Supabase client grew a little (measured with source maps against main). i18next 26.7 / react-i18next 17.1.13 would have
// added 1.9 kB more for features the app does not use, so they stay at 26.5 / 17.1.8.
// TOTAL 941 -> 943 (2026-11-11, ROADMAP P-22): the feedback form behind Settings › Destek (the sheet, its call and copy in
// both languages) and the console's feedback section (AdminGate, lazy, admins only). INITIAL did not move (559 kB).
// INITIAL 559 -> 560 (2026-11-11): main after merging P-20 and P-22 together measured 560 kB (each was within 559 alone):
// the "my events" switch and the feedback row both sit in Settings, which is in the first load.
// TOTAL 943 -> 949 (2026-11-11, Phase 9 / M1, ADR-0030): organizations. The two screens are ONE lazy chunk (4.4 kB) with
// their own copy (features/organizations/copy.ts, like the console's): two separate lazy imports had pushed the shared
// code and the Turkish copy into __common (+1.3 kB of first load). Plus the console's organizations section (AdminGate
// 16.4 -> 17.7 kB, admins only). INITIAL unchanged by it (560 kB, __common +0.3 kB for the routes).
// TOTAL 949 -> 955 and INITIAL 560 -> 561 (2026-11-11, Phase 9 / M2): the organization page joins the lazy organization
// chunk (+3.1 kB), the player card's invitation is its own lazy chunk with its own copy (1.3 kB). The first load grows
// 666 bytes (573,534 -> 574,200): three notification texts and their routing, the page's route and the lazy wrappers.
// TOTAL 955 -> 957 (2026-11-12, Phase 9 / M3): the event management control "Organizasyon adına" is its own lazy chunk
// (with its two calls), and the organization chunk gains the upcoming-events list. INITIAL unchanged (561 kB).
// TOTAL 957 -> 958 (2026-11-12, Phase 9 / M4): hiding, restoring and inspecting an organization in the console
// (AdminGate, admins only) and the organization page's report button. INITIAL unchanged (561 kB).
// TOTAL 958 -> 964 and INITIAL 561 -> 562 (2026-11-12, Phase 10 / M1, ADR-0031): businesses. The two screens are one lazy
// chunk with their own copy (as the organizations'), plus the console's businesses section (AdminGate, admins only). The
// first load measures 575,106 bytes (561.6 kB; 574,200 after Phase 9 / M2): the Profile row, two notification texts and
// their routing, and the VENUE_CLAIMED error text.
// TOTAL 964 -> 966 (2026-11-12, Phase 10 / M2): the console's "add a business" form, hide and restore (AdminGate, admins
// only), and the event page's business line. INITIAL unchanged (562 kB).
// TOTAL 966 -> 967 (2026-11-12, Phase 10 / M3): the owner's edit screen joins the lazy business chunk. INITIAL unchanged.
// TOTAL 967 -> 970 (2026-11-13, Phase 10 / M4): business staff. The player card's staff invitation is its own lazy chunk
// with its own copy; the business chunk gains the staff section and the invitation states. INITIAL unchanged (562 kB).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_RATCHET_KB = 970;
const INITIAL_RATCHET_KB = 562;
const MAP_RATCHET_KB = 290;
const isMapChunk = (name) => name.startsWith('MapCanvas');
const dir = process.argv[2] ?? 'apps/app/dist/_expo/static/js/web';

if (!existsSync(dir)) {
  console.error(`Build output not found: ${dir} (export the web app first)`);
  process.exit(2);
}

const gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).length;

let totalGz = 0;
let mapGz = 0;
const rows = [];
for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  if (!name.endsWith('.js') || !statSync(path).isFile()) continue;
  const gz = gzipSize(path);
  if (isMapChunk(name)) mapGz += gz;
  else totalGz += gz;
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
const mapKb = Math.round(mapGz / 1024);
console.log(`map chunk: ${mapKb} kB gzip (ratchet ${MAP_RATCHET_KB} kB)`);
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
if (mapKb > MAP_RATCHET_KB) {
  console.error(
    'The map chunk grew beyond the recorded baseline. Investigate or justify before merging.',
  );
  failed = true;
}
if (failed) process.exit(1);
