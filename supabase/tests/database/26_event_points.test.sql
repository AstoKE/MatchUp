-- Phase 4 / M3: the pin, who sees it exactly, what everybody else sees, and distance in search.
begin;
select plan(46);

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000026' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where k = $1; $$;
create function pg_temp.district(slug text) returns uuid language sql as $$
  select id from public.districts where slug = $1 and city_id = (select id from public.cities where slug = 'ankara');
$$;
-- ODTÜ in Çankaya, and a point ~1.1 km east of it.
create function pg_temp.pin() returns jsonb language sql as $$ select '{"lat": 39.8950, "lon": 32.7795}'::jsonb; $$;
create function pg_temp.input(p_title text, p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '10 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'), 'district_id', pg_temp.district('cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12) || p_extra;
$$;
create function pg_temp.km(a jsonb, b jsonb) returns numeric language sql as $$
  select (extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint((a ->> 'lon')::float8, (a ->> 'lat')::float8), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint((b ->> 'lon')::float8, (b ->> 'lat')::float8), 4326)::extensions.geography)
    / 1000)::numeric;
$$;
create function pg_temp.page(p_viewer int, p_event text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  if p_viewer = 0 then perform pg_temp.act_as_anon(); else perform pg_temp.act_as(pg_temp.u(p_viewer)); end if;
  r := public.get_event(pg_temp.ev(p_event));
  reset role;
  return r;
end;
$$;

-- 01 organizer · 02 approved · 03 only asked · 04 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u26-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(),
       created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000026%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000026%';

select pg_temp.act_as(pg_temp.u(1));
insert into ids values
  ('pub', public.create_event(gen_random_uuid(), pg_temp.input('S26 açık', jsonb_build_object('point', pg_temp.pin())), true)),
  ('hid', public.create_event(gen_random_uuid(), pg_temp.input('S26 gizli',
            jsonb_build_object('point', pg_temp.pin(), 'location_visibility', 'APPROVED_ONLY')), true)),
  ('none', public.create_event(gen_random_uuid(), pg_temp.input('S26 iğnesiz', '{}'), true));
select pg_temp.act_as(pg_temp.u(n)), public.request_join(pg_temp.ev('hid')) from unnest(array[2, 3]) n;
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation((select id from public.event_participations
                                      where event_id = pg_temp.ev('hid') and user_id = pg_temp.u(2)));
reset role;

-- ---- what is stored ---------------------------------------------------------------------------------------------------------
select is((select public_point_precision from public.events where id = pg_temp.ev('pub')), 'EXACT', 'a public pin is shown as it is');
select ok((select extensions.st_dwithin(e.public_point, d.exact_point, 0.5) from public.events e
             join public.event_private_details d on d.event_id = e.id where e.id = pg_temp.ev('pub')), 'and equals the pin');
select is((select public_point_precision from public.events where id = pg_temp.ev('hid')), 'APPROXIMATE', 'a hidden pin is snapped');
select ok((select not extensions.st_dwithin(e.public_point, d.exact_point, 1) and extensions.st_dwithin(e.public_point, d.exact_point, 360)
             from public.events e join public.event_private_details d on d.event_id = e.id where e.id = pg_temp.ev('hid')),
          'to the centre of its cell: moved, by at most half the diagonal of a 500 m cell');
select ok((select abs(extensions.st_y(public_point::extensions.geometry) / 0.0045 - 0.5
                      - round(extensions.st_y(public_point::extensions.geometry) / 0.0045 - 0.5)) < 1e-6
             from public.events where id = pg_temp.ev('hid')), 'which is a grid point, the same for every pin in the cell');
select is((select public_point_precision from public.events where id = pg_temp.ev('none')), 'DISTRICT', 'no pin: the district');
select ok((select extensions.st_dwithin(e.public_point, d.centroid, 0.5) from public.events e
             join public.districts d on d.id = e.district_id where e.id = pg_temp.ev('none')), 'at the district centre');

-- ---- who sees what: the hidden event ---------------------------------------------------------------------------------------
select is(pg_temp.page(0, 'hid') -> 'private', 'null'::jsonb, 'a guest gets no private block');
select is(pg_temp.page(0, 'hid') ->> 'public_point_precision', 'APPROXIMATE', 'and the approximate point');
select ok(pg_temp.km(pg_temp.page(0, 'hid') -> 'public_point', pg_temp.pin()) > 0.001, 'which is not the pin');
select is(pg_temp.page(4, 'hid') -> 'private', 'null'::jsonb, 'a stranger: no pin');
select is(pg_temp.page(3, 'hid') -> 'private', 'null'::jsonb, 'someone who only asked: no pin');
select ok(pg_temp.km(pg_temp.page(2, 'hid') -> 'private' -> 'point', pg_temp.pin()) < 0.001, 'an approved player gets the pin');
select ok(pg_temp.km(pg_temp.page(1, 'hid') -> 'private' -> 'point', pg_temp.pin()) < 0.001, 'the organizer too');
select ok(pg_temp.page(4, 'hid')::text !~ '39\.895', 'the exact latitude appears nowhere in a stranger''s page');
select ok(pg_temp.km(pg_temp.page(0, 'pub') -> 'public_point', pg_temp.pin()) < 0.001, 'a public pin is public');

-- The tables themselves: events carries only the public point; the pin's table stays closed.
select pg_temp.act_as(pg_temp.u(4));
select is((select count(*)::int from public.event_private_details where event_id = pg_temp.ev('hid')), 0,
          'a stranger cannot read the pin''s row');
select ok((select not extensions.st_dwithin(public_point, extensions.st_setsrid(extensions.st_makepoint(32.7795, 39.8950), 4326)::extensions.geography, 1)
             from public.events where id = pg_temp.ev('hid')), 'the events row holds the snapped point only');
select pg_temp.act_as(pg_temp.u(2));
select is((select count(*)::int from public.event_private_details where event_id = pg_temp.ev('hid') and exact_point is not null), 1,
          'an approved player can');
reset role;

-- ---- search ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select is((select i ->> 'point_precision' from jsonb_array_elements(public.search_events(
             jsonb_build_object('city_id', (select id from public.cities where slug = 'ankara'), 'limit', 50)) -> 'items') i
            where i ->> 'title' = 'S26 gizli'), 'APPROXIMATE', 'search shows the hidden event approximately');
select ok((select public.search_events(jsonb_build_object('limit', 50))::text !~ '39\.895,'), 'the pin is not in search results');
-- Near the pin: the public one is at 0 m, the hidden one within its cell, the district one ~6 km away.
select is((select array_agg(i ->> 'title' order by n) from jsonb_array_elements(public.search_events(jsonb_build_object(
             'near', pg_temp.pin(), 'sort', 'NEAREST', 'radius_km', 10, 'limit', 50)) -> 'items') with ordinality t(i, n)
            where i ->> 'title' like 'S26%'), array['S26 açık', 'S26 gizli', 'S26 iğnesiz'], 'nearest first');
select is((select (i ->> 'distance_m')::int from jsonb_array_elements(public.search_events(jsonb_build_object(
             'near', pg_temp.pin(), 'sort', 'NEAREST', 'limit', 50)) -> 'items') i where i ->> 'title' = 'S26 açık'), 0,
          'distance to the public pin');
select ok((select bool_and((i ->> 'distance_m')::int % 100 = 0) from jsonb_array_elements(public.search_events(jsonb_build_object(
             'near', pg_temp.pin(), 'limit', 50)) -> 'items') i), 'distances are rounded to 100 m');
select is((select count(*)::int from jsonb_array_elements(public.search_events(jsonb_build_object(
             'near', pg_temp.pin(), 'radius_km', 1, 'limit', 50)) -> 'items') i where i ->> 'title' like 'S26%'), 2,
          'a 1 km radius leaves out the event placed at the district centre');
select ok((select (public.search_events(jsonb_build_object('limit', 50)) -> 'items' -> 0) -> 'distance_m' = 'null'::jsonb),
          'no distance without a point');
-- Paging by distance.
select is((select public.search_events(jsonb_build_object('near', pg_temp.pin(), 'sort', 'NEAREST', 'radius_km', 10,
             'limit', 1)) -> 'items' -> 0 ->> 'title'), 'S26 açık', 'first page');
select is((select public.search_events(jsonb_build_object('near', pg_temp.pin(), 'sort', 'NEAREST', 'radius_km', 10, 'limit', 1),
             public.search_events(jsonb_build_object('near', pg_temp.pin(), 'sort', 'NEAREST', 'radius_km', 10, 'limit', 1))
               -> 'next_cursor') -> 'items' -> 0 ->> 'title'), 'S26 gizli', 'second page continues by distance');
select throws_ok($$select public.search_events('{"radius_km": 5}')$$, 'P0001', 'VALIDATION_FAILED', 'a radius needs a point');
select throws_ok(format($$select public.search_events(%L)$$, jsonb_build_object('near', pg_temp.pin(), 'radius_km', 51)),
                 'P0001', 'VALIDATION_FAILED', 'at most 50 km');
select throws_ok($$select public.search_events('{"sort": "NEAREST"}')$$, 'P0001', 'VALIDATION_FAILED', 'nearest needs a point');
select throws_ok($$select public.search_events('{"near": {"lat": 48.85, "lon": 2.35}}')$$, 'P0001', 'VALIDATION_FAILED',
                 'a point outside Turkey');
select throws_ok($$select public.search_events('{"sort": "LOUDEST"}')$$, 'P0001', 'VALIDATION_FAILED', 'unknown sort');
reset role;

-- ---- input --------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format($$select public.create_event(gen_random_uuid(), %L)$$,
                        pg_temp.input('S26 x', '{"point": {"lat": 38.4189, "lon": 27.1285}}')),
                 'P0001', 'VALIDATION_FAILED', 'a pin in İzmir for a district of Ankara');
