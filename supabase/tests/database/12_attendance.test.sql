-- Phase 5 / M1: attendance marks, finalization, disputes, the admin resolution, the two cron sweeps and the
-- account export / purge. Every arrow of DATABASE §6.3 has a passing and a failing case; strangers, players,
-- guests and not-onboarded users are refused. Concurrency (mark racing finalize) is proven separately with real
-- parallel connections (packages/db-tests, attendance-concurrency).
begin;
select plan(90);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
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
  select ('00000000-0000-4000-8000-0000000012' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.input(p_title text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title,
    'starts_at', (now() + interval '230 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 10) || p_over;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.att(k text, n int) returns text language sql as $$
  select attendance::text from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.estatus(k text) returns text language sql as $$
  select status::text from public.events where id = pg_temp.ev(k);
$$;
create function pg_temp.fin(k text) returns timestamptz language sql as $$
  select attendance_finalized_at from public.events where id = pg_temp.ev(k);
$$;

-- 01 organizer O · 02..06 players · 07 stranger · 08 not onboarded · 09 organizer Q · 10 platform admin
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u12-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 10) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000012%' and id <> pg_temp.u(8);
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000012%' and p.onboarded_at is not null;
insert into public.platform_admins (user_id) values (pg_temp.u(10));

-- ---- grants ------------------------------------------------------------------------------------------------
select function_privs_are('public', 'mark_attendance', array['uuid', 'attendance_status'], 'anon', array[]::text[], 'guests cannot mark');
select function_privs_are('public', 'mark_attendance', array['uuid', 'attendance_status'], 'authenticated', array['EXECUTE'], 'users can call mark_attendance');
select function_privs_are('public', 'finalize_attendance', array['uuid'], 'anon', array[]::text[], 'guests cannot finalize');
select function_privs_are('public', 'dispute_attendance', array['uuid', 'text'], 'anon', array[]::text[], 'guests cannot dispute');
select function_privs_are('public', 'admin_resolve_attendance_dispute', array['uuid', 'attendance_status'], 'anon', array[]::text[], 'guests cannot resolve');
select function_privs_are('private', 'finalize_event_row', array['uuid'], 'authenticated', array[]::text[], 'finalization internals are not callable');
select function_privs_are('private', 'complete_due_events', array[]::text[], 'authenticated', array[]::text[], 'the sweeps are not callable by users');
select function_privs_are('private', 'auto_finalize_attendance', array[]::text[], 'authenticated', array[]::text[], 'the finalize sweep is not callable by users');
select table_privs_are('public', 'attendance_disputes', 'authenticated', array['SELECT'], 'users may only read disputes');
select table_privs_are('public', 'attendance_disputes', 'anon', array[]::text[], 'guests may not touch disputes');

-- ---- fixtures: events are published in the future, players approved, then moved into the past -----------------
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('m', public.create_event(gen_random_uuid(), pg_temp.input('S12 Ana'), true));
insert into ids values ('fut', public.create_event(gen_random_uuid(), pg_temp.input('S12 Gelecek'), true));
insert into ids values ('m2', public.create_event(gen_random_uuid(), pg_temp.input('S12 Kesinleşmemiş'), true));
insert into ids values ('old', public.create_event(gen_random_uuid(), pg_temp.input('S12 Eski'), true));
-- A per-organizer quota limits open events, so the sweep fixtures belong to the second organizer.
select pg_temp.act_as(pg_temp.u(9));
insert into ids values ('due', public.create_event(gen_random_uuid(), pg_temp.input('S12 Bitmiş'), true));
insert into ids values ('stale', public.create_event(gen_random_uuid(), pg_temp.input('S12 Bayat'), true));
insert into ids values ('fresh', public.create_event(gen_random_uuid(), pg_temp.input('S12 Taze'), true));
select pg_temp.act_as(pg_temp.u(2));
select public.request_join(pg_temp.ev('m'));
select public.request_join(pg_temp.ev('fut'));
select public.request_join(pg_temp.ev('m2'));
select public.request_join(pg_temp.ev('old'));
select pg_temp.act_as(pg_temp.u(3));
select public.request_join(pg_temp.ev('m'));
select public.request_join(pg_temp.ev('m2'));
select pg_temp.act_as(pg_temp.u(4));
select public.request_join(pg_temp.ev('m'));
select pg_temp.act_as(pg_temp.u(5));
select public.request_join(pg_temp.ev('m'));  -- stays REQUESTED
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part('m', 2));
select public.approve_participation(pg_temp.part('m', 3));
select public.approve_participation(pg_temp.part('m', 4));
select public.approve_participation(pg_temp.part('fut', 2));
select public.approve_participation(pg_temp.part('m2', 2));
select public.approve_participation(pg_temp.part('m2', 3));
select public.approve_participation(pg_temp.part('old', 2));

reset role;
-- Started 1 h ago (the owner role moves time; organizers cannot).
update public.events set starts_at = now() - interval '1 hour'
 where id in (pg_temp.ev('m'), pg_temp.ev('m2'), pg_temp.ev('old'));
select is(pg_temp.att('m', 1), 'PRESENT', 'the organizer''s own row is PRESENT from the start');
select is((select attendance_marked_by from public.event_participations where event_id = pg_temp.ev('m') and user_id = pg_temp.u(1)),
  pg_temp.u(1), '... marked by themselves');

-- ---- mark_attendance: refusals ---------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, '42501', null, 'guests are refused');
select pg_temp.act_as(pg_temp.u(8));
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'P0001', 'ONBOARDING_REQUIRED', 'users who have not onboarded are refused');
select pg_temp.act_as(pg_temp.u(7));
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'P0001', 'NOT_FOUND', 'a stranger cannot mark (indistinguishable from missing)');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 3), 'PRESENT')$$, 'P0001', 'NOT_FOUND', 'a player cannot mark another player');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'P0001', 'NOT_FOUND', '... nor themselves');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'P0001', 'NOT_FOUND', 'another organizer cannot mark');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.mark_attendance(gen_random_uuid(), 'PRESENT')$$, 'P0001', 'NOT_FOUND', 'an unknown participation');
select throws_ok($$select public.mark_attendance(pg_temp.part('fut', 2), 'PRESENT')$$, 'P0001', 'INVALID_TRANSITION', 'nothing can be marked before the start');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 1), 'ABSENT')$$, 'P0001', 'INVALID_TRANSITION', 'the organizer''s own row is self-attested and fixed');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 5), 'PRESENT')$$, 'P0001', 'INVALID_TRANSITION', 'a request that was never approved cannot be marked');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'NOT_CONFIRMED')$$, 'P0001', 'VALIDATION_FAILED', 'NOT_CONFIRMED is not a mark');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'DISPUTED')$$, 'P0001', 'VALIDATION_FAILED', 'DISPUTED is not a mark');

