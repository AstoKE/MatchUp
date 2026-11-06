// MapLibre GL JS 6 runs its tile parsing in a separate module worker that cannot be bundled by Metro. This copies the
// worker of the installed version into apps/app/public/vendor/ (git-ignored), which the dev server serves and
// `expo export` copies into dist/. MapCanvas.web.tsx points MapLibre at it with setWorkerUrl. Run by `web`, `start` and
// `export:web`; needs no network.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '../apps/app');
const require = createRequire(join(app, 'package.json'));
const pkgDir = dirname(require.resolve('maplibre-gl/package.json'));
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(app, 'public/vendor');
mkdirSync(out, { recursive: true });
for (const old of readdirSync(out))
  if (old.startsWith('maplibre-gl-worker')) rmSync(join(out, old));
copyFileSync(
  join(pkgDir, 'dist/maplibre-gl-worker.mjs'),
  join(out, `maplibre-gl-worker-${version}.mjs`),
);
console.log(`copied maplibre-gl-worker-${version}.mjs to apps/app/public/vendor/`);
