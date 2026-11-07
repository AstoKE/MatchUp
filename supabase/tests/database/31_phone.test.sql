-- Phase 8: phone verification (ADR-0029). The switch is flipped inside this transaction only.
begin;
select plan(11);

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000031' || lpad(n::text, 2, '0'))::uuid;
$$;

-- 01 no phone · 02 verified Turkish mobile · 03 verified foreign number · 04 Turkish number, not confirmed
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u31-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update auth.users set phone = '905550031002', phone_confirmed_at = now() where id = pg_temp.u(2);
update auth.users set phone = '447700900123', phone_confirmed_at = now() where id = pg_temp.u(3);
update auth.users set phone = '905550031004' where id = pg_temp.u(4);
update public.profiles set display_name = 'Kişi', adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000031%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000031%';

select is((select (value #>> '{}')::boolean from public.app_config where key = 'phone.required'), false,
  'the requirement starts off (hosted has no SMS provider yet)');

select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$ select private.assert_onboarded_user() $$, 'switched off, no phone is needed');
reset role;

update public.app_config set value = 'true'::jsonb where key = 'phone.required';
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$ select private.assert_onboarded_user() $$, 'P0001', 'PHONE_NOT_VERIFIED', 'switched on, no phone: refused');
select is((select phone_required from public.get_my_account()), true, 'the account says a phone is required');
select is((select phone_verified from public.get_my_account()), false, '... and that it has none');
reset role;
select pg_temp.act_as(pg_temp.u(2));
select lives_ok($$ select private.assert_onboarded_user() $$, 'a confirmed +90 5xx number passes');
select is((select phone_verified from public.get_my_account()), true, 'and the account says so');
reset role;
select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$ select private.assert_onboarded_user() $$, 'P0001', 'PHONE_NOT_VERIFIED', 'a foreign number does not count');
reset role;
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$ select private.assert_onboarded_user() $$, 'P0001', 'PHONE_NOT_VERIFIED', 'an unconfirmed number does not count');
-- Browsing stays open: reading a published event needs no phone.
select lives_ok($$ select public.search_events('{"limit": 1}'::jsonb) $$, 'browsing still works without a phone');
reset role;

select ok(not has_function_privilege('anon', 'public.get_my_account()', 'execute'), 'guests have no account to read');

select * from finish();
rollback;
