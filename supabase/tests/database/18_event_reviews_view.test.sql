-- Phase 5 / M5b: who may read what through get_event_reviews; no score ever leaves it.
begin;
select plan(20);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000018' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev(k text default 'e') returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(n int, k text default 'e') returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.view(n int, k text default 'e') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(n));
  v := public.get_event_reviews(pg_temp.ev(k));
  reset role;
  return v;
end;
$$;
create function pg_temp.input(p_title text, p_plays boolean default true) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '260 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 10, 'organizer_plays', p_plays);
$$;

-- 01 organizer · 02, 03 present · 04 absent · 05 stranger · 06 organizer who does not play · 07 organizer with one player
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u18-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 7) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000018%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000018%';

create function pg_temp.played(p_key text, p_org int, p_players int[], p_absent int[], p_plays boolean default true) returns void
language plpgsql as $$
declare n int;
begin
  perform pg_temp.act_as(pg_temp.u(p_org));
  insert into ids values (p_key, public.create_event(gen_random_uuid(), pg_temp.input('S18 ' || p_key, p_plays), true));
  foreach n in array p_players || p_absent loop
    perform pg_temp.act_as(pg_temp.u(n));
    perform public.request_join(pg_temp.ev(p_key));
    perform pg_temp.act_as(pg_temp.u(p_org));
    perform public.approve_participation(pg_temp.part(n, p_key));
  end loop;
  reset role;
  update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.ev(p_key);
  perform pg_temp.act_as(pg_temp.u(p_org));
  foreach n in array p_players loop
    perform public.mark_attendance(pg_temp.part(n, p_key), 'PRESENT');
  end loop;
  foreach n in array p_absent loop
    perform public.mark_attendance(pg_temp.part(n, p_key), 'ABSENT');
  end loop;
  reset role;
end;
$$;

select function_privs_are('public', 'get_event_reviews', array['uuid'], 'anon', array[]::text[], 'guests may not call it');
select function_privs_are('public', 'get_event_reviews', array['uuid'], 'authenticated', array['EXECUTE'], 'signed-in users may');

select pg_temp.played('e', 1, array[2, 3], array[4]);
select is(pg_temp.view(2) ->> 'can_review', 'false', 'before finalization nobody may review');
select is(jsonb_array_length(pg_temp.view(2) -> 'targets'), 0, 'and no names are listed');

select pg_temp.act_as(pg_temp.u(1));
select public.finalize_attendance(pg_temp.ev());
reset role;

select is(pg_temp.view(2) ->> 'window_open', 'true', 'a present player: the window is open');
select is((select array_agg(t ->> 'user_id' order by t ->> 'user_id') from jsonb_array_elements(pg_temp.view(2) -> 'targets') t),
          array[pg_temp.u(1)::text, pg_temp.u(3)::text], 'others present, the organizer included; not themselves, not the absent');
select is(pg_temp.view(1) ->> 'can_review', 'true', 'the organizer with two players may review');
select is(pg_temp.view(4) ->> 'can_review', 'false', 'an absent player may not');
select is(jsonb_array_length(pg_temp.view(4) -> 'targets'), 0, 'and sees no names');

select pg_temp.act_as(pg_temp.u(5));
select throws_ok($$select public.get_event_reviews(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'a stranger reads nothing');
reset role;

-- The screen and the authority agree: submit, then see it marked, without the score.
select pg_temp.act_as(pg_temp.u(2));
select public.submit_reviews(pg_temp.ev(), jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(3), 'skill_score', 5, 'fair_play', true)));
reset role;
select is((select t ->> 'reviewed' from jsonb_array_elements(pg_temp.view(2) -> 'targets') t where t ->> 'user_id' = pg_temp.u(3)::text), 'true', 'a submitted review shows as done');
select is((select t ->> 'reviewed' from jsonb_array_elements(pg_temp.view(2) -> 'targets') t where t ->> 'user_id' = pg_temp.u(1)::text), 'false', 'the other does not');
select is((select t ->> 'reviewed' from jsonb_array_elements(pg_temp.view(3) -> 'targets') t where t ->> 'user_id' = pg_temp.u(2)::text), 'false',
  'the reviewee cannot tell they were reviewed');
select ok(pg_temp.view(2)::text !~ 'skill_score|fair_play', 'no score leaves the function');

select private.close_review_windows(now() + interval '73 hours');
select is(pg_temp.view(2) ->> 'window_open', 'false', 'a closed window shows closed, even before the clock says so');
select is(pg_temp.view(2) ->> 'can_review', 'true', 'the player still was eligible');

-- Organizers: not playing, or too few others.
select pg_temp.played('np', 6, array[2, 3], array[]::int[], false);
select pg_temp.act_as(pg_temp.u(6));
select public.finalize_attendance(pg_temp.ev('np'));
reset role;
select is(pg_temp.view(6, 'np') ->> 'can_review', 'false', 'an organizer who did not play has nothing to review');
select pg_temp.played('one', 7, array[2], array[]::int[]);
select pg_temp.act_as(pg_temp.u(7));
select public.finalize_attendance(pg_temp.ev('one'));
reset role;
select is(pg_temp.view(7, 'one') ->> 'can_review', 'false', 'an organizer with one player earns no review rights');
select is(pg_temp.view(2, 'one') ->> 'can_review', 'true', 'the player may review them');
select is(jsonb_array_length(pg_temp.view(2, 'one') -> 'targets'), 1, 'only the organizer is listed');

select * from finish();
rollback;
