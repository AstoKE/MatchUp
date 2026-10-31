-- Account deletion (request / cancel / 30-day purge) and personal-data export (ADR-0017).
-- Negative paths first-class: stale re-authentication, guests, suspended users, other users' data.
begin;
select plan(47);

-- Signs in as p_uid with a password entered p_auth_age ago (the `amr` claim Supabase puts in tokens).
create function pg_temp.act_as(p_uid uuid, p_auth_age interval default interval '1 minute',
                               p_method text default 'password')
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_uid, 'role', 'authenticated', 'aal', 'aal1',
      'amr', json_build_array(json_build_object(
        'method', p_method, 'timestamp', extract(epoch from now() - p_auth_age)::bigint))
    )::text,
    true
  );
  set local role authenticated;
end;
$$;
create function pg_temp.act_as_without_amr(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;

-- R: will delete · O: other user · S: suspended · V: viewer
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000006a1', 'r6@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000006b1', 'o6@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000006c1', 's6@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000006d1', 'v6@test.invalid', now(), 'authenticated', 'authenticated', now(), now());
update public.profiles
   set display_name = 'Silinecek Kişi', bio = 'kişisel bir not', adult_confirmed_at = now(), onboarded_at = now(),
       city_id = (select id from public.cities where slug = 'ankara'),
       district_id = (select id from public.districts where slug = 'cankaya')
 where id = '00000000-0000-4000-8000-0000000006a1';
update public.profiles
   set display_name = 'Kalan Kişi', adult_confirmed_at = now(), onboarded_at = now()
 where id in ('00000000-0000-4000-8000-0000000006b1', '00000000-0000-4000-8000-0000000006d1');
update public.profiles set account_status = 'SUSPENDED' where id = '00000000-0000-4000-8000-0000000006c1';
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = '00000000-0000-4000-8000-0000000006a1';
insert into public.user_consents (user_id, kind, version)
select u.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from (values ('00000000-0000-4000-8000-0000000006a1'::uuid), ('00000000-0000-4000-8000-0000000006b1'::uuid),
               ('00000000-0000-4000-8000-0000000006d1'::uuid)) u(id)
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key);
insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level)
select u.id, (select id from public.sports where slug = 'football'), 3.0
  from (values ('00000000-0000-4000-8000-0000000006a1'::uuid), ('00000000-0000-4000-8000-0000000006b1'::uuid)) u(id);
insert into public.user_sport_positions (user_id, sport_id, position_id)
select '00000000-0000-4000-8000-0000000006a1', s.id, p.id
  from public.sports s join public.sport_positions p on p.sport_id = s.id
 where s.slug = 'football' and p.slug = 'goalkeeper';

-- ---- grants: only the self-service RPCs are callable, and only when signed in --------------------------
select function_privs_are('public', 'request_account_deletion', array[]::text[], 'anon', array[]::text[],
  'guests cannot request deletion');
select function_privs_are('public', 'request_account_deletion', array[]::text[], 'authenticated', array['EXECUTE'],
  'signed-in users may request deletion');
select function_privs_are('public', 'cancel_account_deletion', array[]::text[], 'anon', array[]::text[],
  'guests cannot cancel deletion');
select function_privs_are('public', 'export_my_data', array[]::text[], 'anon', array[]::text[],
  'guests cannot export');
select function_privs_are('private', 'purge_account', array['uuid'], 'authenticated', array[]::text[],
  'nobody but the owner/cron can purge');
select function_privs_are('private', 'process_deletion_queue', array[]::text[], 'authenticated', array[]::text[],
  'nobody but the owner/cron can run the queue');
select table_privs_are('private', 'audit_logs', 'authenticated', array[]::text[], 'users cannot read or write the audit log');
select table_privs_are('private', 'audit_logs', 'anon', array[]::text[], 'guests cannot read or write the audit log');
select is((select count(*)::int from cron.job where jobname = 'process-deletion-queue'), 1,
  'the purge runs on a daily schedule');

