-- Phase 5 / M2: double-blind skill reviews (I-8). Every eligibility rule has a passing and a refusing case; the
-- submission is all-or-nothing; nobody but the author can read a review. Concurrent submissions are proven
-- separately with real parallel connections (packages/db-tests, attendance-concurrency).
begin;
select plan(52);

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
  select ('00000000-0000-4000-8000-0000000013' || lpad(n::text, 2, '0'))::uuid;
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
-- A one-review submission body.
create function pg_temp.rv(n int, score int, extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(n), 'skill_score', score) || extra);
$$;
create function pg_temp.reviews_by(n int) returns int language sql as $$
  select count(*)::int from public.skill_reviews where reviewer_id = pg_temp.u(n);
$$;

-- 01 organizer O (plays) · 02..05 players (02, 03 present; 04 absent; 05 unconfirmed) · 06 stranger · 07 not onboarded
-- · 08 organizer Q · 09 disputing player · 10 solo player of the thin event
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u13-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 10) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000013%' and id <> pg_temp.u(7);
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000013%' and p.onboarded_at is not null;

-- ---- grants and table ------------------------------------------------------------------------------------------
select function_privs_are('public', 'submit_reviews', array['uuid', 'jsonb'], 'anon', array[]::text[], 'guests cannot submit reviews');
select function_privs_are('public', 'submit_reviews', array['uuid', 'jsonb'], 'authenticated', array['EXECUTE'], 'users can call submit_reviews');
select table_privs_are('public', 'skill_reviews', 'authenticated', array['SELECT'], 'users may only read their reviews (writes go through the RPC)');
select table_privs_are('public', 'skill_reviews', 'anon', array[]::text[], 'guests may not touch reviews');

-- ---- fixtures: finalized events ----------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('main', public.create_event(gen_random_uuid(), pg_temp.input('S13 Ana'), true));
insert into ids values ('open', public.create_event(gen_random_uuid(), pg_temp.input('S13 Kesinleşmemiş'), true));
insert into ids values ('late', public.create_event(gen_random_uuid(), pg_temp.input('S13 Süresi dolmuş'), true));
select pg_temp.act_as(pg_temp.u(8));
insert into ids values ('thin', public.create_event(gen_random_uuid(), pg_temp.input('S13 İnce'), true));
select pg_temp.act_as(pg_temp.u(2)); select public.request_join(pg_temp.ev('main'));
select public.request_join(pg_temp.ev('open')); select public.request_join(pg_temp.ev('late'));
select pg_temp.act_as(pg_temp.u(3)); select public.request_join(pg_temp.ev('main'));
select public.request_join(pg_temp.ev('open')); select public.request_join(pg_temp.ev('late'));
select pg_temp.act_as(pg_temp.u(4)); select public.request_join(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(5)); select public.request_join(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(9)); select public.request_join(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(10)); select public.request_join(pg_temp.ev('thin'));
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part('main', n)) from generate_series(2, 5) n;
select public.approve_participation(pg_temp.part('main', 9));
select public.approve_participation(pg_temp.part('open', 2)); select public.approve_participation(pg_temp.part('open', 3));
select public.approve_participation(pg_temp.part('late', 2)); select public.approve_participation(pg_temp.part('late', 3));
select pg_temp.act_as(pg_temp.u(8));
select public.approve_participation(pg_temp.part('thin', 10));

reset role;
update public.events set starts_at = now() - interval '2 hours'
 where id in (pg_temp.ev('main'), pg_temp.ev('open'), pg_temp.ev('late'), pg_temp.ev('thin'));