select throws_ok(format($$select public.create_event(gen_random_uuid(), %L)$$, pg_temp.input('S26 x', '{"point": {"lat": "kuzey"}}')),
                 'P0001', 'VALIDATION_FAILED', 'a malformed pin');
select throws_ok(format($$select public.create_event(gen_random_uuid(), %L)$$, pg_temp.input('S26 x', '{"point": [39.9, 32.8]}')),
                 'P0001', 'VALIDATION_FAILED', 'a pin that is not an object');
select lives_ok(format($$select public.create_event(gen_random_uuid(), %L)$$, pg_temp.input('S26 x', '{"point": null}')),
                'an explicit null is no pin');

-- ---- editing --------------------------------------------------------------------------------------------------------------
select public.update_event(pg_temp.ev('hid'), '{"title": "S26 gizli maç"}');
reset role;
select ok((select exact_point is not null from public.event_private_details where event_id = pg_temp.ev('hid')),
          'an edit without "point" keeps the pin');
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(2) and type = 'EVENT_CHANGED'), 0,
          'a new title is not a material change');
select pg_temp.act_as(pg_temp.u(1));
select public.update_event(pg_temp.ev('hid'), '{"point": {"lat": 39.8990, "lon": 32.7795}}');
reset role;
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(2) and type = 'EVENT_CHANGED'), 1,
          'moving the pin tells the approved player');
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(3) and type = 'EVENT_CHANGED'), 1,
          'and the one who asked');
select pg_temp.act_as(pg_temp.u(1));
select public.update_event(pg_temp.ev('hid'), jsonb_build_object('district_id', pg_temp.district('yenimahalle')));
reset role;
select is((select public_point_precision from public.events where id = pg_temp.ev('hid')), 'DISTRICT',
          'another district without a new pin drops the old one');
select ok((select exact_point is null from public.event_private_details where event_id = pg_temp.ev('hid')), 'from the private row too');
select pg_temp.act_as(pg_temp.u(1));
select public.update_event(pg_temp.ev('pub'), '{"location_visibility": "APPROVED_ONLY"}');
reset role;
select is((select public_point_precision from public.events where id = pg_temp.ev('pub')), 'APPROXIMATE',
          'hiding the location afterwards snaps the public point');

-- ---- the backfill left the frozen-event guard on ---------------------------------------------------------------------------
select is((select tgenabled::text from pg_trigger where tgname = 'events_before_write' and tgrelid = 'public.events'::regclass), 'O',
          'events_before_write is enabled again after the migration''s backfill');

-- ---- export -----------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select is(jsonb_array_length(public.export_my_data() -> 'event_pins'), 1, 'the organizer''s export holds their pins');
reset role;

select * from finish();
rollback;
