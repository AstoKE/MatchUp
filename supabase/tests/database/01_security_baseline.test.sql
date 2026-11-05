-- Structural security guarantees that must hold for EVERY migration, now and in later phases.
-- (SECURITY.md §4, S-19). A new table/function that violates these fails CI.
begin;
select plan(10);

-- 1. RLS on every table in public
select is(
  (select count(*)::int from pg_catalog.pg_tables t where t.schemaname = 'public' and not t.rowsecurity),
  0,
  'every table in schema public has row level security enabled'
);

-- 2. API roles never hold write-ish privileges on any public table
select is(
  (select count(*)::int
   from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0,
  'anon/authenticated have no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on public tables'
);

-- 3. Guests (anon) may read only public operational config and the reference catalog (ADR-0013).
--    Adding anything here is a deliberate, reviewed decision — never a side effect.
select is(
  (select coalesce(array_agg(g.table_name || ':' || g.privilege_type order by g.table_name), '{}')
   from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'anon'),
  array[
    'app_config:SELECT', 'cities:SELECT', 'districts:SELECT', 'events:SELECT',
    'sport_formats:SELECT', 'sport_positions:SELECT', 'sports:SELECT'
  ],
  'anon may only SELECT app_config, the reference catalog and (published public rows of) events — guest discovery, ADR-0013'
);

-- 4. No table/sequence in public is granted to PUBLIC
select is(
  (select count(*)::int
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'S', 'p') and a.grantee = 0),
  0,
  'no public relation is granted to PUBLIC'
);

-- 5. Every SECURITY DEFINER function pins an empty search_path
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
       where cfg ~ '^search_path=("")?$'
     )),
  0,
  'every SECURITY DEFINER function in public/private sets search_path to empty'
);

-- 6. No function in public/private is executable by PUBLIC (default EXECUTE must be revoked)
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname in ('public', 'private')
     and a.grantee = 0
     and a.privilege_type = 'EXECUTE'),
  0,
  'no function in public/private is executable by PUBLIC'
);

-- 7. anon can execute only the explicit guest-readable whitelist (search_events since Phase 3 / M3)
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by p.proname), '{}')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  -- catalog_places (Phase 4) is security invoker over the catalog tables guests could already read.
  array['public.catalog_places', 'public.get_event', 'public.search_events']::text[],
  'anon can execute only the guest whitelist: catalog_places, get_event and search_events (D-09)'
);

-- 8. Admin helper is not usable by anon, usable by authenticated policies
select ok(
  not has_function_privilege('anon', 'private.is_admin()', 'EXECUTE')
    and has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE'),
  'private.is_admin(): anon denied, authenticated allowed (for policy evaluation)'
);

-- 9. The private schema holds no tables reachable by API roles
select is(
  (select count(*)::int
   from information_schema.role_table_grants g
   where g.table_schema = 'private' and g.grantee in ('anon', 'authenticated', 'PUBLIC')),
  0,
  'no table in schema private is granted to API roles'
);

-- 10. Profiles deliberately have no foreign key to auth.users (ADR-0003: tombstones survive auth deletion)
select is(
  (select count(*)::int
   from pg_catalog.pg_constraint c
   where c.conrelid = 'public.profiles'::regclass
     and c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass),
  0,
  'public.profiles has no FK to auth.users (ADR-0003)'
);

select * from finish();
rollback;
