-- Phase 5 / M3a: what finalization causes (reliability signals, XP, the progress cache) and what a dispute changes.
-- RATING_SYSTEM §2, §4, §5, §7. The math itself is compared with the TypeScript reference in packages/db-tests
-- (rating-equivalence); here the rules are exercised on real events. Concurrency: packages/db-tests too.
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
  select ('00000000-0000-4000-8000-0000000014' || lpad(n::text, 2, '0'))::uuid;
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
    'capacity', 12) || p_over;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.sig(k text, n int, p_kind text) returns int language sql as $$
  select count(*)::int from public.reliability_events r
   where r.event_id = pg_temp.ev(k) and r.user_id = pg_temp.u(n) and r.kind = p_kind and r.voided_at is null;
$$;
create function pg_temp.xp(n int, p_reason text) returns int language sql as $$
  select coalesce(sum(amount), 0)::int from public.xp_transactions where user_id = pg_temp.u(n) and reason_code = p_reason;
$$;
create function pg_temp.xp_ev(n int, p_reason text, k text) returns int language sql as $$
  select count(*)::int from public.xp_transactions
   where user_id = pg_temp.u(n) and reason_code = p_reason and source_id = pg_temp.ev(k);
$$;
create function pg_temp.istanbul(p_day_offset int, p_hour int) returns timestamptz language sql as $$
  select ((date_trunc('day', now() at time zone 'Europe/Istanbul') + make_interval(days => p_day_offset, hours => p_hour))
          at time zone 'Europe/Istanbul');
$$;
-- A player requests (as themselves) and is approved by the organizer.
create function pg_temp.join(p_event text, p_player int, p_organizer int) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_player));
  perform public.request_join(pg_temp.ev(p_event));
  perform pg_temp.act_as(pg_temp.u(p_organizer));
  perform public.approve_participation(pg_temp.part(p_event, p_player));
end;
$$;
create function pg_temp.mark(p_event text, p_player int, p_organizer int, p_value text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_organizer));
  perform public.mark_attendance(pg_temp.part(p_event, p_player), p_value::public.attendance_status);
end;
$$;
create function pg_temp.finalize(p_event text, p_organizer int) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_organizer));
  perform public.finalize_attendance(pg_temp.ev(p_event));
end;
$$;

-- 01 organizer O · 02..07 players · 08 NEW organizer · 09 organizer Q · 10 admin · 11 excused canceler · 12..13 players
-- · 14 organizer of the week fixtures · 15 organizer of the week candidate · 16 capped player · 17 player
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u14-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 17) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000014%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000014%';
insert into public.platform_admins (user_id) values (pg_temp.u(10));
-- Everyone but the NEW organizer (08) has had an account for ten days.
update public.profiles set created_at = now() - interval '10 days'
 where id::text like '00000000-0000-4000-8000-0000000014%' and id <> pg_temp.u(8);

-- ---- grants ------------------------------------------------------------------------------------------------------
select table_privs_are('public', 'reliability_events', 'authenticated', array['SELECT'], 'users may only read their signals');
select table_privs_are('public', 'xp_transactions', 'authenticated', array['SELECT'], 'users may only read their ledger');
select table_privs_are('public', 'user_progress', 'authenticated', array['SELECT'], 'users may only read their progress');
select table_privs_are('public', 'xp_transactions', 'anon', array[]::text[], 'guests may not touch the ledger');
select table_privs_are('private', 'rating_config', 'authenticated', array[]::text[], 'the constants are not readable by users');
select function_privs_are('private', 'apply_finalization', array['uuid'], 'authenticated', array[]::text[], 'finalization effects are internal');
select function_privs_are('private', 'award_xp', array['uuid', 'integer', 'text', 'text', 'uuid', 'text'], 'authenticated', array[]::text[], 'awarding XP is internal');
select function_privs_are('private', 'reliability_score', array['double precision[]', 'double precision[]'], 'authenticated', array[]::text[], 'the math is internal');