-- ---- inventory: every table holding per-user data must be handled by export AND purge ------------------
-- If this fails, a new table references users: add it to export_my_data and purge_account, then here.
select is(
  (select array_agg(distinct t order by t) from (
     select c.table_name::text as t from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'user_id'
     union
     select tc.table_name::text from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_schema = 'public' and ccu.table_name = 'profiles') x),
  -- events/event_participations: kept as history linked to the tombstone (free text removed);
  -- notifications: deleted; all three exported (private.export_event_data / purge_event_data).
  -- skill_reviews (Phase 5): exported as reviews_written; kept as history linked to the tombstone (no free text,
  -- other players' ratings are built on it); attendance_disputes has no user column: its reason is nulled on purge.
  -- reliability_events, xp_transactions, user_progress (Phase 5): exported; kept as anonymous history linked to the
  -- tombstone (no free text, no identifier left once the profile is anonymized; counsel to confirm, SECURITY §8).
  array['event_participations', 'events', 'notifications', 'platform_admins', 'reliability_events', 'skill_reviews',
        'user_consents', 'user_progress', 'user_settings', 'user_sport_positions', 'user_sport_profiles',
        'xp_transactions'],
  'per-user tables are exactly the ones export_my_data and purge_account handle'
);

-- ---- re-authentication is required, and stale sessions are refused ------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', interval '15 minutes');
select throws_ok($$select public.request_account_deletion()$$, 'P0001', 'REAUTH_REQUIRED',
  'a password entered 15 minutes ago is not enough');
select pg_temp.act_as_without_amr('00000000-0000-4000-8000-0000000006a1');
select throws_ok($$select public.request_account_deletion()$$, 'P0001', 'REAUTH_REQUIRED',
  'a token without amr is refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', interval '1 minute', 'otp');
select throws_ok($$select public.request_account_deletion()$$, 'P0001', 'REAUTH_REQUIRED',
  'only a password re-entry counts');
reset role;
select is((select account_status::text from public.profiles where id = '00000000-0000-4000-8000-0000000006a1'),
  'ACTIVE', 'refused requests change nothing');

-- ---- request ------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1');
select ok(public.request_account_deletion() between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour',
  'a fresh request is accepted and due in 30 days');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', interval '1 hour');
select is(public.request_account_deletion(), (select deletion_due_at from public.get_my_account()),
  'a repeated request is idempotent and keeps the original schedule');
select is((select account_status::text from public.get_my_account()), 'PENDING_DELETION', 'the account is pending deletion');
select isnt((select deletion_due_at from public.get_my_account()), null, 'get_my_account reports when it is due');
select throws_ok($$select public.set_marketing_consent(true)$$, 'P0001', 'ACCOUNT_RESTRICTED',
  'a pending account cannot write');
select pg_temp.act_as('00000000-0000-4000-8000-0000000006d1');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000006a1'), 0,
  'a pending account is hidden from others even though it was public');
reset role;
select is((select count(*)::int from private.audit_logs
           where target_id = '00000000-0000-4000-8000-0000000006a1' and action = 'ACCOUNT_DELETION_REQUESTED'), 1,
  'exactly one audit entry for the request');

-- ---- cancel -------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1', interval '2 hours');
select lives_ok($$select public.cancel_account_deletion()$$, 'cancelling needs no re-authentication');
select lives_ok($$select public.cancel_account_deletion()$$, 'cancelling an active account is a no-op');
reset role;
select is((select array[account_status::text, coalesce(deletion_requested_at::text, 'null')]
           from public.profiles where id = '00000000-0000-4000-8000-0000000006a1'),
  array['ACTIVE', 'null'], 'the account is active again');
select is((select count(*)::int from private.audit_logs
           where target_id = '00000000-0000-4000-8000-0000000006a1' and action = 'ACCOUNT_DELETION_CANCELED'), 1,
  'exactly one audit entry for the cancellation');

