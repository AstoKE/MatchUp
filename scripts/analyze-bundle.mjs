// Per-dependency attribution of the web bundle (docs/PERFORMANCE.md).
//
// Usage:
//   pnpm --filter @matchup/app exec expo export --platform web --source-maps   (with EXPO_PUBLIC_* set)
//   node scripts/analyze-bundle.mjs [distDir] [--json out.json]
//
// For every chunk, source-map-explorer attributes each *minified* byte to the original source file via
// the source map. We group by npm package and split each chunk's real gzip size proportionally, so the
// numbers add up to what the network actually carries. Attribution is an estimate (shared minifier
// output, tree-shaking, module concatenation), good to a few percent, and it is the right tool for
// ranking dependencies — not for sub-kilobyte claims.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { explore } from 'source-map-explorer';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;
const dist = args.find((a) => !a.startsWith('--') && a !== jsonOut) ?? 'apps/app/dist';
const jsDir = join(dist, '_expo/static/js/web');

function packageOf(source) {
  const normalized = source.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('node_modules/');
  if (index === -1) {
    // Workspace code: attribute to the workspace package or the app itself.
    const ws = /packages\/([^/]+)\//.exec(normalized);
    return ws ? `@matchup/${ws[1]} (workspace)` : '(app source)';
  }
  const rest = normalized.slice(index + 'node_modules/'.length);
  const parts = rest.split('/');
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : (parts[0] ?? '(unknown)');
}

const chunks = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
const perPackage = new Map(); // pkg -> { minified, gzip, chunks:Set }
let totalGzip = 0;
let totalMinified = 0;
const chunkRows = [];

for (const chunk of chunks) {
  const jsPath = join(jsDir, chunk);
  const mapPath = `${jsPath}.map`;
  try {
    statSync(mapPath);
  } catch {
    console.error(`No source map for ${chunk} (export with --source-maps)`);
    process.exit(2);
  }
  const code = readFileSync(jsPath);
  const gzip = gzipSync(code, { level: 9 }).length;
  const result = await explore(
    { code: jsPath, map: mapPath },
    { output: { format: 'json' }, noBorderChecks: true },
  );
  const bundle = result.bundles[0];
  const files = bundle.files;
  const attributed = Object.values(files).reduce((sum, f) => sum + f.size, 0) || 1;
  totalGzip += gzip;
  totalMinified += code.length;
  chunkRows.push({
    chunk: chunk.slice(0, 36),
    minifiedKB: Math.round(code.length / 1024),
    gzipKB: Math.round(gzip / 1024),
  });

  for (const [source, info] of Object.entries(files)) {
    if (source.startsWith('[')) continue; // [unmapped], [EOLs]
    const pkg = packageOf(source);
    const row = perPackage.get(pkg) ?? { minified: 0, gzip: 0, chunks: new Set() };
    row.minified += info.size;
    row.gzip += (info.size / attributed) * gzip;
    row.chunks.add(chunk.slice(0, 20));
    perPackage.set(pkg, row);
  }
}

const rows = [...perPackage.entries()]
  .map(([pkg, v]) => ({
    pkg,
    minifiedKB: +(v.minified / 1024).toFixed(1),
    gzipKB: +(v.gzip / 1024).toFixed(1),
    chunks: v.chunks.size,
  }))
  .sort((a, b) => b.gzipKB - a.gzipKB);

console.log(
  `\nChunks (${chunks.length}): total ${Math.round(totalMinified / 1024)} kB minified, ${Math.round(totalGzip / 1024)} kB gzip`,
);
for (const r of chunkRows.sort((a, b) => b.gzipKB - a.gzipKB))
  console.log(
    `  ${String(r.gzipKB).padStart(5)} kB gz  ${String(r.minifiedKB).padStart(5)} kB min  ${r.chunk}`,
  );
console.log('\nTop dependencies by estimated gzip contribution:');
for (const r of rows.slice(0, 30)) {
  const pct = ((r.gzipKB / (totalGzip / 1024)) * 100).toFixed(1).padStart(5);
  console.log(
    `  ${String(r.gzipKB).padStart(6)} kB gz ${pct}%  ${String(r.minifiedKB).padStart(7)} kB min  ${r.pkg}`,
  );
}
if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        totalGzipKB: Math.round(totalGzip / 1024),
        totalMinifiedKB: Math.round(totalMinified / 1024),
        chunks: chunkRows,
        packages: rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonOut}`);
}
