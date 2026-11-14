-- Phase 11 / M1 (ADR-0032): recurring events. Making a series, what the job opens, stopping, limits, export and purge.
begin;
select plan(32);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000044' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
-- An event starting p_days from now at 20:00 Istanbul time, published unless asked otherwise.
create function pg_temp.new_event(p_key text, p_days int, p_publish boolean default true) returns void language plpgsql as $$
begin
  insert into ids values (p_key, public.create_event(gen_random_uuid(), jsonb_build_object(
    'sport_id', pg_temp.football(),
    'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
    'title', 'Seri ' || p_key,
    'starts_at', ((((now() at time zone 'Europe/Istanbul')::date + p_days) + time '20:00') at time zone 'Europe/Istanbul')::text,
    'registration_closes_at', ((((now() at time zone 'Europe/Istanbul')::date + p_days) + time '18:00') at time zone 'Europe/Istanbul')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'Saha 44', 'address_text', 'Gizli adres 44', 'capacity', 10), p_publish));
end;
$$;
create function pg_temp.series_of(k text) returns uuid language sql as $$
  select series_id from public.events where id = pg_temp.id(k);
$$;
create function pg_temp.count_in(p_series uuid) returns bigint language sql as $$
  select count(*) from public.events where series_id = p_series;
$$;

-- 01 organizer · 02 second organizer (suspended later) · 03 stranger · 04 organizer purged at the end
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u44-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000044%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000044%';
insert into public.organizations (name, city_id, sport_ids, status, created_by, decided_at)
values ('Kulüp 44', (select id from public.cities where slug = 'ankara'), array[pg_temp.football()], 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'org', id from public.organizations where name = 'Kulüp 44';
insert into public.organization_members (organization_id, user_id, role) values (pg_temp.id('org'), pg_temp.u(1), 'OWNER');

select pg_temp.act_as(pg_temp.u(1));
select pg_temp.new_event('weekly', 1);
select pg_temp.new_event('fortnight', 1);
select pg_temp.new_event('third', 2);
select pg_temp.new_event('draft', 3, false);
select public.set_event_organization(pg_temp.id('weekly'), pg_temp.id('org'));

-- Making a series.
select throws_ok(format('select public.create_event_series(%L, 3)', pg_temp.id('weekly')), 'P0001', 'VALIDATION_FAILED',
  'only every week or every two weeks');
select throws_ok(format('select public.create_event_series(%L, 1)', pg_temp.id('draft')), 'P0001', 'INVALID_TRANSITION',
  'a draft cannot start a series');
insert into ids values ('s1', public.create_event_series(pg_temp.id('weekly'), 1));
select is(pg_temp.series_of('weekly'), pg_temp.id('s1'), 'the event joins its series');
select is(public.create_event_series(pg_temp.id('weekly'), 2), pg_temp.id('s1'), 'asking again returns the same series');
select is(pg_temp.count_in(pg_temp.id('s1')), 2::bigint, 'the next week opens at once (the one after is beyond two weeks)');
insert into ids select 'next', id from public.events where series_id = pg_temp.id('s1') and id <> pg_temp.id('weekly');
reset role;
select is((select status::text from public.events where id = pg_temp.id('next')), 'PUBLISHED', 'it is published');
select is((select starts_at - (select starts_at from public.events where id = pg_temp.id('weekly')) from public.events where id = pg_temp.id('next')),
  interval '7 days', 'a week later');
select is((select (starts_at at time zone 'Europe/Istanbul')::time from public.events where id = pg_temp.id('next')), time '20:00',
  'at the same local time');
select is((select registration_closes_at from public.events where id = pg_temp.id('next')),
  (select starts_at - interval '2 hours' from public.events where id = pg_temp.id('next')), 'registration closes as long before');
select is((select title || '|' || capacity || '|' || d.address_text from public.events e join public.event_private_details d on d.event_id = e.id
            where e.id = pg_temp.id('next')), 'Seri weekly|10|Gizli adres 44', 'with the same details');
select ok(exists (select 1 from public.event_participations where event_id = pg_temp.id('next') and user_id = pg_temp.u(1) and is_organizer),
  'the organizer plays, as in the first event');
select is((select organization_id from public.events where id = pg_temp.id('next')), pg_temp.id('org'),
  'under the same organization');
select is(private.open_series_events(), 0, 'another run opens nothing new');

-- Fortnightly, limits, strangers.
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('s2', public.create_event_series(pg_temp.id('fortnight'), 2));
select is(pg_temp.count_in(pg_temp.id('s2')), 1::bigint, 'every two weeks: nothing within two weeks yet');
select throws_ok(format('select public.create_event_series(%L, 1)', pg_temp.id('third')), 'P0001', 'QUOTA_EXCEEDED',
  'at most two active series');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format('select public.create_event_series(%L, 1)', pg_temp.id('third')), 'P0001', 'NOT_FOUND',
  'nobody makes a series of someone else''s event');
