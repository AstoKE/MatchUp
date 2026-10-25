// Creates an email-confirmed TEST account on the linked HOSTED project (public sign-up stays disabled).
//   node scripts/hosted-create-test-user.mjs you@example.com
// A random password is generated and printed once, in YOUR terminal only: store it in a password manager
// and never paste it into chats, issues or commits. The project's secret key is fetched with the
// Supabase CLI (your `supabase login`), used in memory for this one call and never written or printed.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// process.exitCode instead of process.exit(): exiting right after fetch() trips a libuv assertion on
// Windows ("handle->flags & UV_HANDLE_CLOSING").
async function main() {
  const email = process.argv[2];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('usage: node scripts/hosted-create-test-user.mjs <email>');
    return 2;
  }

  let ref;
  try {
    ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  } catch {
    console.error('No linked project. Run: pnpm exec supabase link --project-ref <ref>');
    return 1;
  }

  // Without --reveal the CLI returns secret keys masked.
  const raw = execSync(
    `pnpm exec supabase projects api-keys --project-ref ${ref} --reveal -o json`,
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  const secret = JSON.parse(raw.slice(raw.indexOf('['))).find((k) => k.type === 'secret')?.api_key;
  if (!secret || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) {
    console.error(
      'Could not read the project secret key (are you logged in to the Supabase CLI?).',
    );
    return 1;
  }

  // 24 URL-safe characters (~144 bits): far above the project's 10-character minimum.
  const password = randomBytes(18).toString('base64url');
  // sb_secret_ keys are not JWTs: they go in the apikey header only, never as a Bearer token.
  const response = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secret, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `Failed (${response.status}): ${body.error_code ?? body.code ?? 'unknown error'} ${body.msg ?? ''}`,
    );
    return 1;
  }
  console.log(`Created a confirmed test account on ${ref}:`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('Save the password now; it is not stored anywhere else. Sign in with it in the app.');
  return 0;
}

process.exitCode = await main();
