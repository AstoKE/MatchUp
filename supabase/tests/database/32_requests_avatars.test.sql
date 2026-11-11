-- ROADMAP P-21: the organizer's request list carries each player's avatar, and the organizer may read the photo.
begin;
select plan(7);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000032' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.photo(n int) returns text language sql as $$
  select pg_temp.u(n)::text || '/' || '11111111-2222-4333-8444-5555555555' || lpad(n::text, 2, '0') || '.jpg';
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev() returns uuid language sql as $$ select v from ids where k = 'e'; $$;
create function pg_temp.row_of(n int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(1));
  select i into v from jsonb_array_elements(public.list_event_requests(pg_temp.ev()) -> 'items') i
   where (i ->> 'user_id')::uuid = pg_temp.u(n);
  reset role;
  return v;
end;
$$;

-- 01 organizer · 02 photo and drawing, private profile · 03 drawing only · 04 nothing chosen · 05 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u32-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 5) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000032%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000032%';
update public.profiles set avatar_key = 'f-football', avatar_path = pg_temp.photo(2) where id = pg_temp.u(2);
update public.profiles set avatar_key = 'm-tennis' where id = pg_temp.u(3);
update public.user_settings set profile_visibility = 'EVENT_PEERS' where user_id = pg_temp.u(2);

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('e', public.create_event(gen_random_uuid(), jsonb_build_object(
  'sport_id', pg_temp.football(),
  'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
  'title', 'S32', 'starts_at', (now() + interval '270 days')::text, 'duration_minutes', 90,
  'city_id', (select id from public.cities where slug = 'ankara'),
  'district_id', (select id from public.districts where slug = 'cankaya'),
  'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12), true));
select pg_temp.act_as(pg_temp.u(n)), public.request_join(pg_temp.ev()) from unnest(array[2, 3, 4]) n;
reset role;

select is(pg_temp.row_of(2) ->> 'avatar_key', 'f-football', 'the chosen drawing comes with the request');
select is(pg_temp.row_of(2) ->> 'avatar_path', pg_temp.photo(2), 'and the photo the profile points at');
select is(pg_temp.row_of(3) -> 'avatar_path', 'null'::jsonb, 'no photo: no path, the drawing stays');
select ok(pg_temp.row_of(4) ? 'avatar_key' and pg_temp.row_of(4) -> 'avatar_key' = 'null'::jsonb,
  'nothing chosen: the key is there and null (the app draws initials)');

-- The photo is read through storage: the organizer of an event the person requested may read it, a stranger may not.
select pg_temp.act_as(pg_temp.u(1));
select ok(private.can_read_avatar(pg_temp.photo(2)), 'the organizer sees a requester''s photo, even on a private profile');
select pg_temp.act_as(pg_temp.u(5));
select ok(not private.can_read_avatar(pg_temp.photo(2)), 'a stranger does not');
select throws_ok($$select public.list_event_requests(pg_temp.ev())$$, 'P0001', 'NOT_FOUND', 'nor can a stranger read the list');

select * from finish();
rollback;
