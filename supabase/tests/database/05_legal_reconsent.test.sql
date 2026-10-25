-- Re-consent gate: onboarded users must hold an unrevoked acceptance of the CURRENT legal versions
-- before any write RPC; accept_current_legal_terms records it. Negative paths first-class.
begin;
select plan(27);

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

-- R: onboarded with the current versions · N: never onboarded · U: unverified email · O: other onboarded user
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000005a1', 'r@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000005b1', 'n@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000005c1', 'u@test.invalid', null,  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000005d1', 'o@test.invalid', now(), 'authenticated', 'authenticated', now(), now());
update public.profiles
   set display_name = 'Test User', adult_confirmed_at = now(), onboarded_at = now()
 where id in ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005d1');
insert into public.user_consents (user_id, kind, version)
select u.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from (values ('00000000-0000-4000-8000-0000000005a1'::uuid), ('00000000-0000-4000-8000-0000000005d1'::uuid)) u(id)
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key);

-- ---- grants ---------------------------------------------------------------------------------------------
select function_privs_are('public', 'accept_current_legal_terms', array['text', 'text'], 'anon', array[]::text[],
  'guests cannot accept legal terms');
select function_privs_are('public', 'accept_current_legal_terms', array['text', 'text'], 'authenticated', array['EXECUTE'],
  'signed-in users may call accept_current_legal_terms');
select function_privs_are('private', 'legal_consent_current', array['uuid'], 'authenticated', array[]::text[],
  'the consent check is not callable from the API');
select is((select prosecdef from pg_proc where oid = 'public.accept_current_legal_terms(text,text)'::regprocedure),
  true, 'accept_current_legal_terms is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.accept_current_legal_terms(text,text)'::regprocedure),
  'accept_current_legal_terms pins an empty search_path');

-- ---- current versions: the gate is open -----------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000005a1');
select lives_ok($$select private.assert_onboarded_user()$$, 'consent for the current versions passes the gate');
select is((select legal_consent_current from public.get_my_account()), true, 'get_my_account reports consent as current');
reset role;

-- ---- new legal versions are published -------------------------------------------------------------------
update public.app_config set value = '"1.0"'::jsonb where key in ('legal.terms_version', 'legal.privacy_version');

select pg_temp.act_as('00000000-0000-4000-8000-0000000005a1');
select is((select legal_consent_current from public.get_my_account()), false, 'after a version bump consent is outdated');
select is((select onboarded from public.get_my_account()), true, 'the user stays onboarded (no second onboarding)');
select throws_ok($$select private.assert_onboarded_user()$$, 'P0001', 'CONSENT_REQUIRED',
  'the gate blocks an outdated consent');
select throws_ok($$select public.set_marketing_consent(true)$$, 'P0001', 'CONSENT_REQUIRED',
  'write RPCs are blocked until re-consent');
select throws_ok($$select public.update_my_profile('New Name', null, null, null)$$, 'P0001', 'CONSENT_REQUIRED',
  'profile edits are blocked until re-consent');

-- wrong versions are rejected and record nothing
select throws_ok($$select public.accept_current_legal_terms('draft-0.1', 'draft-0.1')$$, 'P0001', 'CONSENT_VERSION_MISMATCH',
  'accepting the old versions is rejected');
select throws_ok($$select public.accept_current_legal_terms('1.0', null)$$, 'P0001', 'CONSENT_VERSION_MISMATCH',
  'a missing version is rejected');
select throws_ok($$select public.accept_current_legal_terms('1.0', 'draft-0.1')$$, 'P0001', 'CONSENT_VERSION_MISMATCH',
  'a half-current pair is rejected');
reset role;
select is((select count(*)::int from public.user_consents
           where user_id = '00000000-0000-4000-8000-0000000005a1' and version = '1.0'), 0,
  'rejected attempts record nothing');

-- the right versions are accepted, idempotently
select pg_temp.act_as('00000000-0000-4000-8000-0000000005a1');
select lives_ok($$select public.accept_current_legal_terms('1.0', '1.0')$$, 'accepting the current versions works');
select lives_ok($$select public.accept_current_legal_terms('1.0', '1.0')$$, 'accepting again is idempotent');
select is((select legal_consent_current from public.get_my_account()), true, 'consent is current again');
select lives_ok($$select public.set_marketing_consent(false)$$, 'write RPCs work again after re-consent');
reset role;
select is((select count(*)::int from public.user_consents
           where user_id = '00000000-0000-4000-8000-0000000005a1' and version = '1.0'), 2,
  'exactly one TERMS and one PRIVACY_NOTICE row for the new version');
select is((select count(*)::int from public.user_consents
           where user_id = '00000000-0000-4000-8000-0000000005a1' and version = 'draft-0.1'), 2,
  'the earlier acceptance is kept as evidence');
select is((select count(*)::int from public.user_consents
           where user_id = '00000000-0000-4000-8000-0000000005d1' and version = '1.0'), 0,
  'another user''s consent is never written');

-- ---- who may not re-consent -------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000005b1');
select throws_ok($$select public.accept_current_legal_terms('1.0', '1.0')$$, 'P0001', 'ONBOARDING_REQUIRED',
  'users who never onboarded must go through onboarding (18+ included)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000005c1');
select throws_ok($$select public.accept_current_legal_terms('1.0', '1.0')$$, 'P0001', 'EMAIL_NOT_VERIFIED',
  'unverified users cannot accept');
reset role;

-- ---- a revoked acceptance does not count; missing configuration fails closed ------------------------------
update public.user_consents set revoked_at = now()
 where user_id = '00000000-0000-4000-8000-0000000005a1' and kind = 'PRIVACY_NOTICE' and version = '1.0';
select is(private.legal_consent_current('00000000-0000-4000-8000-0000000005a1'), false,
  'a revoked acceptance is not current');
update public.user_consents set revoked_at = null
 where user_id = '00000000-0000-4000-8000-0000000005a1' and kind = 'PRIVACY_NOTICE' and version = '1.0';
delete from public.app_config where key = 'legal.privacy_version';
select is(private.legal_consent_current('00000000-0000-4000-8000-0000000005a1'), false,
  'without configured versions nobody counts as current (fail closed)');

select * from finish();
rollback;
