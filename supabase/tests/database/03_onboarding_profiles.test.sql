-- Phase 2: reference catalog, onboarding gate (18+ / versioned consent), profile + sport-profile RPCs,
-- and who may see whose profile. Negative authorization paths come first-class (SECURITY §3, ADR-0013).
begin;
select plan(89);

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

-- Users: A (will onboard), B (never onboards), C (unverified email), S (suspended), V (viewer, onboarded)
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000c1', 'c@test.invalid', null,  'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000d1', 's@test.invalid', now(), 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000e1', 'v@test.invalid', now(), 'authenticated', 'authenticated', now(), now());
update public.profiles set account_status = 'SUSPENDED' where id = '00000000-0000-4000-8000-0000000000d1';

-- A thin wrapper so each negative case varies exactly one argument. Runs as the caller (SECURITY INVOKER).
create function pg_temp.onboard(
  p_adult boolean default true,
  p_terms text default 'draft-0.1',
  p_privacy text default 'draft-0.1',
  p_marketing boolean default false,
  p_name text default 'Ayşe Yılmaz',
  p_city text default 'ankara',          -- 'ankara' | 'none' (null) | 'random' (unknown uuid)
  p_district text default 'cankaya',     -- 'cankaya' | 'none' (null) | 'random'
  p_sports jsonb default null
) returns void language sql as $$
  select public.complete_onboarding(
    p_adult, p_terms, p_privacy, p_marketing, p_name,
    case p_city when 'none' then null when 'random' then gen_random_uuid()
      else (select id from public.cities where slug = p_city) end,
    case p_district when 'none' then null when 'random' then gen_random_uuid()
      else (select d.id from public.districts d join public.cities c on c.id = d.city_id
            where c.slug = 'ankara' and d.slug = p_district) end,
    coalesce(p_sports, jsonb_build_array(jsonb_build_object(
      'sport_id', (select id from public.sports where slug = 'football'), 'level', 3.5,
      'position_ids', jsonb_build_array((select sp.id from public.sport_positions sp
        join public.sports s on s.id = sp.sport_id where s.slug = 'football' and sp.slug = 'goalkeeper'))))));
$$;
grant execute on function pg_temp.onboard(boolean, text, text, boolean, text, text, text, jsonb) to authenticated;

-- ======================= reference catalog =======================
select is((select count(*)::int from public.sports), 10, 'catalog: 10 sports');
select is((select count(*)::int from public.districts d join public.cities c on c.id = d.city_id where c.slug = 'ankara'), 25,
  'catalog: Ankara has 25 districts');
select is((select count(*)::int from public.sport_formats where default_capacity not between min_participants and max_participants), 0,
  'catalog: every format default lies within its bounds');
select is((select count(*)::int from public.sports where not (names ? 'tr' and names ? 'en')), 0, 'catalog: every sport is named in tr and en');

select pg_temp.act_as(null, 'anon');
select is((select count(*)::int from public.sports), 10, 'guests can read the sports catalog (ADR-0013)');
select cmp_ok((select count(*)::int from public.districts), '>=', 25, 'guests can read districts');
select throws_ok($$update public.sports set slug = 'hacked' where slug = 'football'$$, '42501', null, 'guests cannot modify the catalog');
select throws_ok($$insert into public.cities (slug, names, timezone, country_code) values ('x', '{"tr":"x","en":"x"}', 'UTC', 'TR')$$,
  '42501', null, 'guests cannot add cities');
select throws_ok($$select public.complete_onboarding(true, 'draft-0.1', 'draft-0.1', false, 'Zed Zed', null, null, '[]'::jsonb)$$,
  '42501', null, 'guests cannot call complete_onboarding');
select throws_ok($$select public.update_my_profile('Zed Zed', null, null, null)$$, '42501', null, 'guests cannot call update_my_profile');
reset role;

update public.sports set is_active = false where slug = 'walking';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is((select count(*)::int from public.sports where slug = 'walking'), 0, 'inactive sports are hidden from the API');
select throws_ok($$update public.sports set slug = 'hacked' where slug = 'football'$$, '42501', null, 'signed-in users cannot modify the catalog');
reset role;
update public.sports set is_active = true where slug = 'walking';

