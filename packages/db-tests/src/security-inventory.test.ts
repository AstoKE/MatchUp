import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from './helpers';

/**
 * Phase 7 / M2 (security review). The database's whole API surface, written down and reviewed once: every function in
 * `public` and `private` (who may execute it, whether it runs as its owner, what guard it starts with) and every table
 * (RLS, policies, what the API roles may do). A change to any of it fails here until the snapshot is regenerated, which
 * puts the change in the diff of the PR for a person to review against docs/SECURITY_REVIEW.md.
 *
 *   UPDATE_SECURITY_INVENTORY=1 pnpm --filter @matchup/db-tests exec vitest run src/security-inventory.test.ts
 */
const SNAPSHOT = fileURLToPath(
  new URL('../../../supabase/security/inventory.json', import.meta.url),
);

afterAll(closeDb);

interface FunctionRow {
  fn: string;
  definer: boolean;
  search_path_empty: boolean;
  anon: boolean;
  authenticated: boolean;
  guard: string;
}
interface TableRow {
  table: string;
  rls: boolean;
  policies: string[];
  anon: string[];
  authenticated: string[];
}

async function inventory() {
  const functions = await db().query<FunctionRow>(`
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
           p.prosecdef as definer,
           coalesce('search_path=""' = any (p.proconfig), false) as search_path_empty,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
           coalesce(substring(pg_get_functiondef(p.oid) from
             '(private\\.assert_admin_aal2|private\\.assert_onboarded_user|private\\.assert_active_verified_user|auth\\.uid\\(\\))'),
             'none') as guard
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1`);
  const tables = await db().query<TableRow>(`
    select n.nspname || '.' || c.relname as table,
           c.relrowsecurity as rls,
           coalesce((select array_agg(pol.polname || ' ' || pol.polcmd::text || ' ' ||
                       coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
                                  where r.oid = any (pol.polroles)), 'public')
                       || case when pol.polpermissive then '' else ' restrictive' end order by pol.polname)
                       from pg_policy pol where pol.polrelid = c.oid), '{}') as policies,
           array(select g.privilege_type::text from information_schema.role_table_grants g
                  where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee = 'anon'
                  order by 1) as anon,
           array(select g.privilege_type::text from information_schema.role_table_grants g
                  where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee = 'authenticated'
                  order by 1) as authenticated
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm', 'p')
     order by 1`);
  return { functions: functions.rows, tables: tables.rows };
}

describe('the database API surface', () => {
  it('matches the reviewed inventory (supabase/security/inventory.json)', async () => {
    const live = await inventory();
    const text = `${JSON.stringify(live, null, 2)}\n`;
    if (process.env.UPDATE_SECURITY_INVENTORY === '1') writeFileSync(SNAPSHOT, text);
    const reviewed = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as typeof live;
    expect(live).toEqual(reviewed);
  });

  it('keeps the invariants the review relies on', async () => {
    const { functions, tables } = await inventory();
    // Every function that runs as its owner pins its search path.
    expect(functions.filter((f) => f.definer && !f.search_path_empty).map((f) => f.fn)).toEqual([]);
    // Nothing in private is callable by guests.
    expect(functions.filter((f) => f.fn.startsWith('private.') && f.anon).map((f) => f.fn)).toEqual(
      [],
    );
    // Every owner-run public function a member can call starts from a guard, except the reviewed guest reads.
    const guestReads = ['public.get_event(', 'public.search_events(', 'public.search_venues('];
    expect(
      functions
        .filter(
          (f) => f.fn.startsWith('public.') && f.definer && f.authenticated && f.guard === 'none',
        )
        .map((f) => f.fn)
        .filter((fn) => !guestReads.some((g) => fn.startsWith(g))),
    ).toEqual([]);
    // Every table has RLS, and the API roles can never write a table directly.
    expect(
      tables.filter((t) => !t.rls && !t.table.startsWith('private.')).map((t) => t.table),
    ).toEqual([]);
    const writes = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
    expect(
      tables
        .filter((t) => [...t.anon, ...t.authenticated].some((p) => writes.includes(p)))
        .map((t) => t.table),
    ).toEqual([]);
  });
});
