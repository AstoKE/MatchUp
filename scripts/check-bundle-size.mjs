// Bundle-size ratchet for the web export (ARCHITECTURE §8 performance budgets).
//
// The long-term target is an initial route < 350 kB gzip. Phase 1 measured ~895 kB gzip for the first
// load and has NOT optimized yet, so this script enforces a *ratchet*: total web JS (gzip, all chunks)
// may not grow beyond the recorded baseline + headroom. Lower RATCHET_KB as optimizations land;
// never raise it without writing down why. This is a regression guard, not a claim that the budget is met.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const RATCHET_KB = 1400; // measured total on 2026-10-24: see docs/PHASE1_REPORT.md
const dir = process.argv[2] ?? 'apps/app/dist/_expo/static/js/web';

if (!existsSync(dir)) {
  console.error(`Build output not found: ${dir} (export the web app first)`);
  process.exit(2);
}

let totalGz = 0;
const rows = [];
for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  if (!name.endsWith('.js') || !statSync(path).isFile()) continue;
  const gz = gzipSync(readFileSync(path), { level: 9 }).length;
  totalGz += gz;
  rows.push([name.slice(0, 40), Math.round(gz / 1024)]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [name, kb] of rows.slice(0, 6))
  console.log(`  ${String(kb).padStart(5)} kB gzip  ${name}`);

const totalKb = Math.round(totalGz / 1024);
console.log(`total web JS: ${totalKb} kB gzip (ratchet ${RATCHET_KB} kB)`);
if (totalKb > RATCHET_KB) {
  console.error(
    'Web bundle grew beyond the recorded baseline. Investigate or justify before merging.',
  );
  process.exit(1);
}
