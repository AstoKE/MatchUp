-- Phase 6 / M1: blocking (S-8, S-12). Each path both ways: whoever blocked, neither side can find, join or review the other.
begin;
select plan(46);

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
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000020' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.status(k text, n int) returns text language sql as $$
  select status::text from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.input(p_title text) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '280 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12);
$$;
create function pg_temp.make(p_key text, p_org int) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_org));
  insert into ids values (p_key, public.create_event(gen_random_uuid(), pg_temp.input('S20 ' || p_key), true));
  reset role;
end;
$$;
create function pg_temp.ask(p_key text, p_who int) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_who));
  perform public.request_join(pg_temp.ev(p_key));
  reset role;
end;
$$;
create function pg_temp.seen(p_who int, p_key text) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.act_as(pg_temp.u(p_who));
  r := exists (select 1 from jsonb_array_elements(public.search_events() -> 'items') i
                where i ->> 'id' = pg_temp.ev(p_key)::text);
  reset role;
  return r;
end;
$$;
create function pg_temp.page(p_who int, p_key text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(p_who));
  r := public.get_event(pg_temp.ev(p_key));
  reset role;
  return r;
end;
$$;

-- 01 organizer · 02 blocks the organizer · 03 is blocked by the organizer · 04 unrelated · 05 approved, then blocked ·
-- 06 waitlisted, then blocked · 07 and 08 fellow players who block each other · 09 target that gets deleted
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u20-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000020%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000020%';

select pg_temp.make('main', 1);
select pg_temp.make('q', 1);
select pg_temp.ask('main', n) from unnest(array[2, 5, 6, 7, 8]) n;
select pg_temp.ask('q', 3);
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part('main', n)) from unnest(array[5, 7, 8]) n;
select public.waitlist_participation(pg_temp.part('main', 6));
reset role;

-- ---- access ----------------------------------------------------------------------------------------------------------
select table_privs_are('public', 'user_blocks', 'authenticated', array['SELECT'], 'users may only read blocks');
select table_privs_are('public', 'user_blocks', 'anon', array[]::text[], 'guests read nothing');
select function_privs_are('public', 'block_user', array['uuid'], 'anon', array[]::text[], 'guests cannot block');
select function_privs_are('public', 'unblock_user', array['uuid'], 'anon', array[]::text[], 'guests cannot unblock');
select function_privs_are('public', 'list_my_blocks', array[]::text[], 'anon', array[]::text[], 'guests have no list');
select function_privs_are('private', 'is_blocked_pair', array['uuid', 'uuid'], 'authenticated', array[]::text[],
  'nobody can ask whether two other people blocked each other');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format($$select public.block_user(%L)$$, pg_temp.u(2)), 'P0001', 'VALIDATION_FAILED', 'not yourself');
select throws_ok($$select public.block_user(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'not someone who does not exist');
select throws_ok(format($$insert into public.user_blocks (blocker_id, blocked_id) values (%L, %L)$$, pg_temp.u(2), pg_temp.u(4)),
  '42501', null, 'no direct writes');
reset role;

select ok(pg_temp.seen(2, 'main'), 'before: the event can be found');

-- ---- 02 blocks the organizer; the organizer blocks 03, 05 and 06 ------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select public.block_user(pg_temp.u(1));
select lives_ok(format($$select public.block_user(%L)$$, pg_temp.u(1)), 'blocking twice is harmless');
reset role;
select pg_temp.act_as(pg_temp.u(1));
select public.block_user(pg_temp.u(n)) from unnest(array[3, 5, 6]) n;
reset role;

select is(pg_temp.status('main', 2), 'REJECTED', 'the blocker''s own open request is closed');
select is(pg_temp.status('q', 3), 'REJECTED', 'an open request of the blocked person is rejected');
select is(pg_temp.status('main', 6), 'REJECTED', 'a waitlisted one too');
select is(pg_temp.status('main', 5), 'APPROVED', 'someone already approved stays approved: removing them would tell them');
select is((select count(*)::int from public.notifications where user_id in (pg_temp.u(2), pg_temp.u(3), pg_temp.u(6))
            and type = 'REQUEST_REJECTED'), 0, 'nobody is told');

-- ---- finding and opening ------------------------------------------------------------------------------------------------
select ok(not pg_temp.seen(2, 'main'), 'the blocker does not find the organizer''s events');
select ok(not pg_temp.seen(3, 'main'), 'nor does the blocked person');
select ok(pg_temp.seen(4, 'main'), 'someone else still does');
select is(pg_temp.page(2, 'main'), null, 'the page does not exist for the blocker');
select is(pg_temp.page(3, 'main'), null, 'nor for the blocked person');
select ok(pg_temp.page(5, 'main') is not null, 'someone already approved keeps the page');
select ok(pg_temp.page(4, 'main') is not null, 'and so does anyone else');

-- ---- direct table reads --------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(3));
select is((select count(*)::int from public.events where id = pg_temp.ev('main')), 0, 'the table hides the event too');
select is((select count(*)::int from public.profiles where id = pg_temp.u(1)), 0, 'and the profile');
reset role;
select pg_temp.act_as(pg_temp.u(5));
select is((select count(*)::int from public.events where id = pg_temp.ev('main')), 1, 'an approved player still reads the event');
select pg_temp.act_as(pg_temp.u(2));
select is((select count(*)::int from public.user_blocks), 1, 'I see my own block');
select pg_temp.act_as(pg_temp.u(1));
select is((select count(*)::int from public.user_blocks where blocked_id = pg_temp.u(1)), 0, 'being blocked is never revealed');
reset role;

