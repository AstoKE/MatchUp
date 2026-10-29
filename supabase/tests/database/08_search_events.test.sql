-- Phase 3 / M3: guest-readable discovery (search_events). Negative paths first: drafts, invite-only events,
-- hidden places and closed accounts must never be listed; malformed filters are VALIDATION_FAILED.
-- Assertions are scoped to this file's fixtures (titles start with "S8 ") so leftover rows do not matter.
begin;
select plan(45);

create function pg_temp.act_as(p_uid uuid)
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

-- `p_time` o'clock in Istanbul, `p_days` days from today plus 200: far beyond anything a person or another
-- test plans (publishing allows a year ahead), so paging assertions never meet foreign events.
create function pg_temp.local_ts(p_days int, p_time text)
returns timestamptz language sql as $$
  select ((date_trunc('day', now() at time zone 'Europe/Istanbul') + make_interval(days => p_days + 200)) + p_time::time)
         at time zone 'Europe/Istanbul';
$$;

create function pg_temp.input(p_title text, p_days int, p_time text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title,
    'starts_at', pg_temp.local_ts(p_days, p_time)::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 12) || p_over;
$$;

create function pg_temp.tennis(p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'tennis'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'tennis' and f.slug = 'singles'),
    'capacity', 2) || p_over;
$$;

-- Only this file's events, in listing order.
create function pg_temp.titles(p_filters jsonb, p_cursor jsonb default null)
returns text[] language sql as $$
  select coalesce(array_agg(t.i ->> 'title' order by t.n), array[]::text[])
    from jsonb_array_elements(public.search_events(p_filters, p_cursor) -> 'items') with ordinality t(i, n)
   where t.i ->> 'title' like 'S8 %';
$$;

-- The fixtures lie 3..9 days after the 200-day offset: a window keeps other data out of paging assertions.
create function pg_temp.win(p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('from', pg_temp.local_ts(2, '00:00'), 'to', pg_temp.local_ts(8, '00:00')) || p_over;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

-- A, B organizers · C organizer whose account is closed later · D plain participant
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select ('00000000-0000-4000-8000-0000000008' || lpad(n::text, 2, '0'))::uuid, 'u8-' || n || '@test.invalid',
       now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = case id::text
    when '00000000-0000-4000-8000-000000000801' then 'Ayşe A'
    when '00000000-0000-4000-8000-000000000802' then 'Berk B'
    when '00000000-0000-4000-8000-000000000803' then 'Ceren C'
    else 'Deniz D' end,
  adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000008%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000008%';

-- ---- grants and function hygiene ---------------------------------------------------------------------------
select function_privs_are('public', 'search_events', array['jsonb', 'jsonb'], 'anon', array['EXECUTE'],
  'guests may call search_events (D-09)');
select function_privs_are('public', 'search_events', array['jsonb', 'jsonb'], 'authenticated', array['EXECUTE'],
  'signed-in users may call search_events');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.search_events(jsonb, jsonb)'::regprocedure),
  'search_events is SECURITY DEFINER with an empty search_path and a statement timeout');

-- ---- fixtures ------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
insert into ids values ('evening', public.create_event(gen_random_uuid(), pg_temp.input('S8 Akşam futbol', 3, '19:30', '{"setting": "OUTDOOR"}'), true));
insert into ids values ('afternoon', public.create_event(gen_random_uuid(),
  pg_temp.input('S8 Öğle futbol', 5, '14:00',
    jsonb_build_object('district_id', (select id from public.districts where slug = 'yenimahalle'))), true));
insert into ids values ('invite', public.create_event(gen_random_uuid(),
  pg_temp.input('S8 Davetli', 3, '20:00', '{"visibility": "INVITE_ONLY"}'), true));
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S8 Taslak', 3, '21:00'), false));

select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
insert into ids values ('morning', public.create_event(gen_random_uuid(),
  pg_temp.input('S8 Sabah tenis', 4, '09:00', pg_temp.tennis(
    '{"location_visibility": "APPROVED_ONLY", "skill_min": 3, "skill_max": 4, "address_text": "Gizli sokak 5"}')), true));
insert into ids values ('full', public.create_event(gen_random_uuid(),
  pg_temp.input('S8 Dolu tenis', 6, '10:00', pg_temp.tennis()), true));

insert into ids values ('regclosed', public.create_event(gen_random_uuid(),
  pg_temp.input('S8 Kayıt kapalı', 9, '12:00', jsonb_build_object('registration_closes_at', (now() - interval '1 hour')::text)), true));

