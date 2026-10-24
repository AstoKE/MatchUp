// Regenerates the typed database contract from the LOCAL stack (never from a hosted project).
// CI runs this and fails on any diff, so migrations and types cannot drift apart.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUTPUT = 'apps/app/src/types/supabase.generated.ts';

// Fixed, constant command (no user input), so running it through the shell is safe and portable.
const types = execSync('pnpm exec supabase gen types typescript --local --schema public', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

writeFileSync(OUTPUT, types.replace(/\r\n/g, '\n'));
// Deterministic formatting: the committed file and a fresh generation must be byte-identical, so the
// CI drift check (`git diff --exit-code`) only fires on real schema/type changes.
execSync(`pnpm exec prettier --write ${OUTPUT}`, { stdio: 'ignore' });
console.log(`wrote ${OUTPUT} (${types.split('\n').length} lines)`);
