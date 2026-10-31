-- Phase 5 / M4: every badge with a positive and a negative fixture on real events. RATING_SYSTEM §6, §12. The rule function
-- and the definitions are compared with the TypeScript reference in packages/db-tests (rating-equivalence).
begin;
select plan(58);

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
  select ('00000000-0000-4000-8000-0000000016' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.sport(p_slug text) returns uuid language sql as $$ select id from public.sports where slug = p_slug; $$;
create function pg_temp.input(p_title text, p_sport text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', pg_temp.sport(p_sport),
    'sport_format_id', (select f.id from public.sport_formats f where f.sport_id = pg_temp.sport(p_sport) order by f.max_participants desc limit 1),
    'title', p_title,
    'starts_at', (now() + interval '240 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', (select f.default_capacity from public.sport_formats f where f.sport_id = pg_temp.sport(p_sport) order by f.max_participants desc limit 1));
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.has(n int, p_code text) returns boolean language sql as $$
  select exists (select 1 from public.user_achievements where user_id = pg_temp.u(n) and code = p_code);
$$;
create function pg_temp.bonus(n int, p_code text) returns int language sql as $$
  select coalesce(sum(x.amount), 0)::int from public.xp_transactions x
    join public.user_achievements a on a.id = x.source_id
   where x.user_id = pg_temp.u(n) and x.reason_code = 'ACHIEVEMENT_BONUS' and a.code = p_code;
$$;
-- A started, finalized event. The organizer plays unless told otherwise; p_present are marked present, p_absent absent.
create function pg_temp.played(p_key text, p_org int, p_present int[], p_absent int[] default '{}',
                               p_sport text default 'football', p_ago interval default '2 hours',
                               p_finalize boolean default true) returns void
language plpgsql as $$
declare n int;
begin
  perform pg_temp.act_as(pg_temp.u(p_org));
  insert into ids values (p_key, public.create_event(gen_random_uuid(), pg_temp.input('S16 ' || p_key, p_sport), true));
  foreach n in array p_present || p_absent loop
    perform pg_temp.act_as(pg_temp.u(n));
    perform public.request_join(pg_temp.ev(p_key));
    perform pg_temp.act_as(pg_temp.u(p_org));
    perform public.approve_participation(pg_temp.part(p_key, n));
  end loop;
  reset role;
  update public.events set starts_at = now() - p_ago where id = pg_temp.ev(p_key);
  perform pg_temp.act_as(pg_temp.u(p_org));
  foreach n in array p_present loop
    perform public.mark_attendance(pg_temp.part(p_key, n), 'PRESENT');
  end loop;
  foreach n in array p_absent loop
    perform public.mark_attendance(pg_temp.part(p_key, n), 'ABSENT');
  end loop;
  perform public.complete_event(pg_temp.ev(p_key));
  if p_finalize then
    perform public.finalize_attendance(pg_temp.ev(p_key));
  end if;
  reset role;
end;
$$;
create function pg_temp.review(p_key text, p_from int, p_to int) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u(p_from));
  perform public.submit_reviews(pg_temp.ev(p_key),
    jsonb_build_array(jsonb_build_object('reviewee_id', pg_temp.u(p_to), 'skill_score', 4, 'fair_play', true)));
  reset role;
end;
$$;

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u16-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 40) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now(),
                           created_at = now() - interval '10 days'
 where id::text like '00000000-0000-4000-8000-0000000016%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000016%';
insert into public.platform_admins (user_id) values (pg_temp.u(40));
-- The fixtures create far more events in a day than a real organizer may.
update public.app_config set value = '1000'::jsonb where key = 'quota.max_events_created_per_day';

-- ---- catalog and grants -----------------------------------------------------------------------------------------------
select is((select count(*)::int from public.achievement_definitions where is_active), 7, 'seven badges');
select table_privs_are('public', 'achievement_definitions', 'anon', array[]::text[], 'guests do not read the catalog (ADR-0013 allow-list)');
select table_privs_are('public', 'achievement_definitions', 'authenticated', array['SELECT'], 'users may only read the catalog');
select table_privs_are('public', 'user_achievements', 'authenticated', array['SELECT'], 'users may only read awards');
select table_privs_are('public', 'user_achievements', 'anon', array[]::text[], 'guests read no awards');
select function_privs_are('private', 'evaluate_achievements', array['uuid', 'uuid', 'timestamp with time zone'], 'authenticated', array[]::text[], 'evaluating is internal');
select function_privs_are('private', 'grant_achievement', array['uuid', 'text', 'uuid', 'uuid', 'integer'], 'authenticated', array[]::text[], 'granting is internal');

