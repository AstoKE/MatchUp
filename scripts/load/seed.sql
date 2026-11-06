-- Phase 7 / M3: pilot-scale data for the load scenarios (ARCHITECTURE §8), LOCAL STACK ONLY.
-- 3 000 players, 100 000 events (half upcoming), ~500 000 participations, plus the fixtures each scenario needs.
-- Written straight into the tables with triggers off (session_replication_role = replica, superuser, local): the point
-- is the volume the indexes and functions face, not the path that created it. `pnpm db:reset` removes all of it.
-- The last statement prints the fixture ids as JSON for scripts/load/run.mjs.
\set ON_ERROR_STOP on
set client_min_messages = warning;
set session_replication_role = replica;

-- ---- players ------------------------------------------------------------------------------------------------------------
create temp table load_users as
select n, ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid as id from generate_series(1, 3000) n;

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select id, 'load-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now() from load_users;
insert into public.profiles (id, display_name, adult_confirmed_at, onboarded_at, created_at, account_status)
select id, 'Yük ' || n, now(), now(), now() - interval '60 days', 'ACTIVE' from load_users
on conflict (id) do update set display_name = excluded.display_name, adult_confirmed_at = excluded.adult_confirmed_at,
  onboarded_at = excluded.onboarded_at, created_at = excluded.created_at;
insert into public.user_settings (user_id) select id from load_users on conflict do nothing;
insert into public.user_consents (user_id, kind, version)
select u.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from load_users u cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key);

-- 200 players with no participations at all, for the join storm (the others hold many open requests, which their quota
-- of 20 would turn into QUOTA_EXCEEDED instead of measuring the join).
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid, 'load-' || n || '@test.invalid', now(), 'authenticated',
       'authenticated', now(), now() from generate_series(4001, 4200) n;
insert into public.profiles (id, display_name, adult_confirmed_at, onboarded_at, created_at)
select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid, 'Yük yeni ' || n, now(), now(), now() - interval '60 days'
  from generate_series(4001, 4200) n
on conflict (id) do update set adult_confirmed_at = now(), onboarded_at = now(), created_at = now() - interval '60 days';
insert into public.user_settings (user_id) select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
  from generate_series(4001, 4200) n on conflict do nothing;
insert into public.user_consents (user_id, kind, version)
select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid, k.kind::public.consent_kind,
       (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from generate_series(4001, 4200) n
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key);

-- ---- 100 000 events -----------------------------------------------------------------------------------------------------
create temp table d as
select row_number() over (order by random()) as r, x.id, x.city_id, x.centroid,
       (c.slug in ('ankara', 'istanbul', 'izmir')) as big
  from public.districts x join public.cities c on c.id = x.city_id;
create temp table big_d as select row_number() over () as r, id, city_id, centroid from d where big;
create temp table fmt as
select f.sport_id, f.id as format_id, least(f.max_participants, greatest(f.default_capacity, 4)) as capacity,
       row_number() over () as r
  from public.sport_formats f where not f.is_flexible;

create temp table ev as
select g as n,
       gen_random_uuid() as id,
       (select id from load_users where n = 1 + (g * 7919) % 3000) as organizer_id,
       case when g % 10 < 5 then 'PUBLISHED' when g % 10 < 8 then 'COMPLETED' when g % 10 = 8 then 'CANCELED' else 'DRAFT' end
         ::public.event_status as status,
       case when g % 10 < 5 or g % 10 = 9 then now() + (1 + (g % 60)) * interval '1 day' + (g % 24) * interval '1 hour'
            else now() - (1 + (g % 300)) * interval '1 day' end as starts_at,
       g % 5 < 2 as in_big,
       g % 5 < 3 as has_pin,
       g % 2 = 0 as public_place
  from generate_series(1, 100000) g;

insert into public.events (id, organizer_id, client_request_id, sport_id, sport_format_id, title, status, starts_at,
  duration_minutes, ends_at, city_id, district_id, location_visibility, public_location_label, capacity, approved_count,
  published_at, completed_at, canceled_at, cancel_reason, public_point, public_point_precision, created_at, updated_at)