select throws_ok(format('select public.stop_event_series(%L)', pg_temp.id('s1')), 'P0001', 'NOT_FOUND',
  'nor stops one');
select is(public.get_event_series(pg_temp.id('weekly')) ->> 'interval_weeks', '1', 'a player sees that a public event repeats');
select ok(public.get_event_series(pg_temp.id('weekly')) -> 'next_at' = 'null'::jsonb
          and not (public.get_event_series(pg_temp.id('weekly')) ->> 'is_mine')::boolean, 'but not the organizer''s details');
select pg_temp.act_as(pg_temp.u(1));
select ok(public.get_event_series(pg_temp.id('weekly')) ->> 'next_at' is not null, 'the organizer sees the next start');
select is(jsonb_array_length(public.list_my_event_series()), 2, 'and lists their series');

-- A canceled week stays canceled; a full calendar skips a week, not the series.
select public.cancel_event(pg_temp.id('next'), 'OTHER');
reset role;
update public.event_series set next_at = (select starts_at from public.events where id = pg_temp.id('next')) where id = pg_temp.id('s1');
select is(private.open_series(pg_temp.id('s1')), 0, 'a canceled week is not opened again');
insert into public.app_config (key, value) values ('quota.max_upcoming_published_events', '1'::jsonb)
on conflict (key) do update set value = excluded.value;
update public.event_series set next_at = now() + interval '3 days' where id = pg_temp.id('s2');
select is(private.open_series(pg_temp.id('s2')), 0, 'no room in the upcoming-events limit: nothing opens');
select is((select status || '|' || (next_at = now() + interval '3 days') from public.event_series where id = pg_temp.id('s2')), 'ACTIVE|true',
  'the series waits to try that week again');
delete from public.app_config where key = 'quota.max_upcoming_published_events';

-- Stopping, by the organizer and by the job.
select pg_temp.act_as(pg_temp.u(1));
select public.stop_event_series(pg_temp.id('s1'));
reset role;
select is((select status || '|' || stopped_reason from public.event_series where id = pg_temp.id('s1')), 'STOPPED|BY_ORGANIZER',
  'the organizer stops a series');
select is((select count(*) from public.events where series_id = pg_temp.id('s1') and status = 'PUBLISHED'), 1::bigint,
  'and the event already opened stays');
update public.event_series set template = template || '{"capacity": 999}'::jsonb where id = pg_temp.id('s2');
select private.open_series(pg_temp.id('s2'));
select is((select stopped_reason from public.event_series where id = pg_temp.id('s2')), 'DETAILS_INVALID',
  'details that no longer validate stop the series');

select pg_temp.act_as(pg_temp.u(2));
select pg_temp.new_event('suspended', 1);
insert into ids values ('s3', public.create_event_series(pg_temp.id('suspended'), 1));
reset role;
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(2);
update public.event_series set next_at = now() + interval '3 days' where id = pg_temp.id('s3');
select private.open_series_events();
select is((select stopped_reason from public.event_series where id = pg_temp.id('s3')), 'ORGANIZER_UNAVAILABLE',
  'a suspended organizer''s series stops at the next run');

-- Export and purge (ADR-0017).
select pg_temp.act_as(pg_temp.u(4));
select pg_temp.new_event('purged', 1);
insert into ids values ('s4', public.create_event_series(pg_temp.id('purged'), 1));
select is(jsonb_array_length(public.export_my_data() -> 'event_series'), 1, 'a series is in its organizer''s export');
reset role;
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(4);
select ok(private.purge_account(pg_temp.u(4)), 'the organizer is purged');
select is((select coalesce(organizer_id::text, '-') || '|' || template::text || '|' || status from public.event_series where id = pg_temp.id('s4')),
  '-|{}|STOPPED', 'the series keeps no owner and no details');

select ok(not has_function_privilege('anon', 'public.create_event_series(uuid, integer)', 'execute')
      and not has_function_privilege('authenticated', 'private.open_series_events()', 'execute')
      and not has_table_privilege('authenticated', 'public.event_series', 'select'),
  'guests cannot make a series, nobody runs the job or reads the table directly');

select * from finish();
rollback;
