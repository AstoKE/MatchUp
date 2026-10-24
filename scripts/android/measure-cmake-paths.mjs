// Diagnostic: how long are the object-file paths CMake/ninja generate for the Android build, and would
// shortening strategies fit under Windows' 260-character MAX_PATH? (docs/ANDROID_SETUP.md §6)
// Usage: node scripts/android/measure-cmake-paths.mjs [path-to-.cxx/Debug/<hash>/x86_64]
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const cxxDir =
  process.argv[2] ??
  execSync('ls -d apps/app/android/app/.cxx/Debug/*/x86_64', { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')[0];
const buildDir = resolve(root, cxxDir);
const ninja = readFileSync(`${buildDir}/build.ninja`, 'utf8');
const objects = [...ninja.matchAll(/^build (\S+\.o):/gm)]
  .map((m) => m[1].replaceAll('$:', ':'))
  .filter((o) => !o.startsWith('/') && !/^[A-Za-z]:/.test(o));

const repoRootWin = 'C:\\dev\\matchup';
const mirrored = 'C_/dev/matchup';
const lengthFor = (buildDirLen, mirroredReplacement) =>
  Math.max(
    ...objects.map((o) => buildDirLen + 1 + o.replace(mirrored, mirroredReplacement).length),
  );

console.log(`objects: ${objects.length}`);
console.log(`build dir: ${buildDir} (${buildDir.length} chars)`);
console.log(
  `current longest absolute path:                ${lengthFor(buildDir.length, mirrored)}  (limit 259)`,
);
console.log(
  `subst M: for repo root, same layout:          ${lengthFor(buildDir.length - (repoRootWin.length - 2), 'M_')}`,
);
console.log(`subst M: + staging dir M:\\b\\x:               ${lengthFor('M:\\b\\x'.length, 'M_')}`);
const worst = objects.sort((a, b) => b.length - a.length).slice(0, 3);
for (const w of worst) console.log(`  longest relative (${w.length}): ${w}`);