-- ---- fixtures: events published in the future, players requested and approved, then moved into the past -------------
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('main', public.create_event(gen_random_uuid(), pg_temp.input('S14 Ana'), true));
select pg_temp.act_as(pg_temp.u(8));
insert into ids values ('newb', public.create_event(gen_random_uuid(), pg_temp.input('S14 Yeni hesap'), true));
select pg_temp.act_as(pg_temp.u(9));
insert into ids values ('thin', public.create_event(gen_random_uuid(), pg_temp.input('S14 İnce'), true));
insert into ids values ('c1', public.create_event(gen_random_uuid(), pg_temp.input('S14 Gün 1'), true));
insert into ids values ('c2', public.create_event(gen_random_uuid(), pg_temp.input('S14 Gün 2'), true));
insert into ids values ('c3', public.create_event(gen_random_uuid(), pg_temp.input('S14 Gün 3'), true));
select pg_temp.act_as(pg_temp.u(14));
insert into ids values ('w1', public.create_event(gen_random_uuid(), pg_temp.input('S14 Hafta 1'), true));
insert into ids values ('w2', public.create_event(gen_random_uuid(), pg_temp.input('S14 Hafta 2'), true));
insert into ids values ('w3', public.create_event(gen_random_uuid(), pg_temp.input('S14 Hafta 3'), true));
select pg_temp.act_as(pg_temp.u(15));
insert into ids values ('w4', public.create_event(gen_random_uuid(), pg_temp.input('S14 Hafta 4'), true));

select pg_temp.join('main', n, 1) from unnest(array[2, 3, 4, 5, 6, 7, 11]) n;
select pg_temp.act_as(pg_temp.u(12)); select public.request_join(pg_temp.ev('main'));   -- never approved
select pg_temp.join('newb', n, 8) from unnest(array[2, 3]) n;
select pg_temp.join('thin', n, 9) from unnest(array[13, 12]) n;
select pg_temp.join(k, n, 9) from unnest(array['c1', 'c2', 'c3']) k cross join unnest(array[12, 13]) n;
select pg_temp.join('w4', n, 15) from unnest(array[16, 17]) n;

reset role;
-- Started and ended: main two days ago, the day events on one Istanbul day three days ago, the week events Mon-Thu of a
-- week two weeks back.
update public.events set starts_at = now() - interval '2 days' where id in (pg_temp.ev('main'), pg_temp.ev('newb'), pg_temp.ev('thin'));
update public.events set starts_at = pg_temp.istanbul(-3, 10) where id = pg_temp.ev('c1');
update public.events set starts_at = pg_temp.istanbul(-3, 13) where id = pg_temp.ev('c2');
update public.events set starts_at = pg_temp.istanbul(-3, 16) where id = pg_temp.ev('c3');
update public.events set starts_at = ((date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '14 days' + interval '0 days 10 hours')
                                       at time zone 'Europe/Istanbul') where id = pg_temp.ev('w1');
update public.events set starts_at = ((date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '14 days' + interval '1 days 10 hours')
                                       at time zone 'Europe/Istanbul') where id = pg_temp.ev('w2');
update public.events set starts_at = ((date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '14 days' + interval '2 days 10 hours')
                                       at time zone 'Europe/Istanbul') where id = pg_temp.ev('w3');
update public.events set starts_at = ((date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '14 days' + interval '3 days 10 hours')
                                       at time zone 'Europe/Istanbul') where id = pg_temp.ev('w4');
-- Three cancellations after approval: late (2 h before), early (20 h before), late but excused (1 h before).
update public.event_participations p
   set status = 'CANCELED', approved_at = e.starts_at - interval '5 days', canceled_at = e.starts_at - interval '2 hours',
       cancellation_excused = false
  from public.events e where e.id = p.event_id and p.id = pg_temp.part('main', 6);
