-- Phase 5 / M3b: closing review windows (skill snapshot, review and fair-play XP) on real events. RATING_SYSTEM §3, §5.2,
-- §7, §11. The formula itself is compared with the TypeScript reference in packages/db-tests (rating-equivalence).
begin;
select plan(48);

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
  select ('00000000-0000-4000-8000-0000000015' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.sport() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create function pg_temp.input(p_title text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', pg_temp.sport(),
    'sport_format_id', (select f.id from public.sport_formats f where f.sport_id = pg_temp.sport() and f.slug = '5v5'),
    'title', p_title,
    'starts_at', (now() + interval '240 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 12);
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.xp(n int, p_reason text, k text) returns int language sql as $$
  select count(*)::int from public.xp_transactions
   where user_id = pg_temp.u(n) and reason_code = p_reason and source_id = pg_temp.ev(k);
$$;
create function pg_temp.rating(n int) returns numeric language sql as $$
  select rating from public.user_sport_ratings where user_id = pg_temp.u(n) and sport_id = pg_temp.sport();
$$;
-- A started, finalized event: the organizer plays, p_present are present, p_absent absent. No XP-relevant shortcuts.
create function pg_temp.played(p_key text, p_org int, p_present int[], p_absent int[] default '{}') returns void
language plpgsql as $$
declare n int;
begin
  perform pg_temp.act_as(pg_temp.u(p_org));
  insert into ids values (p_key, public.create_event(gen_random_uuid(), pg_temp.input('S15 ' || p_key), true));
  foreach n in array p_present || p_absent loop
    perform pg_temp.act_as(pg_temp.u(n));
    perform public.request_join(pg_temp.ev(p_key));
    perform pg_temp.act_as(pg_temp.u(p_org));
    perform public.approve_participation(pg_temp.part(p_key, n));
  end loop;
  reset role;
  update public.events set starts_at = now() - interval '2 hours' where id = pg_temp.ev(p_key);
  perform pg_temp.act_as(pg_temp.u(p_org));
  foreach n in array p_present loop
    perform public.mark_attendance(pg_temp.part(p_key, n), 'PRESENT');
  end loop;
  foreach n in array p_absent loop
    perform public.mark_attendance(pg_temp.part(p_key, n), 'ABSENT');
  end loop;
  perform public.complete_event(pg_temp.ev(p_key));
  perform public.finalize_attendance(pg_temp.ev(p_key));
  reset role;
end;
$$;
create function pg_temp.review(p_key text, p_from int, p_to int, p_score int, p_fair boolean default false) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_from));
  perform public.submit_reviews(pg_temp.ev(p_key),
    jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(p_to), 'skill_score', p_score, 'fair_play', p_fair)));
  reset role;
end;
$$;

-- 01 organizer · 02 prior 2.0 · 03..05 players (prior 3.0 default: no sport profile) · 06 no-show · 07 unreviewed player
-- · 08 deleted later · 09 outsider
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u15-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now(),
                           created_at = now() - interval '10 days'
 where id::text like '00000000-0000-4000-8000-0000000015%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000015%';
insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level) values (pg_temp.u(2), pg_temp.sport(), 2.0);

-- ---- grants and schedule -----------------------------------------------------------------------------------------
select table_privs_are('public', 'user_sport_ratings', 'authenticated', array['SELECT'], 'users may only read ratings');
select table_privs_are('public', 'user_sport_ratings', 'anon', array[]::text[], 'guests may not touch ratings');
select table_privs_are('private', 'closed_review_windows', 'authenticated', array[]::text[], 'the marker table is internal');
select function_privs_are('private', 'close_review_windows', array['timestamp with time zone'], 'authenticated', array[]::text[], 'the job is internal');
select function_privs_are('private', 'recompute_user_sport_rating', array['uuid', 'uuid', 'timestamp with time zone'], 'authenticated', array[]::text[], 'recomputing is internal');
select function_privs_are('private', 'skill_stats',
  array['double precision', 'uuid', 'uuid[]', 'uuid[]', 'uuid[]', 'double precision[]', 'timestamp with time zone[]', 'timestamp with time zone'],
  'authenticated', array[]::text[], 'the math is internal');