-- ======================= gate: nobody onboarded yet =======================
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is((select adult_confirmed from public.get_my_account()), false, 'B starts without 18+ confirmation');
select is((select onboarded from public.get_my_account()), false, 'B starts not onboarded');
select throws_ok($$select public.update_my_profile('Bora Bora', null, null, null)$$, 'P0001', 'ONBOARDING_REQUIRED',
  'update_my_profile is blocked until onboarding');
select throws_ok($$select public.update_my_settings('tr', 'light', 'EVERYONE', true, true)$$, 'P0001', 'ONBOARDING_REQUIRED',
  'update_my_settings is blocked until onboarding');
select throws_ok($$select public.set_marketing_consent(true)$$, 'P0001', 'ONBOARDING_REQUIRED',
  'set_marketing_consent is blocked until onboarding');
select throws_ok($$select public.set_sport_profile((select id from public.sports where slug = 'tennis'), 3, '{}')$$,
  'P0001', 'ONBOARDING_REQUIRED', 'set_sport_profile is blocked until onboarding');
select throws_ok($$select public.remove_sport_profile((select id from public.sports where slug = 'tennis'))$$,
  'P0001', 'ONBOARDING_REQUIRED', 'remove_sport_profile is blocked until onboarding');

-- ======================= complete_onboarding: rejections (each leaves NOTHING behind) =======================
select throws_ok($$select pg_temp.onboard(p_adult := false)$$, 'P0001', 'ADULT_CONFIRMATION_REQUIRED', 'under-18 / unconfirmed is rejected');
select throws_ok($$select pg_temp.onboard(p_adult := null)$$, 'P0001', 'ADULT_CONFIRMATION_REQUIRED', 'a null confirmation is rejected');
select throws_ok($$select pg_temp.onboard(p_terms := 'draft-0.0')$$, 'P0001', 'CONSENT_VERSION_MISMATCH', 'stale terms version is rejected');
select throws_ok($$select pg_temp.onboard(p_privacy := 'v999')$$, 'P0001', 'CONSENT_VERSION_MISMATCH', 'unknown privacy version is rejected');
select throws_ok($$select pg_temp.onboard(p_terms := null)$$, 'P0001', 'CONSENT_VERSION_MISMATCH', 'a missing terms version is rejected');
select throws_ok($$select pg_temp.onboard(p_name := 'A')$$, 'P0001', 'VALIDATION_FAILED', 'one-character name is rejected');
select throws_ok($$select pg_temp.onboard(p_name := '   ')$$, 'P0001', 'VALIDATION_FAILED', 'blank name is rejected');
select throws_ok($$select pg_temp.onboard(p_name := repeat('x', 41))$$, 'P0001', 'VALIDATION_FAILED', 'over-long name is rejected');
select throws_ok($$select pg_temp.onboard(p_name := E'Ali\u0007Veli')$$, 'P0001', 'VALIDATION_FAILED', 'control characters in the name are rejected');
select throws_ok($$select pg_temp.onboard(p_city := 'random')$$, 'P0001', 'VALIDATION_FAILED', 'unknown city is rejected');
select throws_ok($$select pg_temp.onboard(p_city := 'none')$$, 'P0001', 'VALIDATION_FAILED', 'a district without a city is rejected');
select throws_ok($$select pg_temp.onboard(p_district := 'random')$$, 'P0001', 'VALIDATION_FAILED', 'unknown district is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := '[]'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'at least one sport is required');
select throws_ok($$select pg_temp.onboard(p_sports := '{}'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'sports must be an array');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', (select id from public.sports where slug = 'tennis'), 'level', 3),
  jsonb_build_object('sport_id', (select id from public.sports where slug = 'tennis'), 'level', 4)))$$,
  'P0001', 'VALIDATION_FAILED', 'the same sport twice is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', (select id from public.sports where slug = 'tennis'), 'level', 0.5)))$$,
  'P0001', 'VALIDATION_FAILED', 'level below 1 is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', (select id from public.sports where slug = 'tennis'), 'level', 5.5)))$$,
  'P0001', 'VALIDATION_FAILED', 'level above 5 is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', (select id from public.sports where slug = 'tennis'), 'level', 3.3)))$$,
  'P0001', 'VALIDATION_FAILED', 'levels move in half steps only');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', 'not-a-uuid', 'level', 3)))$$,
  'P0001', 'VALIDATION_FAILED', 'a malformed sport id is a validation error, not a crash');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(
  jsonb_build_object('sport_id', gen_random_uuid(), 'level', 3)))$$,
  'P0001', 'VALIDATION_FAILED', 'an unknown sport is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(jsonb_build_object(
  'sport_id', (select id from public.sports where slug = 'football'), 'level', 3,
  'position_ids', jsonb_build_array((select sp.id from public.sport_positions sp
    join public.sports s on s.id = sp.sport_id where s.slug = 'basketball' and sp.slug = 'center')))))$$,
  'P0001', 'VALIDATION_FAILED', 'a position of ANOTHER sport is rejected');