update public.event_participations p
   set status = 'CANCELED', approved_at = e.starts_at - interval '5 days', canceled_at = e.starts_at - interval '20 hours',
       cancellation_excused = false
  from public.events e where e.id = p.event_id and p.id = pg_temp.part('main', 7);
update public.event_participations p
   set status = 'CANCELED', approved_at = e.starts_at - interval '5 days', canceled_at = e.starts_at - interval '1 hour',
       cancellation_excused = true
  from public.events e where e.id = p.event_id and p.id = pg_temp.part('main', 11);

-- Marks.
select pg_temp.mark('main', 2, 1, 'PRESENT'); select pg_temp.mark('main', 3, 1, 'PRESENT'); select pg_temp.mark('main', 4, 1, 'ABSENT');
select pg_temp.mark('newb', 2, 8, 'PRESENT'); select pg_temp.mark('newb', 3, 8, 'PRESENT');
select pg_temp.mark('thin', 13, 9, 'PRESENT'); select pg_temp.mark('thin', 12, 9, 'ABSENT');
select pg_temp.mark(k, n, 9, 'PRESENT') from unnest(array['c1', 'c2', 'c3']) k cross join unnest(array[12, 13]) n;
select pg_temp.mark('w4', 16, 15, 'PRESENT'); select pg_temp.mark('w4', 17, 15, 'PRESENT');

-- Nothing exists before finalization.
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main')), 0, 'no signal before the event is finalized');
select is(pg_temp.xp(2, 'ATTENDED_EVENT'), 0, '... and no XP');

-- ---- finalization of the main event ---------------------------------------------------------------------------------
select pg_temp.finalize('main', 1);
reset role;
select is(pg_temp.sig('main', 2, 'ATTENDED'), 1, 'PRESENT creates an ATTENDED signal');
select is(pg_temp.sig('main', 3, 'ATTENDED'), 1, '... for each verified-present player');
select is(pg_temp.sig('main', 4, 'NO_SHOW'), 1, 'ABSENT creates a NO_SHOW signal');
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(5)), 0, 'NOT_CONFIRMED is neutral');
select is(pg_temp.sig('main', 6, 'LATE_CANCEL'), 1, 'a late unexcused cancellation after approval is a LATE_CANCEL');
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(7)), 0, 'an early cancellation is neutral');
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(11)), 0, 'an excused cancellation is neutral');
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(12)), 0, 'a request that was never approved is neutral');
select is((select count(*)::int from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(1)), 0, 'the organizer''s own row is self-attested: no signal');
select is((select weight from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(2)), 1.0, 'ATTENDED weighs 1.0');
select is((select weight from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(6)), 0.5, 'LATE_CANCEL weighs 0.5');
select is((select weight from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(4)), 0.0, 'NO_SHOW weighs 0.0');
select is((select occurred_at from public.reliability_events where event_id = pg_temp.ev('main') and user_id = pg_temp.u(2)),
  (select starts_at from public.events where id = pg_temp.ev('main')), 'a signal is dated by the event');

-- XP.
select is(pg_temp.xp_ev(2, 'ATTENDED_EVENT', 'main'), 1, 'a present player earns ATTENDED_EVENT');
select is(pg_temp.xp(2, 'ATTENDED_EVENT'), 50, '... 50 XP');
select is(pg_temp.xp(2, 'FIRST_IN_SPORT'), 30, '... and 30 for their first attendance in the sport');
select is(pg_temp.xp(4, 'ATTENDED_EVENT') + pg_temp.xp(4, 'FIRST_IN_SPORT'), 0, 'a no-show earns nothing');
select is(pg_temp.xp(5, 'ATTENDED_EVENT') + pg_temp.xp(6, 'ATTENDED_EVENT'), 0, 'an unconfirmed or canceled player earns nothing');
select is(pg_temp.xp_ev(1, 'ATTENDED_EVENT', 'main'), 1, 'the organizer who plays earns attendance XP (two verified-present others)');
select is(pg_temp.xp_ev(1, 'ORGANIZED_EVENT', 'main'), 1, '... and ORGANIZED_EVENT');
select is(pg_temp.xp(1, 'ORGANIZED_EVENT'), 40, '... 40 XP');

