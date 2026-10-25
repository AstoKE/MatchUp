// Bundle-size ratchet for the web export (ARCHITECTURE §8 performance budgets).
//
// The long-term target is an initial route < 350 kB gzip (docs/PERFORMANCE.md has the measured gap and
// the plan). This script enforces *ratchets*, not the target: two numbers may not grow beyond the
// recorded baseline + headroom. Lower them as optimizations land; never raise one without writing down
// why. This is a regression guard, not a claim that the budget is met.
//
//   TOTAL   all web JS chunks (gzip)                       measured 1051 kB on 2026-10-25
//   INITIAL scripts referenced by index.html (gzip)        measured  518 kB on 2026-10-25 (first paint cost,
//           before any route chunk; lazily loaded chunks such as Sentry are not in it)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_RATCHET_KB = 1080;
const INITIAL_RATCHET_KB = 540;
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