select e.id, e.organizer_id, gen_random_uuid(), f.sport_id, f.format_id, 'Yük maçı ' || e.n, e.status, e.starts_at, 90,
       e.starts_at + interval '90 minutes', dd.city_id, dd.id,
       case when e.public_place then 'PUBLIC' else 'APPROVED_ONLY' end::public.location_visibility,
       case when e.public_place then 'Saha ' || e.n end, f.capacity, 0,
       case when e.status <> 'DRAFT' then e.starts_at - interval '7 days' end,
       case when e.status = 'COMPLETED' then e.starts_at + interval '2 hours' end,
       case when e.status = 'CANCELED' then e.starts_at - interval '1 day' end,
       case when e.status = 'CANCELED' then 'WEATHER'::public.event_cancel_reason end,
       case when e.has_pin then extensions.st_setsrid(extensions.st_makepoint(
              extensions.st_x(dd.centroid::extensions.geometry) + ((e.n * 37) % 100 - 50) / 1000.0,
              extensions.st_y(dd.centroid::extensions.geometry) + ((e.n * 53) % 100 - 50) / 1000.0), 4326)::extensions.geography
            else dd.centroid end,
       case when not e.has_pin then 'DISTRICT' when e.public_place then 'EXACT' else 'APPROXIMATE' end,
       e.starts_at - interval '8 days', now()
  from ev e
  join fmt f on f.r = 1 + e.n % (select count(*) from fmt)
  join lateral (
    select x.id, x.city_id, x.centroid from big_d x where e.in_big and x.r = 1 + e.n % (select count(*) from big_d)
    union all
    select x.id, x.city_id, x.centroid from d x where not e.in_big and x.r = 1 + e.n % (select count(*) from d)
  ) dd on true;

insert into public.event_private_details (event_id, location_label, exact_point)
select e.id, 'Saha ' || e.n, case when e.has_pin then x.public_point end
  from ev e join public.events x on x.id = e.id;

-- ---- ~500 000 participations: the organizer plus up to ~6 others per event ----------------------------------------------------
insert into public.event_participations (event_id, user_id, status, is_organizer, requested_at, approved_at, decided_at)
select e.id, e.organizer_id, 'APPROVED', true, e.starts_at - interval '8 days', e.starts_at - interval '8 days',
       e.starts_at - interval '8 days'
  from ev e where e.status <> 'DRAFT';

insert into public.event_participations (event_id, user_id, status, requested_at, approved_at, decided_at, waitlisted_at)
select e.id, u.id,
       case when k <= 3 then 'APPROVED' when k = 4 then 'REQUESTED' when k = 5 then 'WAITLISTED' else 'CANCELED' end
         ::public.participation_status,
       e.starts_at - interval '6 days',
       case when k <= 3 then e.starts_at - interval '5 days' end,
       case when k <= 3 then e.starts_at - interval '5 days' end,
       case when k = 5 then e.starts_at - interval '5 days' end
  from ev e
  cross join generate_series(1, 6) k
  join load_users u on u.n = 1 + (e.n * 13 + k * 101) % 3000
 where e.status <> 'DRAFT' and u.id <> e.organizer_id and (e.n + k) % 7 <> 0
on conflict (event_id, user_id) do nothing;

update public.events x set approved_count = least(x.capacity, c.n)
  from (select event_id, count(*) n from public.event_participations where status = 'APPROVED' group by 1) c
 where c.event_id = x.id;

-- ---- scenario fixtures ------------------------------------------------------------------------------------------------
-- join storm: an empty football 11v11 event (capacity 30) with a waitlist.
-- race: tennis singles with the organizer in it and 50 requests for the one free place.
-- queue: an event whose organizer has 500 open requests.
-- fanout: a group run with 99 approved players, to be canceled.
-- sweep: 10 000 published events that ended an hour ago, for complete_due_events.
create temp table fx (k text primary key, event_id uuid, organizer_id uuid);
do $$
declare
  ank uuid := (select id from public.cities where slug = 'ankara');
  can uuid := (select id from public.districts where slug = 'cankaya' and city_id = (select id from public.cities where slug = 'ankara'));
  fx_spec record;
  v_id uuid;
