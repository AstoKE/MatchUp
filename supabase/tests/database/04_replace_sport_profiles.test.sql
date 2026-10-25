-- replace_my_sport_profiles: atomic add / update / remove of the caller's sport profiles.
-- Every rejection must leave the previous state completely untouched.
begin;
select plan(21);

create function pg_temp.act_as(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal1')::text, true);
  execute format('set local role %I', p_role);
end;
$$;

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a2', 'a@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'b@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000c2', 'c@test.invalid', now(), 'authenticated', 'authenticated', now(), now());

create function pg_temp.sport(p_slug text) returns uuid language sql as
  $$ select id from public.sports where slug = p_slug $$;
create function pg_temp.pos(p_sport text, p_slug text) returns uuid language sql as
  $$ select sp.id from public.sport_positions sp join public.sports s on s.id = sp.sport_id
      where s.slug = p_sport and sp.slug = p_slug $$;
create function pg_temp.slugs(p_user uuid) returns text language sql as
  $$ select coalesce(string_agg(s.slug || ':' || u.self_assessed_level, ',' order by s.slug), '')
       from public.user_sport_profiles u join public.sports s on s.id = u.sport_id where u.user_id = p_user $$;
grant execute on function pg_temp.sport(text), pg_temp.pos(text, text), pg_temp.slugs(uuid) to authenticated;

-- A and B onboard with football; C never onboards.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select public.complete_onboarding(true, 'draft-0.1', 'draft-0.1', false, 'Alice Aa', null, null,
  jsonb_build_array(jsonb_build_object('sport_id', pg_temp.sport('football'), 'level', 3,
    'position_ids', jsonb_build_array(pg_temp.pos('football', 'goalkeeper')))));
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
select public.complete_onboarding(true, 'draft-0.1', 'draft-0.1', false, 'Bob Bb', null, null,
  jsonb_build_array(jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 2, 'position_ids', '[]'::jsonb)));
reset role;

-- ---- who may call it --------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
select throws_ok($$select public.replace_my_sport_profiles('[]'::jsonb)$$, '42501', null, 'guests cannot call it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok($$select public.replace_my_sport_profiles(jsonb_build_array(jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 3)))$$,
  'P0001', 'ONBOARDING_REQUIRED', 'an account that has not onboarded is blocked');
reset role;

-- ---- A: rejections leave everything as it was ---------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.replace_my_sport_profiles('[]'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'an empty list is rejected');
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000a2'), 'football:3.0', 'empty list removed nothing');
select throws_ok($$select public.replace_my_sport_profiles('{}'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'a non-array is rejected');
select throws_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 4),
  jsonb_build_object('sport_id', pg_temp.sport('padel'), 'level', 9)))$$,
  'P0001', 'VALIDATION_FAILED', 'one invalid level rejects the whole request');
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000a2'), 'football:3.0',
  'atomic: the valid first item was NOT stored and football was NOT removed');
select throws_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 4),
  jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 5)))$$,
  'P0001', 'VALIDATION_FAILED', 'the same sport twice is rejected');
select throws_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('football'), 'level', 3,
    'position_ids', jsonb_build_array(pg_temp.pos('basketball', 'center')))))$$,
  'P0001', 'VALIDATION_FAILED', 'a position of another sport is rejected');
select throws_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', 'not-a-uuid', 'level', 3)))$$,
  'P0001', 'VALIDATION_FAILED', 'a malformed sport id is a validation error');
select throws_ok($$select public.replace_my_sport_profiles(
  (select jsonb_agg(jsonb_build_object('sport_id', id, 'level', 3)) from (select id from public.sports union all select gen_random_uuid()) x))$$,
  'P0001', 'VALIDATION_FAILED', 'more than 10 entries is rejected');
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000a2'), 'football:3.0', 'after every rejection the original state is intact');
reset role;

-- ---- A: a valid replacement adds, updates and removes in one go ---------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select lives_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('tennis'), 'level', 4),
  jsonb_build_object('sport_id', pg_temp.sport('basketball'), 'level', 2.5,
    'position_ids', jsonb_build_array(pg_temp.pos('basketball', 'center')))))$$, 'a valid replacement succeeds');
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000a2'), 'basketball:2.5,tennis:4.0',
  'football was removed, tennis and basketball stored with their levels');
select is((select count(*)::int from public.user_sport_positions where user_id = '00000000-0000-4000-8000-0000000000a2'), 1,
  'the removed sport took its positions with it; the new position is stored');
select lives_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('basketball'), 'level', 3,
    'position_ids', jsonb_build_array(pg_temp.pos('basketball', 'point-guard'), pg_temp.pos('basketball', 'center')))))$$,
  'positions can be changed on an existing sport');
select is((select count(*)::int from public.user_sport_positions where user_id = '00000000-0000-4000-8000-0000000000a2'), 2,
  'positions were replaced, not duplicated');
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000a2'), 'basketball:3.0', 'tennis was removed by omission');
select lives_ok($$select public.replace_my_sport_profiles(jsonb_build_array(
  jsonb_build_object('sport_id', pg_temp.sport('basketball'), 'level', 3, 'position_ids', '[]'::jsonb)))$$,
  'the same list can be saved again (idempotent)');
select is((select count(*)::int from public.user_sport_positions where user_id = '00000000-0000-4000-8000-0000000000a2'), 0,
  'omitting positions clears them');
reset role;

-- ---- B is untouched by A's changes -------------------------------------------------------------------------------
select is(pg_temp.slugs('00000000-0000-4000-8000-0000000000b2'), 'tennis:2.0', 'another user''s sport profiles are never touched');

select * from finish();
rollback;
