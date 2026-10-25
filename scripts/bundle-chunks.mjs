// Which packages dominate each chunk of the web bundle (docs/PERFORMANCE.md).
//   node scripts/bundle-chunks.mjs [distDir]      (export with --source-maps first)
// analyze-bundle.mjs ranks packages over the whole bundle; this shows WHERE they sit, which matters
// because only some chunks are needed for the first screen.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { explore } from 'source-map-explorer';

const dist = process.argv[2] ?? 'apps/app/dist';
const jsDir = join(dist, '_expo/static/js/web');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1].split('/').pop()));

function packageOf(source) {
  const normalized = source.replaceAll('\\', '/');
  const at = normalized.lastIndexOf('node_modules/');
  if (at === -1) return '(app + workspace)';
  const rest = normalized.slice(at + 'node_modules/'.length).split('/');
  return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
}

const chunks = readdirSync(jsDir)
  .filter((n) => n.endsWith('.js'))
  .map((name) => ({ name, gz: gzipSync(readFileSync(join(jsDir, name)), { level: 9 }).length }))
  .filter((c) => c.gz > 20 * 1024)
  .sort((a, b) => b.gz - a.gz);

let initialGz = 0;
for (const chunk of chunks) {
  const result = await explore(
    { code: join(jsDir, chunk.name), map: join(jsDir, `${chunk.name}.map`) },
    { output: { format: 'json' }, onlyMapped: true, noBorderChecks: true },
  );
  const byPackage = new Map();
  for (const [source, info] of Object.entries(result.bundles[0].files)) {
    const pkg = packageOf(source);
    byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + info.size);
  }
  const top = [...byPackage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pkg, size]) => `${pkg} ${Math.round(size / 1024)}k`)
    .join(', ');
  const isInitial = initial.has(chunk.name);
  if (isInitial) initialGz += chunk.gz;
  console.log(
    `${String(Math.round(chunk.gz / 1024)).padStart(4)} kB gz  ${isInitial ? 'INITIAL' : 'route  '}  ${chunk.name.slice(0, 22).padEnd(22)}  ${top}`,
  );
}
console.log(
  `\nscripts referenced by index.html (large ones listed above): ~${Math.round(initialGz / 1024)} kB gz`,
);