-- ---- who may not ------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006c1');
select throws_ok($$select public.request_account_deletion()$$, 'P0001', 'ACCOUNT_RESTRICTED',
  'a suspended account cannot self-delete (support path, open question for counsel)');
select throws_ok($$select public.cancel_account_deletion()$$, 'P0001', 'INVALID_TRANSITION',
  'a suspended account cannot be "cancelled" back to active');
select pg_temp.act_as_anon();
select throws_ok($$select public.request_account_deletion()$$, '42501', null, 'guests cannot call it at all');
select throws_ok($$select public.export_my_data()$$, '42501', null, 'guests cannot export');
reset role;

-- ---- purge --------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006a1');
select public.request_account_deletion();
reset role;
select is(private.purge_account('00000000-0000-4000-8000-0000000006a1'), false,
  'nothing is purged before the 30-day grace period ends');
update public.profiles set deletion_requested_at = now() - interval '31 days'
 where id = '00000000-0000-4000-8000-0000000006a1';
select is(private.process_deletion_queue(), 1, 'the daily job purges the due account');
select is(
  (select array[account_status::text, coalesce(display_name, '∅'), coalesce(bio, '∅'),
                coalesce(city_id::text, '∅'), coalesce(district_id::text, '∅')]
     from public.profiles where id = '00000000-0000-4000-8000-0000000006a1'),
  array['DELETED', '∅', '∅', '∅', '∅'],
  'the profile is an anonymous tombstone');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000006a1'), 0,
  'the auth user (email, sessions, identities) is gone');
select is((select count(*)::int from public.user_settings where user_id = '00000000-0000-4000-8000-0000000006a1'), 0,
  'settings are deleted');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000006a1')
        + (select count(*)::int from public.user_sport_positions where user_id = '00000000-0000-4000-8000-0000000006a1'), 0,
  'sport profiles and positions are deleted');
select is((select count(*)::int from public.user_consents where user_id = '00000000-0000-4000-8000-0000000006a1'), 2,
  'consent evidence (version + time) stays with the tombstone (counsel to confirm)');
select is((select count(*)::int from private.audit_logs
           where target_id = '00000000-0000-4000-8000-0000000006a1' and action = 'ACCOUNT_PURGED' and actor_id is null), 1,
  'the purge is audited as a system action');
select is(private.process_deletion_queue(), 0, 'running the job again does nothing');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000006b1'), 'Kalan Kişi',
  'other users are untouched');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000006b1'), 1,
  'other users keep their sport profiles');

-- ---- export -------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000006b1', interval '3 hours');
create temp table export_result as select public.export_my_data() as doc;
select ok((select doc ?& array['format', 'format_version', 'generated_at', 'account', 'profile', 'settings',
                                'sport_profiles', 'consents'] from export_result),
  'the export has every section');
select is((select array[doc #>> '{account,user_id}', doc #>> '{account,email}', doc #>> '{profile,display_name}']
             from export_result),
  array['00000000-0000-4000-8000-0000000006b1', 'o6@test.invalid', 'Kalan Kişi'],
  'the export is the caller''s own account and profile');
select is((select jsonb_array_length(doc -> 'sport_profiles') + jsonb_array_length(doc -> 'consents') from export_result), 3,
  'the export contains exactly the caller''s sport profile and two consents');
select ok((select doc::text not like '%r6@test.invalid%' and doc::text not like '%v6@test.invalid%' from export_result),
  'no other user''s data appears in the export');
select throws_ok($$select public.export_my_data()$$, 'P0001', 'RATE_LIMITED', 'a second export within 24 hours is refused');
reset role;
select is((select count(*)::int from private.audit_logs
           where actor_id = '00000000-0000-4000-8000-0000000006b1' and action = 'DATA_EXPORTED'), 1,
  'the export is audited once');
select throws_ok($$update private.audit_logs set action = 'DATA_EXPORTED'$$, '42501', null,
  'the audit log is append-only, even for the owner role');

select * from finish();
rollback;
