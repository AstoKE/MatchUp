-- Phase 5 / M5a: who may read what through get_event_attendance.
begin;
select plan(18);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000017' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev() returns uuid language sql as $$ select v from ids where k = 'e'; $$;
create function pg_temp.part(n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev() and user_id = pg_temp.u(n);
$$;

-- 01 organizer · 02 and 03 approved · 04 only requested · 05 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u17-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 5) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000017%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000017%';

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('e', public.create_event(gen_random_uuid(), jsonb_build_object(
  'sport_id', (select id from public.sports where slug = 'football'),
  'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                       where s.slug = 'football' and f.slug = '5v5'),
  'title', 'S17', 'starts_at', (now() + interval '250 days')::text, 'duration_minutes', 90,
  'city_id', (select id from public.cities where slug = 'ankara'),
  'district_id', (select id from public.districts where slug = 'cankaya'),
  'location_label', 'ODTÜ Halı Saha 2', 'capacity', 10), true));
select pg_temp.act_as(pg_temp.u(2)); select public.request_join(pg_temp.ev());
select pg_temp.act_as(pg_temp.u(3)); select public.request_join(pg_temp.ev());
select pg_temp.act_as(pg_temp.u(4)); select public.request_join(pg_temp.ev());
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part(2));
select public.approve_participation(pg_temp.part(3));
reset role;
update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.ev();

select function_privs_are('public', 'get_event_attendance', array['uuid'], 'anon', array[]::text[], 'guests may not call it');
select function_privs_are('public', 'get_event_attendance', array['uuid'], 'authenticated', array['EXECUTE'], 'signed-in users may');

select pg_temp.act_as(pg_temp.u(1));
select public.mark_attendance(pg_temp.part(2), 'PRESENT');
select public.mark_attendance(pg_temp.part(3), 'ABSENT');
select is(jsonb_array_length(public.get_event_attendance(pg_temp.ev()) -> 'roster'), 3, 'the organizer sees every approved player and themselves');
select is(public.get_event_attendance(pg_temp.ev()) -> 'roster' -> 0 ->> 'is_organizer', 'true', 'their own row first');
select is(public.get_event_attendance(pg_temp.ev()) ->> 'finalized_at', null, 'not finalized yet');

select pg_temp.act_as(pg_temp.u(2));
select is(public.get_event_attendance(pg_temp.ev()) -> 'roster', 'null'::jsonb, 'a player sees no roster');
select is(public.get_event_attendance(pg_temp.ev()) -> 'my' ->> 'attendance', 'PRESENT', 'but their own mark');
select is(public.get_event_attendance(pg_temp.ev()) -> 'my' ->> 'participation_id', pg_temp.part(2)::text, 'with its id, for a dispute');

select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.get_event_attendance(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'a pending request reads nothing');
select pg_temp.act_as(pg_temp.u(5));
select throws_ok($$select public.get_event_attendance(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'a stranger reads nothing');
select throws_ok($$select public.get_event_attendance(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'neither does a missing event');

select pg_temp.act_as(pg_temp.u(1));
select public.finalize_attendance(pg_temp.ev());
select ok(public.get_event_attendance(pg_temp.ev()) ->> 'finalized_at' is not null, 'finalized');
select is((public.get_event_attendance(pg_temp.ev()) ->> 'dispute_closes_at')::timestamptz,
          (public.get_event_attendance(pg_temp.ev()) ->> 'finalized_at')::timestamptz + interval '72 hours', 'disputes close 72 hours later');
-- The notification: to approved players, also the absent one, not to the organizer or a pending request; ids only.
reset role;
create function pg_temp.notes(n int) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = pg_temp.u(n) and type = 'ATTENDANCE_FINALIZED';
$$;
select is(array[pg_temp.notes(2), pg_temp.notes(3)], array[1, 1], 'approved players are told, the absent one too');
select is(array[pg_temp.notes(1), pg_temp.notes(4)], array[0, 0], 'not the organizer, not a pending request');
select is((select payload from public.notifications where user_id = pg_temp.u(2) and type = 'ATTENDANCE_FINALIZED'),
          jsonb_build_object('event_id', pg_temp.ev()), 'the payload is the event id only');
select pg_temp.act_as(pg_temp.u(1));
select public.finalize_attendance(pg_temp.ev());
reset role;
select is(pg_temp.notes(2), 1, 'finalizing again does not tell them again');

select pg_temp.act_as(pg_temp.u(3));
select public.dispute_attendance(pg_temp.part(3), 'Oradaydım');
select is(public.get_event_attendance(pg_temp.ev()) -> 'my' ->> 'attendance', 'DISPUTED', 'a dispute shows on the player''s own row');

select * from finish();
rollback;