-- ---- the series: organizer 11, ten football events ----------------------------------------------------------------------
-- 03 attends all ten · 04 all ten + a no-show 70 days ago · 05 nine + a volleyball one · 08 all ten + a recent no-show
select pg_temp.played('old', 12, array[9, 10], array[4], 'football', '70 days');
select pg_temp.played('recent', 12, array[9, 10], array[8]);
select ok(not pg_temp.has(8, 'FIRST_MATCH'), 'a no-show is not an attendance: no FIRST_MATCH');
select pg_temp.played('s' || i, 11, array[3, 4, 5, 8]) from generate_series(1, 4) i;
select ok(pg_temp.has(3, 'FIRST_MATCH'), 'FIRST_MATCH after the first verified attendance');
select is(pg_temp.bonus(3, 'FIRST_MATCH'), 50, 'with its +50');
select is((select source_event_id from public.user_achievements where user_id = pg_temp.u(3) and code = 'FIRST_MATCH'), pg_temp.ev('s1'),
  'traceable to the event that unlocked it');
select ok(not pg_temp.has(11, 'COMMUNITY_ORGANIZER'), 'COMMUNITY_ORGANIZER: four events are not enough');
select pg_temp.played('s5', 11, array[3, 4, 5, 8]);
select ok(pg_temp.has(11, 'COMMUNITY_ORGANIZER'), 'COMMUNITY_ORGANIZER at five events with three players each');
select is(pg_temp.bonus(11, 'COMMUNITY_ORGANIZER'), 100, 'with its +100');
select pg_temp.played('s' || i, 11, array[3, 4, 5, 8]) from generate_series(6, 9) i;
select ok(not pg_temp.has(3, 'TEN_GAMES'), 'TEN_GAMES: nine are not enough');
select ok(not pg_temp.has(3, 'SPORT_REGULAR'), 'SPORT_REGULAR: nine are not enough');
select ok(not pg_temp.has(3, 'RELIABLE_PLAYER'), 'RELIABLE_PLAYER: nine signals are not enough');
select pg_temp.played('s10', 11, array[3, 4, 8]);
select pg_temp.played('v1', 12, array[5, 9, 10], '{}', 'volleyball');
select ok(pg_temp.has(3, 'TEN_GAMES'), 'TEN_GAMES at ten');
select is(pg_temp.bonus(3, 'TEN_GAMES'), 100, 'with its +100');
select is((select sport_id from public.user_achievements where user_id = pg_temp.u(3) and code = 'SPORT_REGULAR'), pg_temp.sport('football'),
  'SPORT_REGULAR at ten in that sport');
select is(pg_temp.bonus(3, 'SPORT_REGULAR'), 75, 'with its +75');
select ok(pg_temp.has(5, 'TEN_GAMES'), 'nine football and one volleyball: TEN_GAMES');
select ok(not pg_temp.has(5, 'SPORT_REGULAR'), 'but no SPORT_REGULAR');
select ok(pg_temp.has(3, 'RELIABLE_PLAYER'), 'RELIABLE_PLAYER at ten clean signals');
select is(pg_temp.bonus(3, 'RELIABLE_PLAYER'), 100, 'with its +100');
select ok(pg_temp.has(4, 'RELIABLE_PLAYER'), 'a no-show 70 days ago no longer stands in the way');
select ok(not pg_temp.has(8, 'RELIABLE_PLAYER'), 'a no-show inside 60 days does');
select ok(not pg_temp.has(12, 'COMMUNITY_ORGANIZER'), 'three organized events earn no COMMUNITY_ORGANIZER');

-- ---- MULTI_SPORT ---------------------------------------------------------------------------------------------------------
select pg_temp.played('m1', 13, array[14, 15, 9, 10], '{}', 'football');
select pg_temp.played('m2', 13, array[14, 15, 9, 10], '{}', 'volleyball');
select pg_temp.played('m3', 13, array[14, 9, 10], '{}', 'basketball');
select ok(pg_temp.has(14, 'MULTI_SPORT'), 'MULTI_SPORT at three sports');
select is(pg_temp.bonus(14, 'MULTI_SPORT'), 75, 'with its +75');
select ok(not pg_temp.has(15, 'MULTI_SPORT'), 'two sports are not enough');

-- ---- thin events: attendance counts only with two verified-present players besides the organizer (§12.2) --------------------------------------------
select pg_temp.played('thin', 16, array[17]);
select ok(not pg_temp.has(16, 'FIRST_MATCH'), 'an organizer with one other player earns no attendance badge');
select ok(not pg_temp.has(17, 'FIRST_MATCH'), 'neither does that one player: no badge for an organizer and a friend');
select ok(pg_temp.has(13, 'FIRST_MATCH'), 'an organizer with enough others does too');
select pg_temp.played('thin2', 20, array[21, 22]);
select ok(pg_temp.has(21, 'FIRST_MATCH'), 'with two players besides the organizer, a player earns it');
select ok(pg_temp.has(20, 'FIRST_MATCH'), 'and so does the organizer who played');
select ok(not pg_temp.has(20, 'COMMUNITY_ORGANIZER'), 'an event of two others does not count as organized');