select is((select schedule from cron.job where jobname = 'close-review-windows'), '*/15 * * * *', 'the job runs every 15 minutes');
select ok((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'user_sport_ratings'), 'ratings have RLS');

-- ---- event A: three reviewers on 02, fair play from two ------------------------------------------------------------
select pg_temp.played('a', 1, array[2, 3, 4, 5], array[6]);
select pg_temp.review('a', 3, 2, 4, true);
select pg_temp.review('a', 4, 2, 4, true);
select pg_temp.review('a', 5, 2, 4, false);
select pg_temp.review('a', 3, 4, 5, true);   -- 04 gets one reviewer only, one fair play only
select pg_temp.review('a', 2, 5, 1, false);  -- a lone low score on 05
select pg_temp.review('a', 3, 5, 3, false);  -- 05 reaches two reviewers

-- ---- while the window is open nothing counts --------------------------------------------------------------------
select is(private.close_review_windows(), 0, 'an open window is not closed');
select is(pg_temp.rating(2), null, 'no rating while reviews are blind');
select is(pg_temp.xp(3, 'REVIEWS_SUBMITTED', 'a'), 0, 'no review XP before the window closes');
select is(pg_temp.xp(2, 'FAIR_PLAY_RECEIVED', 'a'), 0, 'no fair-play XP before the window closes');

-- ---- closing ------------------------------------------------------------------------------------------------------
select is(private.close_review_windows(now() + interval '73 hours'), 1, 'one window closes');
-- The job ran "73 hours from now", so the event is three days old and has decayed a little.
select is(pg_temp.rating(2), 2.66, 'prior 2.0, three reviewers giving 4, three days of decay');
select is((select confidence from public.user_sport_ratings where user_id = pg_temp.u(2)), 0.33066::numeric, 'confidence with the same decay');
select private.recompute_user_sport_rating(pg_temp.u(2), pg_temp.sport(), (select starts_at from public.events where id = pg_temp.ev('a')));
select is(pg_temp.rating(2), 2.67, 'at the event''s own moment, no decay: (2·2 + 4) / 3');
select is((select confidence from public.user_sport_ratings where user_id = pg_temp.u(2)), 0.33333::numeric, 'confidence 1 / 3');
select is((select sample_events from public.user_sport_ratings where user_id = pg_temp.u(2)), 1, 'one counted event');
select is(pg_temp.rating(4), null, 'one reviewer alone creates no rating');
-- Two reviewers: w_e = 2/3, mean 2: (2·3 + 2/3·2) / (2 + 2/3) = 2.75. No sport profile, so the default prior 3.0.
select is(pg_temp.rating(5), 2.75, 'two reviewers count at two thirds, against the default prior');
select is(pg_temp.rating(7), null, 'nobody reviewed: no rating');
select is(pg_temp.rating(6), null, 'a no-show has no rating');

select is(pg_temp.xp(3, 'REVIEWS_SUBMITTED', 'a'), 1, 'a reviewer earns the review XP');
select is((select sum(amount)::int from public.xp_transactions where user_id = pg_temp.u(3) and reason_code = 'REVIEWS_SUBMITTED'), 10,
  '+10, once per event however many reviews');
select is(pg_temp.xp(1, 'REVIEWS_SUBMITTED', 'a'), 0, 'not reviewing earns nothing');
select is(pg_temp.xp(2, 'FAIR_PLAY_RECEIVED', 'a'), 1, 'two fair-play reviewers pay');
select is(pg_temp.xp(4, 'FAIR_PLAY_RECEIVED', 'a'), 0, 'one fair-play reviewer does not');
select is((select xp_total from public.user_progress where user_id = pg_temp.u(2)),
          (select sum(amount)::int from public.xp_transactions where user_id = pg_temp.u(2)), 'the XP cache agrees with the ledger');