-- ---- mark_attendance: the transitions ---------------------------------------------------------------------------
select lives_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'NOT_CONFIRMED to PRESENT');
select is(pg_temp.att('m', 2), 'PRESENT', '... stored');
select is((select attendance_marked_by from public.event_participations where id = pg_temp.part('m', 2)), pg_temp.u(1), '... with who marked it');
select lives_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'marking the same value again is idempotent');
select lives_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'ABSENT')$$, 'PRESENT to ABSENT (a correction before finalization)');
select lives_ok($$select public.mark_attendance(pg_temp.part('m', 2), 'PRESENT')$$, 'ABSENT to PRESENT (a correction)');
select lives_ok($$select public.mark_attendance(pg_temp.part('m', 3), 'ABSENT')$$, 'NOT_CONFIRMED to ABSENT');
select is(pg_temp.att('m', 3), 'ABSENT', '... stored');
select is(pg_temp.att('m', 4), 'NOT_CONFIRMED', 'an unmarked player stays NOT_CONFIRMED');

-- The database refuses a skipped transition even from the owner role (I-3).
reset role;
select throws_ok($$update public.event_participations set attendance = 'DISPUTED' where id = pg_temp.part('m', 2)$$,
  'P0001', 'INVALID_TRANSITION', 'PRESENT cannot jump to DISPUTED');
select throws_ok($$update public.event_participations set attendance = 'ABSENT' where id = pg_temp.part('m', 1)$$,
  'P0001', 'INVALID_TRANSITION', 'the organizer''s own row cannot change even at the table level');
select throws_ok($$update public.event_participations set attendance = 'PRESENT' where id = pg_temp.part('m', 5)$$,
  '23514', null, 'attendance on a row that is not APPROVED is refused (I-4)');

