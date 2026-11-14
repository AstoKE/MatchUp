-- Phase 11 / M3 (ADR-0032): the regulars are told about the next event, a series takes an event's details and time, a
-- series with nobody stops by itself, and the organizer is told when a series stops by itself.
begin;
select plan(31);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000045' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
-- 20:00 Istanbul time, p_days from today.
create function pg_temp.at(p_days int, p_time time default time '20:00') returns timestamptz language sql as $$
  select (((now() at time zone 'Europe/Istanbul')::date + p_days) + p_time) at time zone 'Europe/Istanbul';
$$;
create function pg_temp.new_event(p_key text, p_days int) returns void language plpgsql as $$
begin
  insert into ids values (p_key, public.create_event(gen_random_uuid(), jsonb_build_object(
    'sport_id', pg_temp.football(),
    'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
    'title', 'Seri ' || p_key,
    'starts_at', pg_temp.at(p_days)::text,
    'registration_closes_at', (pg_temp.at(p_days) - interval '2 hours')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'Saha 45', 'capacity', 10), true));
end;
$$;
create function pg_temp.approve(p_key text, p_user uuid) returns void language plpgsql as $$
begin
  insert into public.event_participations (event_id, user_id, status) values (pg_temp.id(p_key), p_user, 'REQUESTED');
  update public.event_participations set status = 'APPROVED', approved_at = now()
   where event_id = pg_temp.id(p_key) and user_id = p_user;
end;
$$;
create function pg_temp.next_of(p_series text) returns uuid language sql as $$
  select id from public.events where series_id = pg_temp.id(p_series) order by starts_at desc limit 1;
$$;
create function pg_temp.notes(p_type text, p_user uuid) returns bigint language sql as $$
  select count(*) from public.notifications where type = p_type and user_id = p_user;
$$;

-- 01 organizer · 02 regular · 03 regular who blocked the organizer · 04 only asked · 05 regular, suspended
-- 06 organizer of an empty series · 07 organizer who changes a series · 08 stranger · 09 organizer with players, suspended
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u45-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000045%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000045%';
insert into public.push_devices (user_id, token, platform) values (pg_temp.u(2), 'ExponentPushToken[s45device2xxxx]', 'ios');

-- ---- the regulars ---------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select pg_temp.new_event('first', 1);
reset role;
select pg_temp.approve('first', pg_temp.u(2));
select pg_temp.approve('first', pg_temp.u(3));
select pg_temp.approve('first', pg_temp.u(5));
insert into public.event_participations (event_id, user_id, status) values (pg_temp.id('first'), pg_temp.u(4), 'REQUESTED');
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u(3), pg_temp.u(1));
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(5);

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('s1', public.create_event_series(pg_temp.id('first'), 1));
reset role;
insert into ids values ('next', pg_temp.next_of('s1'));
select isnt(pg_temp.id('next'), pg_temp.id('first'), 'the next week is open');
select is((select payload from public.notifications where type = 'SERIES_EVENT_OPENED' and user_id = pg_temp.u(2)),
  jsonb_build_object('event_id', pg_temp.id('next'), 'series_id', pg_temp.id('s1')),
  'a player of the previous event is told, with ids only');
select is((select count(*) from public.notifications where type = 'SERIES_EVENT_OPENED' and payload ->> 'event_id' = pg_temp.id('next')::text),
  1::bigint, 'nobody else: not the organizer, a blocked pair, a mere request or a suspended account');
