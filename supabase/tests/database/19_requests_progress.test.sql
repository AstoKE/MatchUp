-- Redesign / organizer management: what list_event_requests adds, and who gets it.
begin;
select plan(10);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000019' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev() returns uuid language sql as $$ select v from ids where k = 'e'; $$;
-- The organizer's view of one player's row.
create function pg_temp.row_of(n int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(1));
  select i into v from jsonb_array_elements(public.list_event_requests(pg_temp.ev()) -> 'items') i
   where i ->> 'display_name' = 'Kişi 0' || n;
  reset role;
  return v;
end;
$$;

-- 01 organizer · 02 nothing yet · 03 two signals · 04 three signals, rated · 05 hides everything, still shown · 06 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u19-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 6) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000019%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000019%';
update public.user_settings set show_reliability = false, show_badges = false where user_id = pg_temp.u(5);

insert into public.user_progress (user_id, reliability_score, reliability_samples, reliability_confidence, xp_total) values
  (pg_temp.u(3), 0.45, 2, 0.4, 0),
  (pg_temp.u(4), 0.92, 3, 0.5, 0),
  (pg_temp.u(5), 0.81, 5, 0.6, 0);
insert into public.user_sport_ratings (user_id, sport_id, rating, confidence, sample_events) values
  (pg_temp.u(4), pg_temp.football(), 3.40, 0.5, 2),
  (pg_temp.u(5), (select id from public.sports where slug = 'tennis'), 4.10, 0.5, 2);

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('e', public.create_event(gen_random_uuid(), jsonb_build_object(
  'sport_id', pg_temp.football(),
  'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
  'title', 'S19', 'starts_at', (now() + interval '270 days')::text, 'duration_minutes', 90,
  'city_id', (select id from public.cities where slug = 'ankara'),
  'district_id', (select id from public.districts where slug = 'cankaya'),
  'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12), true));
select pg_temp.act_as(pg_temp.u(n)), public.request_join(pg_temp.ev()) from unnest(array[2, 3, 4, 5]) n;
reset role;

select is(pg_temp.row_of(2) -> 'reliability', 'null'::jsonb, 'no history: no reliability');
select is(pg_temp.row_of(2) -> 'rating', 'null'::jsonb, 'no reviews: no rating');
select is(pg_temp.row_of(3) -> 'reliability', 'null'::jsonb, 'two signals are below the honest threshold, even at 45 %');
select is((pg_temp.row_of(4) ->> 'reliability')::numeric, 0.92000, 'from three signals on it is shown');
select is((pg_temp.row_of(4) ->> 'rating')::numeric, 3.40, 'the rating in this event''s sport');
select is(pg_temp.row_of(5) -> 'rating', 'null'::jsonb, 'a rating in another sport does not count');
select is((pg_temp.row_of(5) ->> 'reliability')::numeric, 0.81000, 'organizers see it whatever the profile flags say (RATING_SYSTEM §9)');
select ok(pg_temp.row_of(4)::text !~ 'xp|confidence|samples', 'nothing else about the player leaves');

select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.list_event_requests(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'a player cannot read the list');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok($$select public.list_event_requests(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'neither can a stranger');

select * from finish();
rollback;
