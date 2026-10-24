// Fails if any file in the client build output contains a privileged credential.
// Usage: node scripts/check-bundle-secrets.mjs [dir ...]   (default: apps/app/dist)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findSecrets } from './lib/secret-scan.mjs';

const TEXT_EXTENSIONS = new Set(['.js', '.html', '.json', '.map', '.css', '.txt']);
const targets = process.argv.length > 2 ? process.argv.slice(2) : ['apps/app/dist'];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let scanned = 0;
const problems = [];
for (const target of targets) {
  if (!existsSync(target)) {
    console.error(`Build output not found: ${target} (export the app first)`);
    process.exit(2);
  }
  for (const file of walk(target)) {
    const extension = file.slice(file.lastIndexOf('.'));
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    scanned += 1;
    for (const finding of findSecrets(readFileSync(file, 'utf8'))) {
      problems.push(`${file}: ${finding.kind} (${finding.sample})`);
    }
  }
}

if (problems.length > 0) {
  console.error('PRIVILEGED CREDENTIALS FOUND IN CLIENT BUILD OUTPUT:');
  for (const problem of problems) console.error('  ' + problem);
  process.exit(1);
}
console.log(`bundle secret scan passed (${scanned} files in ${targets.join(', ')})`);