select pg_temp.act_as(pg_temp.u(1));
select public.mark_attendance(pg_temp.part('main', 2), 'PRESENT');
select public.mark_attendance(pg_temp.part('main', 3), 'PRESENT');
select public.mark_attendance(pg_temp.part('main', 4), 'ABSENT');
select public.mark_attendance(pg_temp.part('main', 9), 'ABSENT');   -- disputes it below
select public.mark_attendance(pg_temp.part('open', 2), 'PRESENT');
select public.mark_attendance(pg_temp.part('open', 3), 'PRESENT');
select public.mark_attendance(pg_temp.part('late', 2), 'PRESENT');
select public.mark_attendance(pg_temp.part('late', 3), 'PRESENT');
select public.finalize_attendance(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(8));
select public.mark_attendance(pg_temp.part('thin', 10), 'PRESENT');
select public.finalize_attendance(pg_temp.ev('thin'));
select pg_temp.act_as(pg_temp.u(9));
select public.dispute_attendance(pg_temp.part('main', 9), 'Oradaydım');
reset role;
-- 'late': completed and finalized four days ago, so the 72 h window ended a day ago (the one-time write path).
update public.events set status = 'COMPLETED', completed_at = now() - interval '5 days' where id = pg_temp.ev('late');
update public.events set attendance_finalized_at = now() - interval '4 days', review_window_closes_at = now() - interval '1 day'
 where id = pg_temp.ev('late');

-- ---- refusals ----------------------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, '42501', null, 'guests are refused');
select pg_temp.act_as(pg_temp.u(7));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, 'P0001', 'ONBOARDING_REQUIRED', 'users who have not onboarded are refused');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, 'P0001', 'NOT_FOUND', 'a stranger to the event is refused (indistinguishable from missing)');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.submit_reviews(gen_random_uuid(), pg_temp.rv(3, 4))$$, 'P0001', 'NOT_FOUND', 'an unknown event');
select throws_ok($$select public.submit_reviews(pg_temp.ev('open'), pg_temp.rv(3, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'before finalization the window has not opened');
select throws_ok($$select public.submit_reviews(pg_temp.ev('late'), pg_temp.rv(3, 4))$$, 'P0001', 'WINDOW_CLOSED', 'after the 72 h window');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(2, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'you cannot review yourself');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(4, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'a player marked ABSENT cannot be reviewed');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(5, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'an unconfirmed (neutral) player cannot be reviewed');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(9, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'a DISPUTED player cannot be reviewed until resolved');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(6, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'someone who did not take part cannot be reviewed');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'an ABSENT player cannot review');
select pg_temp.act_as(pg_temp.u(5));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'an unconfirmed player cannot review');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE', 'a player with a disputed mark cannot review until resolved');

-- ---- validation ----------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), '[]'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'an empty submission');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), null)$$, 'P0001', 'VALIDATION_FAILED', 'a null submission');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), '{}'::jsonb)$$, 'P0001', 'VALIDATION_FAILED', 'not an array');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 0))$$, 'P0001', 'VALIDATION_FAILED', 'score 0');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 6))$$, 'P0001', 'VALIDATION_FAILED', 'score 6');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(3), 'skill_score', 3.5)))$$,
  'P0001', 'VALIDATION_FAILED', 'a fractional score');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), jsonb_build_array(jsonb_build_object('reviewee_id', 'not-a-uuid', 'skill_score', 3)))$$,
  'P0001', 'VALIDATION_FAILED', 'a reviewee that is not a uuid');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4, '{"fair_play": "yes"}'))$$,
  'P0001', 'VALIDATION_FAILED', 'fair_play must be a boolean');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4) || pg_temp.rv(3, 5))$$,
  'P0001', 'VALIDATION_FAILED', 'the same person twice in one submission');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'),
    (select jsonb_agg(jsonb_build_object('reviewee_id', pg_temp.u(3), 'skill_score', 3)) from generate_series(1, 61)))$$,
  'P0001', 'VALIDATION_FAILED', 'more than 60 entries');
select is(pg_temp.reviews_by(2), 0, 'nothing was stored by any refused submission');

-- ---- the happy path and all-or-nothing -----------------------------------------------------------------------------
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4) || pg_temp.rv(4, 4))$$,
  'P0001', 'REVIEW_NOT_ELIGIBLE', 'one ineligible entry rejects the whole submission');