select pg_temp.act_as('00000000-0000-4000-8000-000000000803');
insert into ids values ('closed', public.create_event(gen_random_uuid(), pg_temp.input('S8 Kapanan hesap', 3, '18:00'), true));

reset role;
-- Fill the last tennis slot (the organizer holds the first) and close C's account.
insert into public.event_participations (event_id, user_id, status)
values ((select v from ids where k = 'full'), '00000000-0000-4000-8000-000000000804', 'REQUESTED');
update public.event_participations set status = 'APPROVED', approved_at = now()
 where event_id = (select v from ids where k = 'full') and user_id = '00000000-0000-4000-8000-000000000804';
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now()
 where id = '00000000-0000-4000-8000-000000000803';
select is((select approved_count from public.events where id = (select v from ids where k = 'full')), 2::smallint,
  'fixture: the tennis event is full');

-- ---- what guests may list ---------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select is(pg_temp.titles(pg_temp.win()),
  array['S8 Akşam futbol', 'S8 Sabah tenis', 'S8 Öğle futbol', 'S8 Dolu tenis'],
  'guests list published public events by start time');
select is(pg_temp.titles(pg_temp.win()) && array['S8 Taslak', 'S8 Davetli', 'S8 Kapanan hesap'], false,
  'drafts, invite-only events and events of closed accounts are never listed');
