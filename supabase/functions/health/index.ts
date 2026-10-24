// Liveness/readiness probe (Deno / Supabase Edge Functions).
//
// Security notes:
//  * Public by design (verify_jwt = false in config.toml) but returns no data — only status + latency.
//  * Uses the project's ANON key, never the service-role key: it can read exactly what a guest can,
//    so a bug here cannot become a privileged-data leak.
//  * Never echoes internal error details (they go to the function logs, which contain no secrets).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const PROBE_TIMEOUT_MS = 3000;

type DbState = 'ok' | 'error';

async function checkDatabase(): Promise<DbState> {
  if (!SUPABASE_URL || !ANON_KEY) return 'error';
  try {
    // A guest-readable table: exercises API gateway -> PostgREST -> Postgres.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_config?select=key&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok ? 'ok' : 'error';
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        module: 'health',
        code: 'DB_PROBE_FAILED',
        name: (error as Error).name,
      }),
    );
    return 'error';
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const started = performance.now();
  const db = await checkDatabase();
  const body = {
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    latencyMs: Math.round(performance.now() - started),
  };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status: db === 'ok' ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
});