-- The cache follows.
select is((select xp_total from public.user_progress where user_id = pg_temp.u(2)), 130, 'user_progress.xp_total is the ledger sum (50 + 30 + the FIRST_MATCH badge''s 50)');
select is((select reliability_samples from public.user_progress where user_id = pg_temp.u(2)), 1, '... with the counted signals');
select is((select reliability_score from public.user_progress where user_id = pg_temp.u(2)),
  (select round(score::numeric, 5) from private.reliability_score(array[1.0]::double precision[], array[2.0]::double precision[])),
  'one attendance two days ago: (3·0.9 + w) / (3 + w), a two-day-old signal weighs 0.5^(2/180)');
select ok((select reliability_score from public.user_progress where user_id = pg_temp.u(2)) between 0.92 and 0.93, '... about 92.5 %');
select is((select reliability_score from public.user_progress where user_id = pg_temp.u(4)),
  (select round(score::numeric, 5) from private.reliability_score(array[0.0]::double precision[], array[2.0]::double precision[])),
  'one no-show two days ago');
select ok((select reliability_score from public.user_progress where user_id = pg_temp.u(4)) between 0.67 and 0.68, '... about 67.5 %');
select is((select reliability_score from public.user_progress where user_id = pg_temp.u(5)), 0.90000::numeric,
  'a neutral player keeps the prior');

-- Idempotency (RATING_SYSTEM §7: re-running finalization creates nothing).
create temp table before_rerun as
  select (select count(*)::int from public.reliability_events) as signals, (select count(*)::int from public.xp_transactions) as xp;
grant all on before_rerun to authenticated;
reset role;
select lives_ok($$select private.apply_finalization(pg_temp.ev('main'))$$, 'applying finalization again runs');
select is((select signals from before_rerun), (select count(*)::int from public.reliability_events), '... without a new signal');
select is((select xp from before_rerun), (select count(*)::int from public.xp_transactions), '... and without new XP');
select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.finalize_attendance(pg_temp.ev('main'))$$, 'finalizing again is a no-op');
reset role;
select is((select xp from before_rerun), (select count(*)::int from public.xp_transactions), '... for the ledger too');

-- ---- thresholds and the new account ---------------------------------------------------------------------------------------
select pg_temp.finalize('thin', 9);
reset role;
select is(pg_temp.sig('thin', 13, 'ATTENDED'), 1, 'a thin event still creates signals');
select is(pg_temp.xp(13, 'ATTENDED_EVENT') + pg_temp.xp(9, 'ATTENDED_EVENT') + pg_temp.xp(9, 'ORGANIZED_EVENT'), 0,
  'but pays no XP with fewer than two verified-present others');
select pg_temp.finalize('newb', 8);
reset role;
select is(pg_temp.xp_ev(2, 'ATTENDED_EVENT', 'newb'), 1, 'players of a new organizer still earn XP');
select is(pg_temp.xp_ev(8, 'ORGANIZED_EVENT', 'newb'), 0, 'an account younger than 24 h earns no organizer XP');
select is(pg_temp.xp_ev(8, 'ATTENDED_EVENT', 'newb'), 1, '... but the new organizer who plays still earns attendance XP: only organizer XP is withheld');

