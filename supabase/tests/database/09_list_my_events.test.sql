-- Phase 3 / M3b: My Events (list_my_events). Everything is scoped to the caller: other people's drafts,
-- requests and events must never show up, and hidden places only appear to approved players.
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
create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;

-- Far ahead (200+ days) so nothing else on the local database interferes.
create function pg_temp.input(p_title text, p_days int, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title,
    'starts_at', (now() + make_interval(days => 200 + p_days))::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 12) || p_over;
$$;

create function pg_temp.titles(p_bucket text, p_cursor jsonb default null)
returns text[] language sql as $$
  select coalesce(array_agg(t.i ->> 'title' order by t.n), array[]::text[])
    from jsonb_array_elements(public.list_my_events(p_bucket, p_cursor) -> 'items') with ordinality t(i, n);
$$;
create function pg_temp.item(p_bucket text, p_title text)
returns jsonb language sql as $$
  select i from jsonb_array_elements(public.list_my_events(p_bucket) -> 'items') i where i ->> 'title' = p_title;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

-- 01 organizer A · 02 organizer A2 · 03 player B · 04 stranger C
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select ('00000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'u9-' || n || '@test.invalid',
       now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000009%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000009%';

-- ---- grants ---------------------------------------------------------------------------------------------------
select function_privs_are('public', 'list_my_events', array['text', 'jsonb', 'integer'], 'anon', array[]::text[],
  'guests cannot list My Events');
select function_privs_are('public', 'list_my_events', array['text', 'jsonb', 'integer'], 'authenticated', array['EXECUTE'],
  'signed-in users can');

-- ---- fixtures -------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S9 Taslak', 1), false));
insert into ids values ('up1', public.create_event(gen_random_uuid(), pg_temp.input('S9 Yaklaşan 1', 2), true));
insert into ids values ('up2', public.create_event(gen_random_uuid(), pg_temp.input('S9 Yaklaşan 2', 3), true));
insert into ids values ('canc', public.create_event(gen_random_uuid(), pg_temp.input('S9 İptal', 4), true));

select pg_temp.act_as('00000000-0000-4000-8000-000000000902');
insert into ids values ('x', public.create_event(gen_random_uuid(),
  pg_temp.input('S9 Bekleyen', 5, '{"location_visibility": "APPROVED_ONLY"}'), true));
insert into ids values ('y', public.create_event(gen_random_uuid(), pg_temp.input('S9 Yedek', 6), true));
insert into ids values ('z', public.create_event(gen_random_uuid(),
  pg_temp.input('S9 Onaylı', 7, '{"location_visibility": "APPROVED_ONLY"}'), true));

reset role;
-- B: pending on x, waitlisted on y, approved on z and on the event that gets canceled.
insert into public.event_participations (event_id, user_id, status)
select (select v from ids where k = e.k), '00000000-0000-4000-8000-000000000903', 'REQUESTED'
  from (values ('x'), ('z'), ('canc')) e(k);
insert into public.event_participations (event_id, user_id, status, waitlisted_at)
values ((select v from ids where k = 'y'), '00000000-0000-4000-8000-000000000903', 'WAITLISTED', now());
update public.event_participations set status = 'APPROVED', approved_at = now()
 where user_id = '00000000-0000-4000-8000-000000000903'
   and event_id in ((select v from ids where k = 'z'), (select v from ids where k = 'canc'));

select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
select lives_ok($$select public.cancel_event((select v from ids where k = 'canc'), 'WEATHER', null)$$,
  'fixture: the organizer cancels one event');

-- ---- organizer view ---------------------------------------------------------------------------------------------
select is(pg_temp.titles('ORGANIZING'), array['S9 Taslak', 'S9 Yaklaşan 1', 'S9 Yaklaşan 2'],
  'ORGANIZING lists my drafts and upcoming events by start time, not the canceled one');
select is(pg_temp.item('ORGANIZING', 'S9 Taslak') ->> 'status', 'DRAFT', 'a draft is marked as such');
select is(pg_temp.item('ORGANIZING', 'S9 Yaklaşan 1') ->> 'my_status', 'ORGANIZER', 'my own events say ORGANIZER');
select is(pg_temp.titles('PAST'), array['S9 İptal'], 'PAST holds my canceled event');
select is(pg_temp.titles('PENDING') || pg_temp.titles('APPROVED') || pg_temp.titles('WAITLISTED'), array[]::text[],
  'an organizer without requests has nothing in the participant buckets');

select pg_temp.act_as('00000000-0000-4000-8000-000000000902');
select is(pg_temp.titles('ORGANIZING'), array['S9 Bekleyen', 'S9 Yedek', 'S9 Onaylı'], 'the second organizer sees only their own');
select is((pg_temp.item('ORGANIZING', 'S9 Bekleyen') ->> 'pending_count')::int, 1,
  'an organized event carries its pending-request count');
select is((pg_temp.item('ORGANIZING', 'S9 Yedek') ->> 'pending_count')::int, 0, '... and zero when nobody asked');

-- ---- participant view -------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000903');
select is(pg_temp.titles('PENDING'), array['S9 Bekleyen'], 'PENDING: my open request');
select is(pg_temp.titles('WAITLISTED'), array['S9 Yedek'], 'WAITLISTED: my waitlist place');
select is(pg_temp.titles('APPROVED'), array['S9 Onaylı'], 'APPROVED: upcoming events I may attend');
select is(pg_temp.titles('PAST'), array['S9 İptal'], 'PAST: a canceled event I was approved for');
select is(pg_temp.titles('ORGANIZING'), array[]::text[], 'I do not organize anything');
select is(pg_temp.item('PENDING', 'S9 Bekleyen') ->> 'my_status', 'REQUESTED', 'the row says what my status is');
select is(pg_temp.item('PENDING', 'S9 Bekleyen') -> 'place_label', 'null'::jsonb,
  'a hidden place stays hidden while my request is pending');
select is(pg_temp.item('APPROVED', 'S9 Onaylı') ->> 'place_label', 'ODTÜ Halı Saha 2',
  'once approved I see the real place');
select is(pg_temp.item('PENDING', 'S9 Bekleyen') ->> 'pending_count', null, 'a participant never sees the request counts');
select is(pg_temp.titles('PENDING') && array['S9 Taslak'], false, 'no bucket shows someone else''s draft');

-- ---- a stranger --------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000904');
select is(pg_temp.titles('ORGANIZING') || pg_temp.titles('PENDING') || pg_temp.titles('APPROVED')
          || pg_temp.titles('WAITLISTED') || pg_temp.titles('PAST'), array[]::text[],
  'someone unrelated to every fixture sees none of them');

-- ---- paging -----------------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
select is((public.list_my_events('ORGANIZING', null, 2) -> 'items') -> 1 ->> 'title', 'S9 Yaklaşan 1', 'page one has two items');
select isnt(public.list_my_events('ORGANIZING', null, 2) -> 'next_cursor', 'null'::jsonb, 'and a cursor');
select is(array(select i ->> 'title' from jsonb_array_elements(
    public.list_my_events('ORGANIZING', public.list_my_events('ORGANIZING', null, 2) -> 'next_cursor', 2) -> 'items') i),
  array['S9 Yaklaşan 2'], 'the cursor continues without repeats');
select is(public.list_my_events('ORGANIZING', public.list_my_events('ORGANIZING', null, 2) -> 'next_cursor', 2) -> 'next_cursor',
  'null'::jsonb, 'the last page has no cursor');
select ok(jsonb_array_length(public.list_my_events('ORGANIZING', null, 100000) -> 'items') <= 50, 'page size is capped at 50');

-- ---- bad input --------------------------------------------------------------------------------------------------------
select throws_ok($$select public.list_my_events('EVERYTHING')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown bucket');
select throws_ok($$select public.list_my_events(null)$$, 'P0001', 'VALIDATION_FAILED', 'no bucket');
select throws_ok($$select public.list_my_events('PAST', null, 0)$$, 'P0001', 'VALIDATION_FAILED', 'a page size of zero');
select throws_ok($$select public.list_my_events('PAST', '{"starts_at": "x", "id": "y"}')$$, 'P0001', 'VALIDATION_FAILED',
  'a malformed cursor');
select pg_temp.act_as_anon();
select throws_ok($$select public.list_my_events('PAST')$$, '42501', null, 'guests are refused');

select * from finish();
rollback;
