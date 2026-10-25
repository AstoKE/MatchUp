// Creates an email-confirmed TEST account on the linked HOSTED project (public sign-up stays disabled).
//   node scripts/hosted-create-test-user.mjs you@example.com
// A random password is generated and printed once, in YOUR terminal only: store it in a password manager
// and never paste it into chats, issues or commits. The project's secret key is fetched with the
// Supabase CLI (your `supabase login`), used in memory for this one call and never written or printed.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const email = process.argv[2];
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: node scripts/hosted-create-test-user.mjs <email>');
  process.exit(2);
}

let ref;
try {
  ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
} catch {
  console.error('No linked project. Run: pnpm exec supabase link --project-ref <ref>');
  process.exit(1);
}

const raw = execSync(`pnpm exec supabase projects api-keys --project-ref ${ref} -o json`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const secret = JSON.parse(raw.slice(raw.indexOf('['))).find((k) => k.type === 'secret')?.api_key;
if (!secret) {
  console.error('Could not find the project secret key (are you logged in to the Supabase CLI?).');
  process.exit(1);
}

// 24 URL-safe characters (~144 bits): far above the project's 10-character minimum.
const password = randomBytes(18).toString('base64url');
const response = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const body = await response.json();
if (!response.ok) {
  console.error(`Failed (${response.status}): ${body.error_code ?? body.code ?? 'unknown error'}`);
  process.exit(1);
}
console.log(`Created a confirmed test account on ${ref}:`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log('Save the password now; it is not stored anywhere else. Sign in with it in the app.');