select is((select count(*)::int from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Kapanan hesap'), 0, 'the closed account''s event is absent from the raw result too');

-- Only public fields: a new column on events never leaks through this function by accident.
select is((select array_agg(k order by k) from (
    select distinct jsonb_object_keys(i) k
      from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i) s),
  array['approved_count', 'booking_status', 'capacity', 'city_id', 'cost_amount_minor', 'cost_note', 'district_id',
        'duration_minutes', 'ends_at', 'id', 'open_slots', 'organizer_name', 'place_label', 'registration_open',
        'setting', 'skill_max', 'skill_min', 'sport_format_id', 'sport_id', 'starts_at', 'title', 'waitlist_enabled'],
  'items carry exactly the public field list (no invite token, address, notes, organizer id)');
select is((select i -> 'place_label' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Sabah tenis'), 'null'::jsonb, 'a hidden place has no label');
select is((select i ->> 'place_label' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Akşam futbol'), 'ODTÜ Halı Saha 2', 'a public place shows its label');
select is((select i ->> 'organizer_name' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Akşam futbol'), 'Ayşe A', 'the organizer''s display name is shown');
select is((select i ->> 'open_slots' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Dolu tenis'), '0', 'a full event reports no open slots');
select is((select i ->> 'open_slots' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Akşam futbol'), '11', 'the organizer''s own slot is already taken');
select is((select (i ->> 'registration_open')::boolean from jsonb_array_elements(
            public.search_events(jsonb_build_object('from', pg_temp.local_ts(8, '00:00'), 'to', pg_temp.local_ts(10, '00:00'))) -> 'items') i
            where i ->> 'title' = 'S8 Kayıt kapalı'),
  false, 'a closed registration is flagged, not hidden');
select throws_ok($$select * from public.event_private_details$$, '42501', null, 'the private details stay unreachable');

-- ---- filters ------------------------------------------------------------------------------------------------------
select is(pg_temp.titles(pg_temp.win(jsonb_build_object('sport_ids',
    jsonb_build_array((select id from public.sports where slug = 'tennis'))))),
  array['S8 Sabah tenis', 'S8 Dolu tenis'], 'sport filter');
select is(pg_temp.titles(pg_temp.win(jsonb_build_object('district_ids',
    jsonb_build_array((select id from public.districts where slug = 'yenimahalle'))))),
  array['S8 Öğle futbol'], 'district filter');
select is(pg_temp.titles(pg_temp.win(jsonb_build_object('sport_format_id',
    (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
      where s.slug = 'tennis' and f.slug = 'singles')))),
  array['S8 Sabah tenis', 'S8 Dolu tenis'], 'format filter');
select is(pg_temp.titles(pg_temp.win('{"time_of_day": ["MORNING"]}')), array['S8 Sabah tenis', 'S8 Dolu tenis'],
  'morning (05–12) in Istanbul time: 09:00 and 10:00');
select is(pg_temp.titles(pg_temp.win('{"time_of_day": ["AFTERNOON"]}')), array['S8 Öğle futbol'], 'afternoon (12–17): 14:00');
select is(pg_temp.titles(pg_temp.win('{"time_of_day": ["EVENING"]}')), array['S8 Akşam futbol'], 'evening (from 17): 19:30');
select is(pg_temp.titles(pg_temp.win('{"time_of_day": ["MORNING", "EVENING"]}')),
  array['S8 Akşam futbol', 'S8 Sabah tenis', 'S8 Dolu tenis'], 'several parts of the day combine');
select is(pg_temp.titles(pg_temp.win('{"only_open": true}')),
  array['S8 Akşam futbol', 'S8 Sabah tenis', 'S8 Öğle futbol'], 'only events with an open slot');
select is(pg_temp.titles(pg_temp.win('{"skill_level": 2.0}')),
  array['S8 Akşam futbol', 'S8 Öğle futbol', 'S8 Dolu tenis'], 'a level outside 3–4 hides the tennis event; events without a range stay');
select is(pg_temp.titles(pg_temp.win('{"skill_level": 3.5}')),
  array['S8 Akşam futbol', 'S8 Sabah tenis', 'S8 Öğle futbol', 'S8 Dolu tenis'], 'a level inside the range keeps it');
select is(pg_temp.titles(jsonb_build_object('from', pg_temp.local_ts(4, '00:00'), 'to', pg_temp.local_ts(5, '00:00'))),
  array['S8 Sabah tenis'], 'date window');
select is(pg_temp.titles(pg_temp.win('{"unknown_filter": 1}')),
  array['S8 Akşam futbol', 'S8 Sabah tenis', 'S8 Öğle futbol', 'S8 Dolu tenis'], 'unknown filter keys are ignored (forward compatible)');

-- ---- indoor / outdoor -------------------------------------------------------------------------------------------------
select is(pg_temp.titles(pg_temp.win('{"setting": "OUTDOOR"}')), array['S8 Akşam futbol'], 'the outdoor filter');
select is(pg_temp.titles(pg_temp.win('{"setting": "INDOOR"}')), array[]::text[], 'the indoor filter (nothing is stated indoor)');
select is((select i ->> 'setting' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Akşam futbol'), 'OUTDOOR', 'the stated setting is in the item');
select is((select i -> 'setting' from jsonb_array_elements(public.search_events(pg_temp.win()) -> 'items') i
            where i ->> 'title' = 'S8 Sabah tenis'), 'null'::jsonb, '... and null when the organizer said nothing');
select throws_ok($$select public.search_events('{"setting": "ROOFTOP"}')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown setting filter');
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('S8 Çatı', 3, '22:00', '{"setting": "ROOFTOP"}'))$$,
  'P0001', 'VALIDATION_FAILED', 'an unknown setting on an event');
select pg_temp.act_as_anon();

-- ---- keyset pagination -----------------------------------------------------------------------------------------------
select is((public.search_events(pg_temp.win('{"limit": 2}')) -> 'items') -> 0 ->> 'title', 'S8 Akşam futbol',
  'page one starts with the soonest event');
select isnt(public.search_events(pg_temp.win('{"limit": 2}')) -> 'next_cursor', 'null'::jsonb, 'a full page returns a cursor');
select is(pg_temp.titles(pg_temp.win('{"limit": 2}'),
    public.search_events(pg_temp.win('{"limit": 2}')) -> 'next_cursor'),
  array['S8 Öğle futbol', 'S8 Dolu tenis'], 'the cursor continues after the last item without repeats or gaps');
select is(public.search_events(pg_temp.win('{"limit": 2}'),
    public.search_events(pg_temp.win('{"limit": 2}')) -> 'next_cursor') -> 'next_cursor', 'null'::jsonb,
  'the last page has no cursor');
select ok(jsonb_array_length(public.search_events('{"limit": 100000}') -> 'items') <= 50, 'the page size is capped at 50');

-- ---- bad input is a validation error, never a crash or a wider result ----------------------------------------------
select throws_ok($$select public.search_events('[]'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'filters must be an object');
select throws_ok($$select public.search_events('{"city_id": "nope"}')$$, 'P0001', 'VALIDATION_FAILED', 'a malformed id');
select throws_ok($$select public.search_events('{"limit": 0}')$$, 'P0001', 'VALIDATION_FAILED', 'a page size below 1');
select throws_ok($$select public.search_events('{"time_of_day": ["NIGHT"]}')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown part of the day');
select throws_ok($$select public.search_events('{"skill_level": 6}')$$, 'P0001', 'VALIDATION_FAILED', 'a level above 5');
select throws_ok($$select public.search_events('{"from": "2030-01-02T00:00:00Z", "to": "2030-01-01T00:00:00Z"}')$$,
  'P0001', 'VALIDATION_FAILED', 'an inverted date window');
select throws_ok($$select public.search_events('{}', '{"starts_at": "2030-01-01T00:00:00Z"}')$$,
  'P0001', 'VALIDATION_FAILED', 'a cursor without an id');

select * from finish();
rollback;