-- ---- daily caps ------------------------------------------------------------------------------------------------------------
select pg_temp.finalize('c1', 9); select pg_temp.finalize('c2', 9); select pg_temp.finalize('c3', 9);
reset role;
select is(pg_temp.xp_ev(12, 'ATTENDED_EVENT', 'c1') + pg_temp.xp_ev(12, 'ATTENDED_EVENT', 'c2'), 2, 'attendance XP for the first two events of an Istanbul day');
select is(pg_temp.xp_ev(12, 'ATTENDED_EVENT', 'c3'), 0, '... none for the third');
select is(pg_temp.sig('c3', 12, 'ATTENDED'), 1, '... but the third attendance still counts for reliability');
select is(pg_temp.xp(12, 'FIRST_IN_SPORT'), 30, 'FIRST_IN_SPORT is paid once, not per event');
select is(pg_temp.xp_ev(9, 'ORGANIZED_EVENT', 'c1') + pg_temp.xp_ev(9, 'ORGANIZED_EVENT', 'c2'), 2, 'organizer XP for the first two events of a day');
select is(pg_temp.xp_ev(9, 'ORGANIZED_EVENT', 'c3'), 0, '... none for the third');
select is(pg_temp.xp_ev(9, 'ATTENDED_EVENT', 'c3'), 0, 'the organizer''s own attendance obeys the daily cap too');

-- ---- weekly cap (six events a week), with ledger rows standing in for earlier events -----------------------------------------
reset role;
insert into public.xp_transactions (user_id, amount, reason_code, source_type, source_id, dedupe_key)
select pg_temp.u(16), 50, 'ATTENDED_EVENT', 'EVENT', pg_temp.ev(k), 'fab:' || k || ':' || n
  from unnest(array['w1', 'w2', 'w3']) k cross join generate_series(1, 2) n;
select is(pg_temp.xp(16, 'ATTENDED_EVENT'), 300, 'six earlier attendance awards in one Istanbul week (two a day on three days)');
select pg_temp.finalize('w4', 15);
reset role;
select is(pg_temp.xp_ev(16, 'ATTENDED_EVENT', 'w4'), 0, 'the seventh event of the week pays no attendance XP');
select is(pg_temp.xp_ev(17, 'ATTENDED_EVENT', 'w4'), 1, '... while another player of the same event is paid');
select is(pg_temp.sig('w4', 16, 'ATTENDED'), 1, '... and the capped player still gets the reliability signal');

-- ---- disputes: excluded until resolved, then the correct signal ---------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(4));
select public.dispute_attendance(pg_temp.part('main', 4), 'Ben oradaydım');
reset role;
select is(pg_temp.sig('main', 4, 'NO_SHOW'), 0, 'a disputed mark voids its NO_SHOW (excluded until resolved)');
select is((select void_reason from public.reliability_events where participation_id = pg_temp.part('main', 4)), 'DISPUTED', '... saying why');
select is((select reliability_samples from public.user_progress where user_id = pg_temp.u(4)), 0, '... and the cache no longer counts it');
select is((select reliability_score from public.user_progress where user_id = pg_temp.u(4)), 0.90000::numeric, '... so the score is back at the prior');
select pg_temp.act_as(pg_temp.u(10), 'aal2');
select public.admin_resolve_attendance_dispute(pg_temp.part('main', 4), 'PRESENT');
reset role;
select is(pg_temp.sig('main', 4, 'ATTENDED'), 1, 'resolved PRESENT: an ATTENDED signal replaces it');
select is(pg_temp.sig('main', 4, 'NO_SHOW'), 0, '... and the NO_SHOW stays void');
select is(pg_temp.xp_ev(4, 'ATTENDED_EVENT', 'main'), 1, '... with the attendance XP it never received');
select is(pg_temp.xp(4, 'FIRST_IN_SPORT'), 30, '... and the first-in-sport bonus');
select is((select xp_total from public.user_progress where user_id = pg_temp.u(4)), 130, '... in the cache, with the badge that followed');
select is((select count(*)::int from public.reliability_events where participation_id = pg_temp.part('main', 4)), 2,
  'the old row is kept, voided: history is never rewritten');
select pg_temp.act_as(pg_temp.u(10), 'aal2');
select throws_ok($$select public.admin_resolve_attendance_dispute(pg_temp.part('thin', 12), 'ABSENT')$$, 'P0001', 'INVALID_TRANSITION',
  'resolving something that was not disputed is refused');

