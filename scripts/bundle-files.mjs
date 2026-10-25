// Lists the largest source files of ONE npm package inside the web bundle (docs/PERFORMANCE.md).
//   node scripts/bundle-files.mjs <package> [distDir]     e.g.  node scripts/bundle-files.mjs zod
// Companion to analyze-bundle.mjs: when a package is unexpectedly large, this shows which of its files
// (and therefore which entry point) were pulled in.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { explore } from 'source-map-explorer';

const [pkg, dist = 'apps/app/dist'] = process.argv.slice(2);
if (!pkg) {
  console.error('usage: node scripts/bundle-files.mjs <package> [distDir]');
  process.exit(2);
}
const jsDir = join(dist, '_expo/static/js/web');
const needle = `node_modules/${pkg}/`;
const totals = new Map();

for (const name of readdirSync(jsDir).filter((n) => n.endsWith('.js'))) {
  const result = await explore(
    { code: join(jsDir, name), map: join(jsDir, `${name}.map`) },
    { output: { format: 'json' }, onlyMapped: true, noBorderChecks: true },
  );
  for (const bundle of result.bundles) {
    for (const [source, info] of Object.entries(bundle.files)) {
      const normalized = source.replaceAll('\\', '/');
      const at = normalized.lastIndexOf(needle);
      if (at === -1) continue;
      const file = normalized.slice(at + needle.length);
      totals.set(file, (totals.get(file) ?? 0) + info.size);
    }
  }
}

const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
const sum = rows.reduce((n, [, size]) => n + size, 0);
console.log(`${pkg}: ${rows.length} files, ${(sum / 1024).toFixed(1)} kB minified`);
for (const [file, size] of rows.slice(0, 25)) {
  console.log(`  ${(size / 1024).toFixed(1).padStart(7)} kB  ${file}`);
}