-- ---- joining: the same answer as a missing event ----------------------------------------------------------------------------
select pg_temp.make('new', 1);
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format($$select public.request_join(%L)$$, pg_temp.ev('new')), 'P0001', 'NOT_FOUND', 'the blocked person cannot ask');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format($$select public.request_join(%L)$$, pg_temp.ev('new')), 'P0001', 'NOT_FOUND', 'nor can the blocker');
select throws_ok($$select public.request_join(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'the same as for a missing event');
reset role;
-- The second line: even past the RPC, nobody enters.
select throws_ok(format($$insert into public.event_participations (event_id, user_id, status) values (%L, %L, 'REQUESTED')$$,
  pg_temp.ev('new'), pg_temp.u(3)), 'P0001', 'NOT_FOUND', 'the trigger refuses a direct insert');
-- Answered before anything about the event is said: "registration closed" would admit that it exists.
select pg_temp.make('gone', 1);
update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.ev('gone');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format($$select public.request_join(%L)$$, pg_temp.ev('gone')), 'P0001', 'NOT_FOUND',
  'a started event does not reveal itself to a blocked person');
reset role;

-- ---- rosters and reviews between players -----------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(7));
select public.block_user(pg_temp.u(8));
reset role;
select is((select count(*)::int from jsonb_array_elements(pg_temp.page(8, 'main') -> 'participants') p where p ->> 'display_name' = 'Kişi 07'), 0,
  'a fellow player is left out of the roster, for the blocked person');
select is((select count(*)::int from jsonb_array_elements(pg_temp.page(7, 'main') -> 'participants') p where p ->> 'display_name' = 'Kişi 08'), 0,
  'and for the blocker');
select is((select count(*)::int from jsonb_array_elements(pg_temp.page(1, 'main') -> 'participants') p where p ->> 'display_name' = 'Kişi 08'), 1,
  'the organizer still sees everyone');

reset role;
update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.ev('main');
select pg_temp.act_as(pg_temp.u(1));
select public.mark_attendance(pg_temp.part('main', n), 'PRESENT') from unnest(array[5, 7, 8]) n;
select public.finalize_attendance(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(7));
select is((select count(*)::int from jsonb_array_elements(public.get_event_reviews(pg_temp.ev('main')) -> 'targets') t where t ->> 'user_id' = pg_temp.u(8)::text), 0,
  'the review list leaves out someone blocked');
select throws_ok(format($$select public.submit_reviews(%L, jsonb_build_array(jsonb_build_object('reviewee_id', %L::text, 'skill_score', 5)))$$,
  pg_temp.ev('main'), pg_temp.u(8)), 'P0001', 'REVIEW_NOT_ELIGIBLE', 'a review of someone I blocked is refused');
select pg_temp.act_as(pg_temp.u(8));
select throws_ok(format($$select public.submit_reviews(%L, jsonb_build_array(jsonb_build_object('reviewee_id', %L::text, 'skill_score', 1)))$$,
  pg_temp.ev('main'), pg_temp.u(7)), 'P0001', 'REVIEW_NOT_ELIGIBLE', 'and so is a review of someone who blocked me');
reset role;

-- ---- unblocking ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(jsonb_array_length(public.list_my_blocks()), 1, 'my list has the person');
select is(public.list_my_blocks() -> 0 ->> 'display_name', 'Kişi 01', 'with the display name');
select public.unblock_user(pg_temp.u(1));
select is(jsonb_array_length(public.list_my_blocks()), 0, 'unblocked');
reset role;
select ok(pg_temp.seen(2, 'new'), 'the events are found again');

-- ---- account lifecycle (ADR-0017) -----------------------------------------------------------------------------------------------
select is(jsonb_array_length(private.export_event_data(pg_temp.u(1)) -> 'blocks'), 3, 'blocks are in the export');
select pg_temp.act_as(pg_temp.u(9));
select public.block_user(pg_temp.u(4));
reset role;
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(9);
select ok(private.purge_account(pg_temp.u(9)), 'the account is purged');
select is((select count(*)::int from public.user_blocks where blocker_id = pg_temp.u(9) or blocked_id = pg_temp.u(9)), 0, 'its blocks are gone');

select * from finish();
rollback;
