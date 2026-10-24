import { loadStackFromCli, publishStack } from './stack';

export default async function setup() {
  const stack = loadStackFromCli();
  const health = await fetch(`${stack.apiUrl}/auth/v1/health`, {
    headers: { apikey: stack.anonKey },
  }).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      'Local Supabase Auth is not reachable. Start the stack first: pnpm db:start (requires Docker).',
    );
  }
  publishStack(stack);
}
