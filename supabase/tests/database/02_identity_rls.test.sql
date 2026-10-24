-- Behavioral RLS / RPC tests for the identity baseline, including negative authorization paths.
begin;
select plan(38);

-- ---- helpers (pg_temp: vanish with the transaction) ----------------------------------------
create function pg_temp.act_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal1')::text,
    true
  );
  execute format('set local role %I', p_role);
end;
$$;

-- ---- fixtures (as superuser) -------------------------------------------------------------
-- A: verified, B: verified, C: UNverified email, D: verified but suspended
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000000a', 'a@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-00000000000b', 'b@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-00000000000c', 'c@test.invalid', null,  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-00000000000d', 'd@test.invalid', now(), 'authenticated', 'authenticated', now(), now());

update public.profiles set account_status = 'SUSPENDED' where id = '00000000-0000-4000-8000-00000000000d';
insert into public.user_consents (user_id, kind, version)
  values ('00000000-0000-4000-8000-00000000000b', 'TERMS', 'v1');

-- test-only wrapper so we can exercise the private guard through an RPC-like entry point
create function public.zz_probe_guard() returns uuid
language sql security definer set search_path = '' as $$ select private.assert_active_verified_user() $$;
-- Same rule as every real function: explicit revoke, then a minimal grant (never rely on default ACLs).
revoke all on function public.zz_probe_guard() from public, anon, authenticated;
grant execute on function public.zz_probe_guard() to authenticated;

-- ---- bootstrap trigger -------------------------------------------------------------------
select is((select count(*)::int from public.profiles where id in (
  '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')), 2,
  'signing up creates a profile row');
select is((select count(*)::int from public.user_settings where user_id in (
  '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')), 2,
  'signing up creates a settings row');
select is((select profile_visibility::text from public.user_settings
  where user_id = '00000000-0000-4000-8000-00000000000a'), 'EVENT_PEERS',
  'privacy by default: profile visibility is EVENT_PEERS');
select is((select account_status::text from public.profiles
  where id = '00000000-0000-4000-8000-00000000000a'), 'ACTIVE', 'new accounts are ACTIVE');

-- ---- authenticated user A: reads --------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');

select is((select count(*)::int from public.profiles), 1, 'A sees exactly one profile (their own)');
select is((select id from public.profiles), '00000000-0000-4000-8000-00000000000a'::uuid, 'A sees their own profile');
select is((select count(*)::int from public.user_settings), 1, 'A sees only their own settings');
select is((select count(*)::int from public.user_consents), 0, 'A cannot see B''s consent records');
select is((select count(*)::int from public.platform_admins), 0, 'non-admin sees no admin rows');
select cmp_ok((select count(*)::int from public.app_config), '>=', 1, 'A can read public app_config');

-- ---- A: negative paths (privilege escalation / tampering) ----------------------------------------
select throws_ok($$update public.profiles set display_name = 'hacked' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A cannot update even their own profile directly (writes go through RPCs)');
select throws_ok($$update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A cannot change account_status');
select throws_ok($$update public.profiles set display_name = 'x' where id = '00000000-0000-4000-8000-00000000000b'$$,
  '42501', null, 'A cannot update B''s profile');
select throws_ok($$delete from public.profiles where id = '00000000-0000-4000-8000-00000000000b'$$,
  '42501', null, 'A cannot delete B''s profile');
select throws_ok($$insert into public.profiles (id) values (gen_random_uuid())$$,
  '42501', null, 'A cannot insert profiles');
select throws_ok($$insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'A cannot grant themselves admin');
select throws_ok($$update public.user_settings set profile_visibility = 'EVERYONE' where user_id = '00000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'A cannot write settings directly');
select throws_ok($$insert into public.user_consents (user_id, kind, version) values ('00000000-0000-4000-8000-00000000000a', 'TERMS', 'v9')$$,
  '42501', null, 'A cannot forge consent records');
select throws_ok($$update public.app_config set value = '"9.9.9"' where key = 'min_supported_app_version'$$,
  '42501', null, 'A cannot change app_config');
select throws_ok($$insert into public.app_config (key, value) values ('evil', 'true')$$,
  '42501', null, 'A cannot add app_config');
select throws_ok($$select private.handle_new_user()$$,
  '42501', null, 'A cannot call the bootstrap trigger function');

-- ---- A: RPCs ---------------------------------------------------------------------------------
select is((select count(*)::int from public.get_my_account()), 1, 'get_my_account returns one row for A');
select is((select email_verified from public.get_my_account()), true, 'A is email-verified');
select is((select is_admin from public.get_my_account()), false, 'A is not an admin');
select is((select public.zz_probe_guard()), '00000000-0000-4000-8000-00000000000a'::uuid,
  'guard passes for an active, verified user');
reset role;

-- ---- unverified user C ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
select is((select email_verified from public.get_my_account()), false, 'C is reported as not verified');
select throws_ok($$select public.zz_probe_guard()$$, 'P0001', 'EMAIL_NOT_VERIFIED',
  'guard blocks unverified email (create/join must fail server-side)');
reset role;

-- ---- suspended user D ------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-00000000000d');
select throws_ok($$select public.zz_probe_guard()$$, 'P0001', 'ACCOUNT_RESTRICTED',
  'guard blocks suspended accounts');
reset role;

-- ---- guest (anon) ------------------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
select cmp_ok((select count(*)::int from public.app_config), '>=', 1, 'guests can read public config');
select throws_ok($$select * from public.profiles$$, '42501', null, 'guests cannot read profiles');
select throws_ok($$select * from public.user_settings$$, '42501', null, 'guests cannot read settings');
select throws_ok($$select * from public.get_my_account()$$, '42501', null, 'guests cannot call get_my_account');
select throws_ok($$select public.zz_probe_guard()$$, '42501', null, 'guests cannot call the guard wrapper');
reset role;

-- ---- authenticated role without a subject must fail the guard ---------------------------------
select pg_temp.act_as(null, 'authenticated');
select throws_ok($$select * from public.get_my_account()$$, 'P0001', 'NOT_AUTHENTICATED',
  'a token without a subject is NOT_AUTHENTICATED');
reset role;

-- ---- admin ------------------------------------------------------------------------------------------------
insert into public.platform_admins (user_id, granted_by)
  values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b');
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select is((select is_admin from public.get_my_account()), true, 'a user listed in platform_admins is admin');
select cmp_ok((select count(*)::int from public.profiles), '>=', 4, 'admin can read all profiles');
reset role;

-- revoked admin loses access
update public.platform_admins set revoked_at = now() where user_id = '00000000-0000-4000-8000-00000000000b';
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select is((select is_admin from public.get_my_account()), false, 'revoked admin is no longer admin');
reset role;

-- ---- data integrity ---------------------------------------------------------------------------------------------
select throws_ok($$update public.profiles set account_status = 'PENDING_DELETION' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'PENDING_DELETION requires deletion_requested_at (check constraint)');

select * from finish();
rollback;