-- ---- finalize_attendance ---------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, '42501', null, 'guests cannot finalize');
select pg_temp.act_as(pg_temp.u(8));
select throws_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, 'P0001', 'ONBOARDING_REQUIRED', 'not-onboarded users cannot finalize');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, 'P0001', 'NOT_FOUND', 'a player cannot finalize');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, 'P0001', 'NOT_FOUND', 'another organizer cannot finalize');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.finalize_attendance(pg_temp.ev('fut'))$$, 'P0001', 'INVALID_TRANSITION', 'a future event cannot be finalized');
select throws_ok($$select public.finalize_attendance(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'an unknown event');
select lives_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, 'the organizer finalizes a started event');
select is(pg_temp.estatus('m'), 'COMPLETED', '... which completes it');
select ok(pg_temp.fin('m') is not null, '... and records when');
select is((select review_window_closes_at - attendance_finalized_at from public.events where id = pg_temp.ev('m')),
  interval '72 hours', '... opening a 72 h review window');
select is(pg_temp.att('m', 4), 'NOT_CONFIRMED', 'an unmarked player stays neutral after finalization');
select lives_ok($$select public.finalize_attendance(pg_temp.ev('m'))$$, 'finalizing twice is idempotent');
select throws_ok($$select public.mark_attendance(pg_temp.part('m', 4), 'PRESENT')$$, 'P0001', 'INVALID_TRANSITION', 'marks are frozen after finalization');
reset role;
select throws_ok($$update public.events set title = 'Oynanmış maçın adı' where id = pg_temp.ev('m')$$,
  'P0001', 'INVALID_TRANSITION', 'a finalized event is still frozen (I-7)');
select throws_ok($$update public.events set attendance_finalized_at = now() - interval '1 day' where id = pg_temp.ev('m')$$,
  'P0001', 'INVALID_TRANSITION', 'finalization cannot be rewritten');

-- ---- disputes ------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 3), 'Ben oradaydım')$$, 'P0001', 'NOT_FOUND', 'a player cannot dispute someone else''s mark');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 3), 'Ben oradaydım')$$, 'P0001', 'NOT_FOUND', 'the organizer cannot dispute for a player');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 3), '   ')$$, 'P0001', 'VALIDATION_FAILED', 'a blank reason is refused');
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 3), repeat('x', 501))$$, 'P0001', 'VALIDATION_FAILED', 'a reason over 500 characters is refused');
select lives_ok($$select public.dispute_attendance(pg_temp.part('m', 3), 'Ben oradaydım, saat 20:05 geldim')$$, 'ABSENT to DISPUTED within the window');
select is(pg_temp.att('m', 3), 'DISPUTED', '... stored');
select is((select count(*)::int from public.attendance_disputes where participation_id = pg_temp.part('m', 3) and status = 'OPEN'), 1, '... with an open dispute row');
select lives_ok($$select public.dispute_attendance(pg_temp.part('m', 3), 'Ben oradaydım, saat 20:05 geldim')$$, 'disputing again is idempotent');
select is((select count(*)::int from public.attendance_disputes where participation_id = pg_temp.part('m', 3)), 1, '... and does not duplicate');
select is((select count(*)::int from public.attendance_disputes), 1, 'the player sees their own dispute');
select pg_temp.act_as(pg_temp.u(1));
select is((select count(*)::int from public.attendance_disputes), 1, 'the organizer sees it too');
select pg_temp.act_as(pg_temp.u(7));
select is((select count(*)::int from public.attendance_disputes), 0, 'a stranger sees nothing');
select pg_temp.act_as_anon();
select throws_ok($$select count(*) from public.attendance_disputes$$, '42501', null, 'guests cannot read disputes');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 2), 'x')$$, 'P0001', 'INVALID_TRANSITION', 'only an ABSENT mark can be disputed');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 1), 'x')$$, 'P0001', 'INVALID_TRANSITION', 'the organizer''s own row cannot be disputed');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m', 4), 'x')$$, 'P0001', 'INVALID_TRANSITION', 'a neutral NOT_CONFIRMED row has nothing to dispute');