select throws_ok($$select pg_temp.onboard(p_sports := jsonb_build_array(jsonb_build_object(
  'sport_id', (select id from public.sports where slug = 'football'), 'level', 3,
  'position_ids', (select jsonb_agg(sp.id) from public.sport_positions sp
    join public.sports s on s.id = sp.sport_id where s.slug = 'football'))))$$,
  'P0001', 'VALIDATION_FAILED', 'more than 3 positions is rejected');

select is((select onboarded from public.get_my_account()), false, 'after all rejections B is still not onboarded');
select is((select count(*)::int from public.user_consents), 0, 'rejected onboarding recorded no consent (atomic)');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000000b1'), 0, 'rejected onboarding stored no sport profile (atomic)');
reset role;

-- unverified email cannot onboard
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok($$select pg_temp.onboard()$$, 'P0001', 'EMAIL_NOT_VERIFIED', 'an unverified email cannot onboard');
reset role;
-- suspended account cannot onboard
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select throws_ok($$select pg_temp.onboard()$$, 'P0001', 'ACCOUNT_RESTRICTED', 'a suspended account cannot onboard');
reset role;

-- ======================= complete_onboarding: success =======================
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select pg_temp.onboard()$$, 'a valid onboarding succeeds');
select is((select onboarded from public.get_my_account()), true, 'A is onboarded');
select is((select adult_confirmed from public.get_my_account()), true, 'A has the 18+ confirmation');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 'Ayşe Yılmaz',
  'the display name (Turkish characters) is stored');
select is((select count(*)::int from public.user_consents where kind in ('TERMS', 'PRIVACY_NOTICE')), 2,
  'the owner can read their own consent evidence');
reset role;
select is((select count(*)::int from public.user_consents where user_id = '00000000-0000-4000-8000-0000000000a1'
  and kind in ('TERMS', 'PRIVACY_NOTICE') and version = 'draft-0.1' and revoked_at is null), 2,
  'terms and privacy consent are recorded with the accepted version');
select is((select count(*)::int from public.user_consents where user_id = '00000000-0000-4000-8000-0000000000a1' and kind = 'MARKETING'), 0,
  'marketing consent is NOT bundled: not granted unless explicitly asked');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'the sport profile is stored');
select is((select count(*)::int from public.user_sport_positions where user_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'the position is stored');

-- idempotent: a second call keeps the first confirmation timestamp
create temp table first_adult as
  select adult_confirmed_at from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select pg_temp.onboard(p_name := 'Ayşe Y.', p_marketing := true)$$, 'onboarding can be repeated (idempotent)');
