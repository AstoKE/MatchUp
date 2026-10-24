import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface Stack {
  apiUrl: string;
  anonKey: string;
  /** TEST-ONLY. Used to create fixtures through the Auth admin API. Never reaches any client bundle. */
  serviceRoleKey: string;
  dbUrl: string;
  mailpitUrl: string;
}

const repoRoot = resolve(import.meta.dirname, '../../..');
const ENV_KEY = 'MATCHUP_TEST_STACK';

/** Refuse anything that is not the local developer stack: these tests create and delete users. */
export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to run integration tests against non-local host "${host}"`);
  }
}

export function loadStackFromCli(): Stack {
  const raw = execSync('pnpm exec supabase status -o json', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
  const stack: Stack = {
    apiUrl: status.API_URL ?? '',
    anonKey: status.ANON_KEY ?? '',
    serviceRoleKey: status.SERVICE_ROLE_KEY ?? '',
    dbUrl: status.DB_URL ?? '',
    mailpitUrl: status.MAILPIT_URL ?? status.INBUCKET_URL ?? '',
  };
  if (Object.values(stack).some((value) => !value)) {
    throw new Error(
      'Incomplete `supabase status` output. Is the local stack running (pnpm db:start)?',
    );
  }
  assertLocal(stack.apiUrl);
  assertLocal(stack.dbUrl);
  return stack;
}

/** global-setup stores the stack in the environment so workers do not shell out repeatedly. */
export function publishStack(stack: Stack): void {
  process.env[ENV_KEY] = JSON.stringify(stack);
}

export function getStack(): Stack {
  const cached = process.env[ENV_KEY];
  if (!cached) throw new Error('Stack not initialized (global-setup did not run)');
  return JSON.parse(cached) as Stack;
}