-- Not finalized yet: nothing to dispute.
select pg_temp.act_as(pg_temp.u(1));
select public.mark_attendance(pg_temp.part('m2', 3), 'ABSENT');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$select public.dispute_attendance(pg_temp.part('m2', 3), 'x')$$, 'P0001', 'INVALID_TRANSITION', 'a mark can only be disputed after finalization');

-- Window closed: finalized four days ago.
reset role;
update public.events set status = 'COMPLETED', completed_at = now() - interval '5 days' where id = pg_temp.ev('old');
update public.events set attendance_finalized_at = now() - interval '4 days', review_window_closes_at = now() - interval '1 day'
 where id = pg_temp.ev('old');
update public.event_participations set attendance = 'ABSENT' where id = pg_temp.part('old', 2);
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.dispute_attendance(pg_temp.part('old', 2), 'x')$$, 'P0001', 'WINDOW_CLOSED', 'the 72 h dispute window has closed');

-- ---- admin resolution -----------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 3), 'PRESENT')$$, 'P0001', 'NOT_ALLOWED', 'the organizer cannot resolve a dispute');
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 3), 'PRESENT')$$, 'P0001', 'NOT_ALLOWED', 'the disputing player cannot resolve their own dispute');
select pg_temp.act_as(pg_temp.u(10), 'aal1');
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 3), 'PRESENT')$$, 'P0001', 'NOT_ALLOWED', 'an admin without MFA (aal2) is refused');
select pg_temp.act_as(pg_temp.u(10), 'aal2');
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 3), 'DISPUTED')$$, 'P0001', 'VALIDATION_FAILED', 'the resolution must be PRESENT or ABSENT');
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 2), 'ABSENT')$$, 'P0001', 'INVALID_TRANSITION', 'only a DISPUTED row can be resolved');
select lives_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('m', 3), 'PRESENT')$$, 'an admin with MFA resolves DISPUTED to PRESENT');
select is(pg_temp.att('m', 3), 'PRESENT', '... the mark follows the resolution');
select is((select status || ':' || resolution::text from public.attendance_disputes where participation_id = pg_temp.part('m', 3)), 'RESOLVED:PRESENT', '... and the dispute is closed');
reset role;
select is((select count(*)::int from private.audit_logs where action = 'ATTENDANCE_DISPUTE_RESOLVED' and target_id = pg_temp.part('m', 3)), 1, '... and audited');

-- ---- scheduled sweeps -----------------------------------------------------------------------------------------------------
update public.events set starts_at = now() - interval '3 hours' where id = pg_temp.ev('due');
update public.events set starts_at = now() - interval '4 days', status = 'COMPLETED', completed_at = now() - interval '49 hours'
 where id = pg_temp.ev('stale');
update public.events set starts_at = now() - interval '3 hours', status = 'COMPLETED', completed_at = now() - interval '1 hour'
 where id = pg_temp.ev('fresh');
select ok(private.complete_due_events() >= 1, 'complete_due_events completes events whose end has passed');
select is(pg_temp.estatus('due'), 'COMPLETED', '... the ended event');
select is(pg_temp.estatus('fut'), 'PUBLISHED', '... and leaves a future event alone');
select is(private.complete_due_events(), 0, 'running it again changes nothing (idempotent)');
select ok(private.auto_finalize_attendance() >= 1, 'auto_finalize_attendance finalizes events completed 48 h ago');
select ok(pg_temp.fin('stale') is not null, '... the stale event');
select ok(pg_temp.fin('fresh') is null and pg_temp.fin('due') is null, '... and leaves recently completed events open');
select is(private.auto_finalize_attendance(), 0, 'running it again changes nothing (idempotent)');

-- ---- account export and purge ---------------------------------------------------------------------------------------------
select is((select jsonb_array_length(private.export_event_data(pg_temp.u(3)) -> 'attendance_disputes')), 1, 'the export includes the user''s disputes');
select is(private.export_event_data(pg_temp.u(3)) -> 'attendance_disputes' -> 0 ->> 'reason', 'Ben oradaydım, saat 20:05 geldim', '... with their reason');
select lives_ok($$select private.purge_event_data(pg_temp.u(3))$$, 'the purge runs');
select is((select reason from public.attendance_disputes where participation_id = pg_temp.part('m', 3)), null, '... and removes the free text but keeps the outcome');

select * from finish();
rollback;