-- ---- idempotent, and frozen --------------------------------------------------------------------------------------
select is(private.close_review_windows(now() + interval '73 hours'), 0, 'a second run closes nothing');
select is((select count(*)::int from public.xp_transactions where source_id = pg_temp.ev('a') and reason_code in ('REVIEWS_SUBMITTED', 'FAIR_PLAY_RECEIVED')),
          5, 'no extra XP rows (four reviewers and one fair play)');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.submit_reviews(pg_temp.ev('a'), jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(3), 'skill_score', 5)))$$,
  'P0001', 'WINDOW_CLOSED', 'a closed window refuses reviews even if the clock says otherwise');
reset role;

-- ---- who can read -------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is((select count(*)::int from public.user_sport_ratings), 1, 'a user reads their own rating');
select pg_temp.act_as(pg_temp.u(3));
select is((select count(*)::int from public.user_sport_ratings where user_id = pg_temp.u(2)), 0, 'not somebody else''s');
select throws_ok($$update public.user_sport_ratings set rating = 5$$, '42501', null, 'nobody edits a rating');
select pg_temp.act_as_anon();
select throws_ok($$select * from public.user_sport_ratings$$, '42501', null, 'guests read nothing');
reset role;

-- ---- independence (RATING_SYSTEM §7) --------------------------------------------------------------------------------
create temp table before_b as select rating, confidence from public.user_sport_ratings where user_id = pg_temp.u(2);
create temp table at_b (t timestamptz);
insert into at_b select computed_at from public.user_sport_ratings where user_id = pg_temp.u(2);
select pg_temp.played('b', 1, array[2, 3, 4], array[]::int[]);
select private.close_review_windows(now() + interval '73 hours');
select is(pg_temp.xp(2, 'ATTENDED_EVENT', 'b'), 1, 'attending earned XP');
select is(pg_temp.rating(2), (select rating from before_b), 'attending without reviews leaves skill unchanged');
select private.recompute_user_sport_rating(pg_temp.u(2), pg_temp.sport(), (select t from at_b));
select is((select confidence from public.user_sport_ratings where user_id = pg_temp.u(2)), (select confidence from before_b),
  'even recomputed at the same moment: attendance, XP and reliability do not enter the formula');
select is((select reliability_samples from public.user_progress where user_id = pg_temp.u(2)), 2, 'reliability moved meanwhile');
select pg_temp.played('c', 1, array[3, 4], array[2]);
select private.recompute_user_sport_rating(pg_temp.u(2), pg_temp.sport(), (select t from at_b));
select is(pg_temp.rating(2), (select rating from before_b), 'a no-show does not move skill');
select is((select count(*)::int from public.reliability_events where user_id = pg_temp.u(2) and kind = 'NO_SHOW'), 1, 'it moves reliability');

-- ---- a hidden review stops counting --------------------------------------------------------------------------------
update public.skill_reviews set status = 'HIDDEN' where event_id = pg_temp.ev('a') and reviewee_id = pg_temp.u(5) and reviewer_id = pg_temp.u(2);
select private.recompute_user_sport_rating(pg_temp.u(5), pg_temp.sport());
select is(pg_temp.rating(5), null, 'below two reviewers again: the row goes, the self-assessment stands');

-- ---- account lifecycle (ADR-0017) ------------------------------------------------------------------------------------
select is(jsonb_array_length(private.export_event_data(pg_temp.u(2)) -> 'sport_ratings'), 1, 'the rating is in the export');

select pg_temp.played('d', 1, array[3, 4, 8], array[]::int[]);
select pg_temp.review('d', 3, 8, 5, true);
select pg_temp.review('d', 4, 8, 5, true);
select pg_temp.review('d', 8, 3, 2, false);
select pg_temp.review('d', 4, 3, 2, false);
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(8);
select is(private.purge_account(pg_temp.u(8)), true, 'the account is purged');
select is(private.close_review_windows(now() + interval '73 hours'), 2, 'its event still closes (and event c, still open)');
select is(pg_temp.rating(8), null, 'the tombstone holds no rating');
select is((select count(*)::int from public.xp_transactions where user_id = pg_temp.u(8) and reason_code in ('REVIEWS_SUBMITTED', 'FAIR_PLAY_RECEIVED')),
  0, 'and earns nothing');
select ok(pg_temp.rating(3) is not null, 'its score still counts for the others');

select * from finish();
rollback;
