-- Phase 6 / M3: who can see a player card, and what the player's settings hide from it.
begin;
select plan(23);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000022' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev() returns uuid language sql as $$ select v from ids where k = 'e'; $$;
create function pg_temp.part(n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev() and user_id = pg_temp.u(n);
$$;
create function pg_temp.card(p_viewer int, p_target int) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(p_viewer));
  r := public.get_player_card(pg_temp.u(p_target));
  reset role;
  return r;
end;
$$;

-- 01 organizer · 02 and 03 approved · 04 only asked · 05 stranger · 06 public profile · 07 hides everything · 08 blocks 02
-- · 09 suspended
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u22-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now(), bio = 'Merhaba'
 where id::text like '00000000-0000-4000-8000-0000000022%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000022%';
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(6);
update public.user_settings set show_reliability = false, show_badges = false where user_id = pg_temp.u(7);
insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level) values (pg_temp.u(3), pg_temp.football(), 3.5);
insert into public.user_sport_ratings (user_id, sport_id, rating, confidence, sample_events) values (pg_temp.u(3), pg_temp.football(), 4.20, 0.5, 2);
insert into public.user_progress (user_id, reliability_score, reliability_samples, reliability_confidence, xp_total) values
  (pg_temp.u(2), 0.5, 2, 0.4, 100), (pg_temp.u(3), 0.92, 3, 0.5, 130), (pg_temp.u(7), 0.8, 9, 0.7, 500);

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('e', public.create_event(gen_random_uuid(), jsonb_build_object(
  'sport_id', pg_temp.football(),
  'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
  'title', 'S22', 'starts_at', (now() + interval '295 days')::text, 'duration_minutes', 90,
  'city_id', (select id from public.cities where slug = 'ankara'),
  'district_id', (select id from public.districts where slug = 'cankaya'),
  'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12), true));
select pg_temp.act_as(pg_temp.u(n)), public.request_join(pg_temp.ev()) from unnest(array[2, 3, 4, 7, 8]) n;
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part(n)) from unnest(array[2, 3, 7, 8]) n;
reset role;
insert into public.user_achievements (user_id, code) values (pg_temp.u(3), 'FIRST_MATCH'), (pg_temp.u(7), 'FIRST_MATCH');
insert into public.user_achievements (user_id, code, revoked_at) values (pg_temp.u(3), 'FAIR_PLAY', now());

select function_privs_are('public', 'get_player_card', array['uuid'], 'anon', array[]::text[], 'guests may not call it');
select function_privs_are('public', 'get_player_card', array['uuid'], 'authenticated', array['EXECUTE'], 'signed-in users may');
select function_privs_are('private', 'is_event_peer', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'the check is internal');

-- ---- who sees it --------------------------------------------------------------------------------------------------------
select is(pg_temp.card(2, 3) ->> 'display_name', 'Kişi 03', 'a fellow approved player');
select is(pg_temp.card(1, 4) ->> 'display_name', 'Kişi 04', 'the organizer sees someone who only asked');
select is(pg_temp.card(4, 1) ->> 'display_name', 'Kişi 01', 'and they see the organizer');
select is(pg_temp.card(5, 6) ->> 'display_name', 'Kişi 06', 'a stranger sees a public profile');
select is(pg_temp.card(3, 3) ->> 'is_me', 'true', 'my own, marked as mine');
select pg_temp.act_as(pg_temp.u(5));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(3)), 'P0001', 'NOT_FOUND', 'a stranger sees no private profile');
select throws_ok($$select public.get_player_card(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'the same as someone who does not exist');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(3)), 'P0001', 'NOT_FOUND', 'two people who only asked have not met');
reset role;

-- ---- blocked and suspended --------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(8));
select public.block_user(pg_temp.u(2));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(2)), 'P0001', 'NOT_FOUND', 'the blocker cannot open it');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(8)), 'P0001', 'NOT_FOUND', 'nor can the blocked person');
reset role;
-- Public, so that only the account status can be what refuses it.
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(9);
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(9);
select pg_temp.act_as(pg_temp.u(6));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(9)), 'P0001', 'NOT_FOUND', 'a suspended account has no card');
reset role;

-- ---- what it shows ---------------------------------------------------------------------------------------------------------
select is((pg_temp.card(2, 3) ->> 'reliability')::numeric, 0.92000, 'reliability from three signals');
select is(pg_temp.card(3, 2) -> 'reliability', 'null'::jsonb, 'not below three, even when shown');
select is((pg_temp.card(2, 3) -> 'sports' -> 0 ->> 'rating')::numeric, 4.20, 'the rating per sport');
select is(pg_temp.card(2, 3) ->> 'xp_total', '130', 'the XP, for a level');
select is(jsonb_array_length(pg_temp.card(2, 3) -> 'badges'), 1, 'badges, without a revoked one');
select is(pg_temp.card(2, 7) -> 'reliability', 'null'::jsonb, 'show_reliability off hides it');
select is(jsonb_array_length(pg_temp.card(2, 7) -> 'badges'), 0, 'show_badges off hides badges');
select is(pg_temp.card(2, 7) -> 'xp_total', 'null'::jsonb, 'and the XP');
select ok(pg_temp.card(2, 3)::text !~ 'email|account_status|city_id|confidence', 'nothing else about the player leaves');

select * from finish();
rollback;
