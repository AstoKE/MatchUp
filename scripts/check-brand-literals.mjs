// Fails if the temporary product name appears outside packages/config (ADR-0010).
// The name must come from brand config or i18n interpolation so a rename is a one-place change.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SCAN_PREFIXES = [
  'apps/app/src/',
  'apps/app/app/',
  'apps/app/app.config.ts',
  'packages/domain/src/',
  'supabase/migrations/',
  'supabase/functions/',
  'supabase/tests/',
  'supabase/seed/',
];
const PATTERN = /MatchUp/;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter((f) => SCAN_PREFIXES.some((p) => f.startsWith(p)))
  .filter((f) => /\.(ts|tsx|js|mjs|json|sql|toml)$/.test(f));

const violations = [];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (PATTERN.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
}

if (violations.length > 0) {
  console.error(
    'Brand literal found outside packages/config (use brand config / i18n {{appName}}):',
  );
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`brand-literal check passed (${files.length} files scanned)`);