begin
  for fx_spec in
    select * from (values
      ('storm', 'football', '11v11', 30, 3001),
      ('race', 'tennis', 'singles', 2, 3002),
      ('queue', 'football', '5v5', 12, 3003),
      ('fanout', 'running', 'group-run', 100, 3004),
      ('burst', 'football', '11v11', 30, 3005)) s(k, sport, fmt, cap, org)
  loop
    insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
    values (('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid, 'load-' || fx_spec.org || '@test.invalid',
            now(), 'authenticated', 'authenticated', now(), now());
    insert into public.profiles (id, display_name, adult_confirmed_at, onboarded_at, created_at)
    values (('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid, 'Yük düzenleyen ' || fx_spec.k, now(), now(),
            now() - interval '60 days')
    on conflict (id) do update set adult_confirmed_at = now(), onboarded_at = now(), created_at = now() - interval '60 days';
    insert into public.user_consents (user_id, kind, version)
    select ('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid, k.kind::public.consent_kind,
           (select c.value #>> '{}' from public.app_config c where c.key = k.key)
      from (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key);
    v_id := gen_random_uuid();
    insert into public.events (id, organizer_id, client_request_id, sport_id, sport_format_id, title, status, starts_at,
      duration_minutes, ends_at, city_id, district_id, location_visibility, public_location_label, capacity, approved_count,
      waitlist_enabled, published_at, public_point, public_point_precision)
    select v_id, ('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid, gen_random_uuid(), s.id, f.id,
           'Yük ' || fx_spec.k, 'PUBLISHED', now() + interval '5 days', 90, now() + interval '5 days 90 minutes', ank, can,
           'PUBLIC', 'Saha ' || fx_spec.k, fx_spec.cap, 1, true, now(),
           (select centroid from public.districts where id = can), 'DISTRICT'
      from public.sports s join public.sport_formats f on f.sport_id = s.id and f.slug = fx_spec.fmt where s.slug = fx_spec.sport;
    insert into public.event_private_details (event_id, location_label) values (v_id, 'Saha ' || fx_spec.k);
    insert into public.event_participations (event_id, user_id, status, is_organizer, approved_at, decided_at)
    values (v_id, ('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid, 'APPROVED', true, now(), now());
    insert into fx values (fx_spec.k, v_id, ('00000000-0000-4000-9000-' || lpad(fx_spec.org::text, 12, '0'))::uuid);
  end loop;
end $$;
insert into public.event_participations (event_id, user_id, status, requested_at)
select (select event_id from fx where k = 'race'), id, 'REQUESTED', now() - n * interval '1 second'
  from load_users where n between 1 and 50;
insert into public.event_participations (event_id, user_id, status, requested_at)
select (select event_id from fx where k = 'queue'), id, 'REQUESTED', now() - n * interval '1 second'
  from load_users where n between 101 and 600;
insert into public.event_participations (event_id, user_id, status, approved_at, decided_at)
select (select event_id from fx where k = 'fanout'), id, 'APPROVED', now(), now() from load_users where n between 701 and 799;
update public.events set approved_count = 100 where id = (select event_id from fx where k = 'fanout');

insert into public.events (id, organizer_id, client_request_id, sport_id, sport_format_id, title, status, starts_at,
  duration_minutes, ends_at, city_id, district_id, location_visibility, public_location_label, capacity, approved_count,
  published_at, public_point, public_point_precision)
select gen_random_uuid(), (select id from load_users where n = 1 + g % 3000), gen_random_uuid(), f.sport_id, f.format_id,
       'Biten maç ' || g, 'PUBLISHED', now() - interval '150 minutes', 90, now() - interval '60 minutes',
       (select city_id from big_d where r = 1), (select id from big_d where r = 1), 'PUBLIC', 'Saha', f.capacity, 1,
       now() - interval '9 days', (select centroid from big_d where r = 1), 'DISTRICT'
  from generate_series(1, 10000) g join fmt f on f.r = 1;

set session_replication_role = origin;
analyze public.events, public.event_participations, public.event_private_details, public.profiles;

select json_build_object(
  'events', (select count(*) from public.events),
  'participations', (select count(*) from public.event_participations),
  'fixtures', (select json_object_agg(k, json_build_object('event_id', event_id, 'organizer_id', organizer_id)) from fx),
  'race_participations', (select json_agg(p.id) from public.event_participations p
                           where p.event_id = (select event_id from fx where k = 'race') and p.status = 'REQUESTED'),
  'cities', (select json_agg(id) from (select id from public.cities order by random() limit 20) c),
  'sports', (select json_agg(id) from public.sports),
  'players_from', '00000000-0000-4000-9000-000000000001') as seed;