select is((select kind || '|' || (args #>> '{sport,tr}') from public.push_outbox where user_id = pg_temp.u(2) and event_id = pg_temp.id('next')),
  'SERIES_EVENT_OPENED|Futbol', 'and a push is queued behind "my events"');
select is(private.push_text('SERIES_EVENT_OPENED', 'tr', '{"sport": {"tr": "Futbol"}, "district": {"tr": "Çankaya"}}') ->> 'body',
  'Futbol · Çankaya: oynadığın etkinliğin yeni haftası açıldı. Katılmak için dokun.', 'its text names no person and no place');
select ok(private.push_allowed(pg_temp.u(2), 'SERIES_EVENT_OPENED') and private.push_relevant('SERIES_EVENT_OPENED', pg_temp.u(2), pg_temp.id('next')),
  'it is sent while the event is open');
update public.user_settings set push_activity = false where user_id = pg_temp.u(2);
select ok(not private.push_allowed(pg_temp.u(2), 'SERIES_EVENT_OPENED'), 'the "my events" switch turns it off');
update public.user_settings set push_activity = true where user_id = pg_temp.u(2);
insert into public.event_participations (event_id, user_id, status) values (pg_temp.id('next'), pg_temp.u(2), 'REQUESTED');
select ok(not private.push_relevant('SERIES_EVENT_OPENED', pg_temp.u(2), pg_temp.id('next')),
  'and is dropped once the player has asked to join');
select is(private.open_series(pg_temp.id('s1')), 0, 'another run opens nothing');
select is(pg_temp.notes('SERIES_EVENT_OPENED', pg_temp.u(2)), 1::bigint, 'and tells nobody twice');

-- ---- the next events like this one ----------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(7));
select pg_temp.new_event('base', 1);
select pg_temp.new_event('lone', 2);
insert into ids values ('s7', public.create_event_series(pg_temp.id('base'), 1));
insert into ids values ('moved', pg_temp.next_of('s7'));
select public.update_event(pg_temp.id('moved'), jsonb_build_object(
  'title', 'Çarşamba maçı',
  'starts_at', pg_temp.at(9, time '21:00')::text,
  'registration_closes_at', (pg_temp.at(9, time '21:00') - interval '3 hours')::text));
select is(public.apply_event_to_series(pg_temp.id('moved')), pg_temp.at(16, time '21:00'),
  'the series continues a week after the moved event, at its new time');
reset role;
select is((select template ->> 'title' from public.event_series where id = pg_temp.id('s7')), 'Çarşamba maçı',
  'with its details');
select is((select close_offset from public.event_series where id = pg_temp.id('s7')), interval '3 hours',
  'and its registration close');
select is((select starts_at from public.events where id = pg_temp.id('base')), pg_temp.at(1),
  'the events already opened stay as they were');
-- Bring that start inside the two weeks the job looks at.
update public.event_series set next_at = pg_temp.at(10, time '21:00') where id = pg_temp.id('s7');
select is(private.open_series(pg_temp.id('s7')), 1, 'the job opens the next one');
select is((select title || '|' || to_char(starts_at at time zone 'Europe/Istanbul', 'HH24:MI')
                  || '|' || (starts_at - registration_closes_at)
             from public.events where id = pg_temp.next_of('s7')), 'Çarşamba maçı|21:00|03:00:00',
  'from the new details');

select pg_temp.act_as(pg_temp.u(8));
select throws_ok(format('select public.apply_event_to_series(%L)', pg_temp.id('moved')), 'P0001', 'NOT_FOUND',
  'nobody changes someone else''s series');
select pg_temp.act_as(pg_temp.u(7));
select throws_ok(format('select public.apply_event_to_series(%L)', pg_temp.id('lone')), 'P0001', 'NOT_FOUND',
  'an event outside a series has none to change');
select public.cancel_event(pg_temp.id('moved'), 'OTHER');
select throws_ok(format('select public.apply_event_to_series(%L)', pg_temp.id('moved')), 'P0001', 'INVALID_TRANSITION',
  'nor does a canceled event');
select public.stop_event_series(pg_temp.id('s7'));
select throws_ok(format('select public.apply_event_to_series(%L)', pg_temp.id('base')), 'P0001', 'INVALID_TRANSITION',
  'nor an event of a stopped series');
reset role;
select is(pg_temp.notes('SERIES_STOPPED', pg_temp.u(7)), 0::bigint, 'stopping by hand tells the organizer nothing');

-- ---- a series with nobody stops by itself -----------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(6));
select pg_temp.new_event('e6', 1);
select pg_temp.new_event('p6a', 2);
select pg_temp.new_event('p6b', 3);
select pg_temp.new_event('p6c', 4);
insert into ids values ('s6', public.create_event_series(pg_temp.id('e6'), 1));
select pg_temp.act_as(pg_temp.u(9));
select pg_temp.new_event('e9', 1);
select pg_temp.new_event('p9a', 2);
select pg_temp.new_event('p9b', 3);
select pg_temp.new_event('p9c', 4);
insert into ids values ('s9', public.create_event_series(pg_temp.id('e9'), 1));
reset role;
select pg_temp.approve('p9c', pg_temp.u(2));
-- Three earlier events of each series that took place; only one of the second series had a player.
update public.events e set series_id = case when x.k like 'p6%' then pg_temp.id('s6') else pg_temp.id('s9') end,
                           starts_at = now() - x.ago, registration_closes_at = now() - x.ago - interval '2 hours'
  from (values ('p6a', interval '22 days'), ('p6b', interval '15 days'), ('p6c', interval '8 days'),
               ('p9a', interval '22 days'), ('p9b', interval '15 days'), ('p9c', interval '8 days')) x(k, ago)
 where e.id = pg_temp.id(x.k);

select is(private.open_series(pg_temp.id('s9')), 0, 'a series whose recent events had a player');
select is((select status from public.event_series where id = pg_temp.id('s9')), 'ACTIVE', 'keeps going');
select is(private.open_series(pg_temp.id('s6')), 0, 'three events in a row with nobody but the organizer');
select is((select status || '|' || stopped_reason from public.event_series where id = pg_temp.id('s6')), 'STOPPED|NO_PLAYERS',
  'stop the series');
select is((select payload from public.notifications where type = 'SERIES_STOPPED' and user_id = pg_temp.u(6)),
  jsonb_build_object('series_id', pg_temp.id('s6'), 'reason', 'NO_PLAYERS', 'event_id', pg_temp.next_of('s6')),
  'the organizer is told why, with the latest event to open');
select is(private.open_series_events(), 0, 'later runs open nothing for it');
select is(pg_temp.notes('SERIES_STOPPED', pg_temp.u(6)), 1::bigint, 'and do not tell again');

update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(9);
select private.open_series(pg_temp.id('s9'));
select is((select stopped_reason from public.event_series where id = pg_temp.id('s9')), 'ORGANIZER_UNAVAILABLE',
  'a suspended organizer''s series stops');
select is(pg_temp.notes('SERIES_STOPPED', pg_temp.u(9)), 0::bigint, 'without a notification to an account that is not active');

select ok(not has_function_privilege('anon', 'public.apply_event_to_series(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.apply_event_to_series(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.notify_series_regulars(uuid)', 'execute'),
  'guests cannot change a series; nobody calls the helpers');

select * from finish();
rollback;