-- ---- immutability ---------------------------------------------------------------------------------------------------------------
reset role;
select throws_ok($$update public.xp_transactions set amount = 999 where user_id = pg_temp.u(2)$$, 'P0001', 'INVALID_TRANSITION', 'the ledger cannot be updated (I-9)');
select throws_ok($$delete from public.xp_transactions where user_id = pg_temp.u(2)$$, 'P0001', 'INVALID_TRANSITION', '... or deleted');
select throws_ok($$update public.reliability_events set weight = 1.0 where user_id = pg_temp.u(4) and kind = 'NO_SHOW'$$, 'P0001', 'INVALID_TRANSITION',
  'a signal can only be voided, nothing else about it changes');
select throws_ok($$update public.reliability_events set voided_at = now(), void_reason = 'again' where user_id = pg_temp.u(4) and kind = 'NO_SHOW'$$, 'P0001', 'INVALID_TRANSITION',
  '... and only once');
select throws_ok($$delete from public.reliability_events where user_id = pg_temp.u(2)$$, 'P0001', 'INVALID_TRANSITION', 'signals are never deleted');
select throws_ok($$insert into public.xp_transactions (user_id, amount, reason_code, source_type, dedupe_key)
    values (pg_temp.u(2), 0, 'ATTENDED_EVENT', 'EVENT', 'zero')$$, '23514', null, 'a zero-amount ledger row is refused');
select throws_ok($$insert into public.xp_transactions (user_id, amount, reason_code, source_type, dedupe_key)
    values (pg_temp.u(2), 5, 'ATTENDED_EVENT', 'EVENT', 'attend:' || pg_temp.ev('main') || ':' || pg_temp.u(2))$$,
  '23505', null, 'a second award with the same dedupe key is refused');
select throws_ok($$insert into public.reliability_events (user_id, participation_id, event_id, kind, weight, occurred_at)
    values (pg_temp.u(2), pg_temp.part('main', 2), pg_temp.ev('main'), 'ATTENDED', 1.0, now())$$,
  '23505', null, 'at most one active signal per participation (I-10)');

-- ---- independence (RATING_SYSTEM §7) --------------------------------------------------------------------------------------------
select is(pg_temp.xp(5, 'ATTENDED_EVENT') + pg_temp.xp(5, 'FIRST_IN_SPORT'), 0, 'a player with no verified attendance has no XP, whatever else happens');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'user_progress'
            and column_name ilike '%skill%'), 0, 'the progress cache holds no skill value: the three dimensions are stored separately');

-- ---- who can read what -----------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is((select count(*)::int from public.xp_transactions where user_id <> pg_temp.u(2)), 0, 'a player sees only their own ledger');
select ok((select count(*) from public.xp_transactions) >= 2, '... and does see it');
select is((select count(*)::int from public.reliability_events where user_id <> pg_temp.u(2)), 0, 'only their own signals');
select is((select count(*)::int from public.user_progress where user_id <> pg_temp.u(2)), 0, 'only their own progress');
select pg_temp.act_as(pg_temp.u(1));
select is((select count(*)::int from public.user_progress where user_id = pg_temp.u(2)), 0, 'an organizer cannot read a player''s progress');
select pg_temp.act_as_anon();
select throws_ok($$select count(*) from public.user_progress$$, '42501', null, 'guests cannot read progress');
select throws_ok($$select count(*) from public.reliability_events$$, '42501', null, 'guests cannot read signals');

-- ---- export ---------------------------------------------------------------------------------------------------------------------
reset role;
select is((select jsonb_array_length(private.export_event_data(pg_temp.u(2)) -> 'xp_transactions')), 4, 'the export lists the user''s ledger');
select is((select jsonb_array_length(private.export_event_data(pg_temp.u(4)) -> 'reliability_events')), 2, '... their signals, voided ones included');
select is(private.export_event_data(pg_temp.u(2)) -> 'progress' ->> 'xp_total', '180', '... and their progress');

select * from finish();
rollback;