select is(pg_temp.reviews_by(2), 0, '... and the eligible entry was not stored either');
select is(public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 4, '{"fair_play": true}')), 1, 'a valid review is stored');
select is((select skill_score::int || ':' || fair_play::text from public.skill_reviews where reviewer_id = pg_temp.u(2) and reviewee_id = pg_temp.u(3)),
  '4:true', '... with its score and commendation');
select is((select sport_id from public.skill_reviews where reviewer_id = pg_temp.u(2) and reviewee_id = pg_temp.u(3)),
  (select id from public.sports where slug = 'football'), '... and the event''s sport');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(3, 5))$$, 'P0001', 'ALREADY_REVIEWED', 'the same pair cannot be reviewed twice');
select throws_ok($$select public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(1, 3) || pg_temp.rv(3, 5))$$, 'P0001', 'ALREADY_REVIEWED',
  'a batch that contains an earlier pair is rejected whole');
select is(pg_temp.reviews_by(2), 1, '... and nothing else was stored');
select is(public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(1, 3)), 1, 'a player may review the organizer who played (two others present)');
select is((select fair_play from public.skill_reviews where reviewer_id = pg_temp.u(2) and reviewee_id = pg_temp.u(1)), false, 'fair_play defaults to false');

-- ---- the organizer who plays ------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select is(public.submit_reviews(pg_temp.ev('main'), pg_temp.rv(2, 5) || pg_temp.rv(3, 4)), 2,
  'the organizer reviews players when two others were verified present');
select pg_temp.act_as(pg_temp.u(8));
select throws_ok($$select public.submit_reviews(pg_temp.ev('thin'), pg_temp.rv(10, 5))$$, 'P0001', 'REVIEW_NOT_ELIGIBLE',
  'an organizer with only one verified-present player cannot review (self-attested row)');
select pg_temp.act_as(pg_temp.u(10));
select is(public.submit_reviews(pg_temp.ev('thin'), pg_temp.rv(8, 5)), 1,
  'a lone player may review the organizer who played (one reviewer cannot move a rating: it takes two)');

-- ---- double blind -----------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(3));
select is((select count(*)::int from public.skill_reviews), 0, 'the reviewee sees no review about them');
select pg_temp.act_as(pg_temp.u(2));
select is((select count(*)::int from public.skill_reviews), 2, 'the author sees their own reviews');
select pg_temp.act_as(pg_temp.u(1));
select is((select count(*)::int from public.skill_reviews where reviewer_id <> pg_temp.u(1)), 0, 'the organizer sees nobody else''s reviews');
select pg_temp.act_as(pg_temp.u(6));
select is((select count(*)::int from public.skill_reviews), 0, 'a stranger sees nothing');
select pg_temp.act_as_anon();
select throws_ok($$select count(*) from public.skill_reviews$$, '42501', null, 'guests cannot read reviews');
reset role;
select throws_ok($$insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score)
    values (pg_temp.ev('main'), pg_temp.u(2), pg_temp.u(4), (select id from public.sports where slug = 'football'), 3)$$,
  'P0001', 'REVIEW_NOT_ELIGIBLE', 'even the owner role cannot insert a review about an absent player (trigger, I-8)');
select throws_ok($$insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score)
    values (pg_temp.ev('open'), pg_temp.u(2), pg_temp.u(3), (select id from public.sports where slug = 'football'), 3)$$,
  'P0001', 'REVIEW_NOT_ELIGIBLE', '... nor in an event that is not finalized');
select throws_ok($$insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score)
    values (pg_temp.ev('main'), pg_temp.u(2), pg_temp.u(2), (select id from public.sports where slug = 'football'), 3)$$,
  'P0001', 'REVIEW_NOT_ELIGIBLE', '... nor a self-review (the trigger refuses it before the check constraint)');

-- ---- export -----------------------------------------------------------------------------------------------------------
select is((select jsonb_array_length(private.export_event_data(pg_temp.u(2)) -> 'reviews_written')), 2, 'the export lists the reviews the user wrote');
select is((select jsonb_array_length(private.export_event_data(pg_temp.u(3)) -> 'reviews_written')), 0, '... and not the ones written about them');

select * from finish();
rollback;