-- ---- FAIR_PLAY: distinct reviewers across events, closed windows only ---------------------------------------------------------
-- 25 target (5 across 3) · 26 five across only 2 · 27 four across 3. Reviewers 30..34.
select pg_temp.played('f' || i, 24, array[25, 26, 27, 30, 31, 32, 33, 34]) from generate_series(1, 3) i;
select pg_temp.review('f1', 30, 25); select pg_temp.review('f1', 31, 25);
select pg_temp.review('f2', 32, 25); select pg_temp.review('f2', 33, 25);
select pg_temp.review('f3', 34, 25);
select pg_temp.review('f1', 30, 26); select pg_temp.review('f1', 31, 26);
select pg_temp.review('f2', 32, 26); select pg_temp.review('f2', 33, 26); select pg_temp.review('f2', 34, 26);
select pg_temp.review('f1', 30, 27); select pg_temp.review('f2', 31, 27);
select pg_temp.review('f3', 32, 27); select pg_temp.review('f3', 33, 27);
select private.evaluate_achievements(pg_temp.u(25));
select ok(not pg_temp.has(25, 'FAIR_PLAY'), 'open windows are blind: nothing yet');
select lives_ok($$select private.close_review_windows(now() + interval '73 hours')$$, 'the windows close');
select ok(pg_temp.has(25, 'FAIR_PLAY'), 'FAIR_PLAY: five reviewers across three events');
select is(pg_temp.bonus(25, 'FAIR_PLAY'), 75, 'with its +75');
select ok(not pg_temp.has(26, 'FAIR_PLAY'), 'five reviewers across two events are not enough');
select ok(not pg_temp.has(27, 'FAIR_PLAY'), 'four reviewers across three events are not enough');

-- ---- disputes: excluded until resolved, then counted --------------------------------------------------------------------------
select pg_temp.played('d', 13, array[9, 10], array[35]);
select pg_temp.act_as(pg_temp.u(35));
select public.dispute_attendance(pg_temp.part('d', 35), 'Oradaydım');
reset role;
select private.evaluate_achievements(pg_temp.u(35));
select ok(not pg_temp.has(35, 'FIRST_MATCH'), 'a disputed mark counts for nothing');
select pg_temp.act_as(pg_temp.u(40), 'aal2');
select public.admin_resolve_attendance_dispute(pg_temp.part('d', 35), 'PRESENT');
reset role;
select ok(pg_temp.has(35, 'FIRST_MATCH'), 'resolved to present: the badge follows');

-- ---- idempotent, revocation sticks, the cache agrees -----------------------------------------------------------------------------
create temp table xp_before as select count(*) as n from public.xp_transactions where user_id = pg_temp.u(3);
select private.evaluate_achievements(pg_temp.u(3));
select is((select count(*) from public.xp_transactions where user_id = pg_temp.u(3)), (select n from xp_before), 'evaluating again pays nothing');
select is((select count(*)::int from public.user_achievements where user_id = pg_temp.u(3) and code = 'FIRST_MATCH'), 1, 'and awards nothing');
update public.user_achievements set revoked_at = now() where user_id = pg_temp.u(3) and code = 'FIRST_MATCH';
select private.evaluate_achievements(pg_temp.u(3));
select ok((select revoked_at is not null from public.user_achievements where user_id = pg_temp.u(3) and code = 'FIRST_MATCH'), 'a revoked badge stays revoked');
select is((select xp_total from public.user_progress where user_id = pg_temp.u(3)),
          (select sum(amount)::int from public.xp_transactions where user_id = pg_temp.u(3)), 'the XP cache includes the bonuses');

-- ---- who can read ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(3));
select ok((select count(*) >= 3 from public.user_achievements), 'a user reads their own badges');
select is((select count(*)::int from public.user_achievements where user_id = pg_temp.u(4)), 0, 'not somebody else''s');
select throws_ok($$insert into public.user_achievements (user_id, code) values (pg_temp.u(3), 'FAIR_PLAY')$$, '42501', null, 'nobody grants themselves a badge');
select throws_ok($$update public.achievement_definitions set xp_bonus = 9999$$, '42501', null, 'nobody edits the catalog');
select is((select count(*)::int from public.achievement_definitions), 7, 'users read the catalog');
select pg_temp.act_as_anon();
select throws_ok($$select * from public.user_achievements$$, '42501', null, 'guests read no awards');
reset role;

-- ---- account lifecycle (ADR-0017) --------------------------------------------------------------------------------------------------
select ok(jsonb_array_length(private.export_event_data(pg_temp.u(14)) -> 'achievements') >= 2, 'badges are in the export');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(14);
select ok(private.purge_account(pg_temp.u(14)), 'the account is purged');
select is((select count(*)::int from public.user_achievements where user_id = pg_temp.u(14)), 0, 'its badges are gone');

select * from finish();
rollback;