reset role;
select is((select adult_confirmed_at from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  (select adult_confirmed_at from first_adult), 'the original 18+ confirmation time is preserved');
select is((select count(*)::int from public.user_consents where user_id = '00000000-0000-4000-8000-0000000000a1' and kind = 'MARKETING' and revoked_at is null), 1,
  'marketing consent is recorded only when explicitly granted');
select isnt((select marketing_consent_at from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000a1'), null,
  'the settings row mirrors the marketing consent time');

-- ======================= profile / settings / sport-profile RPCs =======================
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$select public.update_my_profile('Ayşe', repeat('x', 281), null, null)$$, 'P0001', 'VALIDATION_FAILED', 'a bio over 280 characters is rejected');
select throws_ok($$select public.update_my_profile('Ayşe', E'hi\u0001', null, null)$$, 'P0001', 'VALIDATION_FAILED', 'control characters in the bio are rejected');
select lives_ok($$select public.update_my_profile('Ayşe Yılmaz', '  Hafta sonları halı saha.  ', null, null)$$, 'a valid profile update succeeds');
select is((select bio from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 'Hafta sonları halı saha.', 'the bio is trimmed');
select is((select city_id from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), null::uuid, 'the location can be cleared (optional)');
select throws_ok($$select public.update_my_settings('de', 'light', 'EVERYONE', true, true)$$, 'P0001', 'VALIDATION_FAILED', 'an unsupported locale is rejected');
select throws_ok($$select public.update_my_settings('tr', 'neon', 'EVERYONE', true, true)$$, 'P0001', 'VALIDATION_FAILED', 'an unsupported theme is rejected');
select throws_ok($$select public.update_my_settings('tr', 'dark', null, true, true)$$, 'P0001', 'VALIDATION_FAILED', 'a null visibility is rejected');
select lives_ok($$select public.update_my_settings('en', 'dark', 'EVERYONE', false, true)$$, 'valid settings are stored');
select is((select locale from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000a1'), 'en', 'the locale choice is stored server-side');

select lives_ok($$select public.set_sport_profile((select id from public.sports where slug = 'basketball'), 2.5, '{}')$$, 'adding a second sport succeeds');
select throws_ok($$select public.set_sport_profile((select id from public.sports where slug = 'basketball'), 2.5,
  array[(select sp.id from public.sport_positions sp join public.sports s on s.id = sp.sport_id where s.slug = 'volleyball' and sp.slug = 'libero')])$$,
  'P0001', 'VALIDATION_FAILED', 'set_sport_profile also rejects another sport''s position');
select lives_ok($$select public.remove_sport_profile((select id from public.sports where slug = 'basketball'))$$, 'a sport profile can be removed');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000000a1'), 1, 'only the football profile remains');
select lives_ok($$select public.set_marketing_consent(false)$$, 'marketing consent can be withdrawn');
select is((select marketing_consent_at from public.user_settings), null, 'withdrawal clears the settings timestamp');
reset role;
select isnt((select revoked_at from public.user_consents where user_id = '00000000-0000-4000-8000-0000000000a1' and kind = 'MARKETING'), null,
  'withdrawal keeps the evidence and sets revoked_at');

-- ======================= visibility: who sees whose profile =======================
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$select pg_temp.onboard(p_name := 'Viewer Vee')$$, 'the viewer onboards');
reset role;

-- A chose EVERYONE above (update_my_settings): viewer can see A, and A's sports
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 'Ayşe Yılmaz',
  'an EVERYONE profile is visible to other signed-in users');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'the sport profile of a visible user is visible');
select throws_ok($$select account_status from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501', null,
  'moderation state is not a readable column for API users');
select throws_ok($$select onboarded_at from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501', null,
  'onboarding timestamps are not a readable column for API users');
select is((select count(*)::int from public.user_settings where user_id = '00000000-0000-4000-8000-0000000000a1'), 0,
  'other people''s settings stay private');
reset role;

update public.user_settings set profile_visibility = 'EVENT_PEERS' where user_id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 0,
  'an EVENT_PEERS profile is hidden from strangers (privacy by default)');
select is((select count(*)::int from public.user_sport_profiles where user_id = '00000000-0000-4000-8000-0000000000a1'), 0,
  'and so is its sport profile');
reset role;

update public.user_settings set profile_visibility = 'EVERYONE' where user_id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set account_status = 'SUSPENDED' where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 0,
  'a suspended account disappears from other users'' view');
reset role;
update public.profiles set account_status = 'ACTIVE' where id = '00000000-0000-4000-8000-0000000000a1';

-- ======================= direct writes stay impossible =======================
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level)
  values ('00000000-0000-4000-8000-0000000000a1', (select id from public.sports where slug = 'tennis'), 3)$$,
  '42501', null, 'users cannot insert sport profiles directly');
select throws_ok($$update public.user_sport_profiles set self_assessed_level = 5$$, '42501', null, 'users cannot edit sport levels directly');
select throws_ok($$update public.profiles set onboarded_at = null$$, '42501', null, 'users cannot reset onboarding directly');
select throws_ok($$insert into public.user_consents (user_id, kind, version) values ('00000000-0000-4000-8000-0000000000a1', 'TERMS', 'forged')$$,
  '42501', null, 'users cannot forge consent evidence');
reset role;

select * from finish();
rollback;
