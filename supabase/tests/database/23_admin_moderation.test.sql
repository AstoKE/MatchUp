-- Phase 6 / M4: what an administrator can do (F-28, S-13, S-14): who may call it, what it changes, what it records.
begin;
select plan(92);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000023' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.input(p_title text) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '290 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12, 'visibility', 'PUBLIC');
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;

-- 01 administrator · 02 plain user · 03 organizer · 04 player · 05 reporter · 06 the one reported and suspended · 07 and 08
-- reviewers · 09 a second administrator, later revoked
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u23-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000023%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000023%';
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(6);
insert into public.platform_admins (user_id) values (pg_temp.u(1));
insert into public.platform_admins (user_id, revoked_at) values (pg_temp.u(9), now());

select pg_temp.act_as(pg_temp.u(3));
insert into ids values ('ev', public.create_event(gen_random_uuid(), pg_temp.input('S23 Etkinlik'), true));
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S23 Taslak'), false));
insert into ids values ('started', public.create_event(gen_random_uuid(), pg_temp.input('S23 Başlamış'), true));
select pg_temp.act_as(pg_temp.u(6));
insert into ids values ('ev6', public.create_event(gen_random_uuid(), pg_temp.input('S23 Askıdakinin etkinliği'), true));
select pg_temp.act_as(pg_temp.u(4));
select public.request_join(pg_temp.id('ev'));
select pg_temp.act_as(pg_temp.u(3));
select public.approve_participation(
  (select id from public.event_participations where event_id = pg_temp.id('ev') and user_id = pg_temp.u(4)));
select pg_temp.act_as(pg_temp.u(5));
insert into ids values ('r1', public.report('USER', pg_temp.u(6), 'SPAM', 'Reklam yapıyor'));
insert into ids values ('r3', public.report('EVENT', pg_temp.id('ev'), 'FAKE_EVENT'));
select pg_temp.act_as(pg_temp.u(4));
insert into ids values ('r2', public.report('USER', pg_temp.u(6), 'HARASSMENT'));
reset role;
update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.id('started');
-- One transaction has one clock: spread the reports out so that "oldest first" means something.
update public.reports set created_at = now() - interval '3 hours' where id = pg_temp.id('r1');
update public.reports set created_at = now() - interval '2 hours' where id = pg_temp.id('r2');
update public.reports set created_at = now() - interval '1 hour' where id = pg_temp.id('r3');

-- ---- who may call what ------------------------------------------------------------------------------------------------
select function_privs_are('public', 'admin_suspend_user', array['uuid', 'text'], 'anon', array[]::text[], 'guests may not');
select function_privs_are('public', 'admin_suspend_user', array['uuid', 'text'], 'authenticated', array['EXECUTE'], 'the gate is inside');
select function_privs_are('private', 'assert_admin_aal2', array[]::text[], 'authenticated', array[]::text[], 'the guard is internal');

create function pg_temp.calls() returns text[] language sql as $$
  select array[
    'select public.admin_list_reports()',
    format('select public.admin_get_report(%L)', pg_temp.id('r1')),
    format('select public.admin_resolve_report(%L, %L)', pg_temp.id('r1'), 'DISMISSED'),
    format('select public.admin_suspend_user(%L, %L)', pg_temp.u(4), 'x'),
    format('select public.admin_reinstate_user(%L, %L)', pg_temp.u(4), 'x'),
    format('select public.admin_cancel_event(%L, %L)', pg_temp.id('ev'), 'x'),
    format('select public.admin_hide_review(%L, %L)', gen_random_uuid(), 'x'),
    format('select public.admin_restore_review(%L, %L)', gen_random_uuid(), 'x'),
    format('select public.admin_list_reviews(%L, null)', pg_temp.u(4)),
    'select public.admin_list_disputes()',
    'select public.admin_list_flags()',
    format('select public.admin_get_user(%L)', pg_temp.u(4)),
    'select public.admin_search_users(''ki'')',
    'select public.admin_list_actions()'];
$$;
create function pg_temp.answers() returns text[] language sql as $$
  select array_agg(distinct pg_temp.try(c)) from unnest(pg_temp.calls()) c;
$$;
select is(array_length(pg_temp.calls(), 1), 14, 'fourteen admin functions are checked');

select pg_temp.act_as(pg_temp.u(2));
select is(pg_temp.answers(), array['NOT_ALLOWED'], 'a plain user is refused by every one of them');
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select is(pg_temp.answers(), array['NOT_ALLOWED'], '... even with a second factor');
select pg_temp.act_as(pg_temp.u(1), 'aal1');
select is(pg_temp.answers(), array['MFA_REQUIRED'], 'an administrator without the second factor is told so');
select pg_temp.act_as(pg_temp.u(9), 'aal2');
select is(pg_temp.answers(), array['NOT_ALLOWED'], 'a revoked administrator is a plain user');
reset role;
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(2);
select pg_temp.act_as(pg_temp.u(2));
select is(pg_temp.answers(), array['ACCOUNT_RESTRICTED'], 'a suspended account gets the account answer');
reset role;
update public.profiles set account_status = 'ACTIVE' where id = pg_temp.u(2);
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select lives_ok($$select public.admin_list_actions()$$, 'the administrator with the second factor gets through');
select throws_ok(format($$select public.admin_get_report(%L)$$, gen_random_uuid()), 'P0001', 'NOT_FOUND', 'an unknown report');

-- ---- the queue ----------------------------------------------------------------------------------------------------------
select is(jsonb_array_length(public.admin_list_reports() -> 'items'), 3, 'three open reports');
select is(public.admin_list_reports('OPEN', null, 2) -> 'items' -> 0 ->> 'id', pg_temp.id('r1')::text, 'the oldest first');
select isnt(public.admin_list_reports('OPEN', null, 2) -> 'next_cursor', 'null'::jsonb, 'a second page exists');
select is(jsonb_array_length(public.admin_list_reports('OPEN', public.admin_list_reports('OPEN', null, 2) -> 'next_cursor', 2) -> 'items'),
          1, 'and holds the last one');
select is(public.admin_list_reports('OPEN', null, 5) -> 'next_cursor', 'null'::jsonb, 'no cursor on the last page');
select throws_ok($$select public.admin_list_reports('NONE')$$, 'P0001', 'VALIDATION_FAILED', 'only open or closed');
select throws_ok($$select public.admin_list_reports('OPEN', '{"id":"nonsense"}')$$, 'P0001', 'VALIDATION_FAILED', 'a damaged cursor');
select is(public.admin_get_report(pg_temp.id('r1')) ->> 'details', 'Reklam yapıyor', 'the details of the report');
select is(public.admin_get_report(pg_temp.id('r1')) -> 'target' ->> 'name', 'Kişi 06', 'who it is about');
select is(jsonb_array_length(public.admin_get_report(pg_temp.id('r1')) -> 'others'), 1, 'and the other open report on them');
select is(public.admin_get_report(pg_temp.id('r3')) -> 'target' ->> 'name', 'S23 Etkinlik', 'an event as a target');
select is((public.admin_get_report(pg_temp.id('r1')) ->> 'open_for_target')::int, 2, 'how many are open on the target');

-- ---- deciding -----------------------------------------------------------------------------------------------------------
select throws_ok(format($$select public.admin_resolve_report(%L, 'MAYBE')$$, pg_temp.id('r1')), 'P0001', 'VALIDATION_FAILED', 'two outcomes only');
select is(public.admin_resolve_report(pg_temp.id('r1'), 'ACTIONED', '  Askıya alındı  '), 2, 'one decision closes both reports on the person');
select is(public.admin_resolve_report(pg_temp.id('r2'), 'ACTIONED'), 0, 'the same decision again changes nothing');
select throws_ok(format($$select public.admin_resolve_report(%L, 'DISMISSED')$$, pg_temp.id('r2')), 'P0001', 'INVALID_TRANSITION',
                 'a closed report is not reopened by another outcome');
select is(jsonb_array_length(public.admin_list_reports('OPEN') -> 'items'), 1, 'one report is left open');
select is(jsonb_array_length(public.admin_list_reports('CLOSED') -> 'items'), 2, 'two are closed');
reset role;
select is((select array_agg(status order by id) from public.reports where target_id = pg_temp.u(6)), array['ACTIONED', 'ACTIONED'],
          'both are marked');
select is((select count(*)::int from public.reports where target_id = pg_temp.u(6) and handled_by = pg_temp.u(1)), 2, 'by the administrator');
select is((select note from public.moderation_actions where action = 'REPORT_RESOLVED'), 'Askıya alındı', 'the note is trimmed and kept');
select is((select count(*)::int from private.audit_logs where action = 'REPORT_RESOLVED' and actor_id = pg_temp.u(1)), 1,
          'and the audit trail has it, without the note');
select ok((select metadata::text from private.audit_logs where action = 'REPORT_RESOLVED') !~ 'Askıya', 'no free text in the audit trail');

-- ---- suspending ---------------------------------------------------------------------------------------------------------
insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), pg_temp.u(6), now(), now());
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok(format($$select public.admin_suspend_user(%L, null)$$, pg_temp.u(6)), 'P0001', 'VALIDATION_FAILED', 'a reason is needed');
select throws_ok(format($$select public.admin_suspend_user(%L, %L)$$, pg_temp.u(1), 'kendim'), 'P0001', 'INVALID_TRANSITION', 'not oneself');
reset role;
insert into public.platform_admins (user_id) values (pg_temp.u(7));
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok(format($$select public.admin_suspend_user(%L, %L)$$, pg_temp.u(7), 'x'), 'P0001', 'INVALID_TRANSITION', 'not another administrator');
select throws_ok(format($$select public.admin_suspend_user(%L, %L)$$, gen_random_uuid(), 'x'), 'P0001', 'NOT_FOUND', 'not a stranger');
select lives_ok(format($$select public.admin_suspend_user(%L, %L)$$, pg_temp.u(6), 'Tekrarlanan reklam'), 'a person is suspended');
select lives_ok(format($$select public.admin_suspend_user(%L, %L)$$, pg_temp.u(6), 'Tekrarlanan reklam'), 'and the second time changes nothing');
reset role;
delete from public.platform_admins where user_id = pg_temp.u(7);
select is((select account_status::text from public.profiles where id = pg_temp.u(6)), 'SUSPENDED', 'the status changed');
select is((select count(*)::int from auth.sessions where user_id = pg_temp.u(6)), 0, 'their sessions ended');
select is((select count(*)::int from public.moderation_actions where action = 'USER_SUSPENDED'), 1, 'recorded once');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok(format($$select public.request_join(%L)$$, pg_temp.id('ev')), 'P0001', 'ACCOUNT_RESTRICTED', 'they cannot act');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok(format($$select public.get_player_card(%L)$$, pg_temp.u(6)), 'P0001', 'NOT_FOUND', 'nobody can open their card');
select is(public.get_event(pg_temp.id('ev6')), null, 'their event does not show');
select is((select count(*)::int from jsonb_array_elements(public.search_events('{}') -> 'items') i
            where i ->> 'id' = pg_temp.id('ev6')::text), 0, 'or in the search');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select lives_ok(format($$select public.admin_reinstate_user(%L, %L)$$, pg_temp.u(6), 'Yanlışlık'), 'a suspended person is reinstated');
select lives_ok(format($$select public.admin_reinstate_user(%L, %L)$$, pg_temp.u(6), 'Yanlışlık'), 'twice changes nothing');
reset role;
select is((select account_status::text from public.profiles where id = pg_temp.u(6)), 'ACTIVE', 'they are active again');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() where id = pg_temp.u(8);
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok(format($$select public.admin_reinstate_user(%L, %L)$$, pg_temp.u(8), 'x'), 'P0001', 'INVALID_TRANSITION',
                 'a deletion in progress is not undone this way');
select throws_ok(format($$select public.admin_suspend_user(%L, %L)$$, pg_temp.u(8), 'x'), 'P0001', 'INVALID_TRANSITION',
                 'nor suspended');

-- ---- canceling an event -------------------------------------------------------------------------------------------------
select throws_ok(format($$select public.admin_cancel_event(%L, %L)$$, pg_temp.id('draft'), 'x'), 'P0001', 'INVALID_TRANSITION', 'a draft is not canceled');
select throws_ok(format($$select public.admin_cancel_event(%L, %L)$$, pg_temp.id('started'), 'x'), 'P0001', 'INVALID_TRANSITION', 'an event that began is not canceled');
select throws_ok(format($$select public.admin_cancel_event(%L, null)$$, pg_temp.id('ev')), 'P0001', 'VALIDATION_FAILED', 'a reason is needed');
select lives_ok(format($$select public.admin_cancel_event(%L, %L)$$, pg_temp.id('ev'), 'Sahte etkinlik'), 'a published event is canceled');
select lives_ok(format($$select public.admin_cancel_event(%L, %L)$$, pg_temp.id('ev'), 'Sahte etkinlik'), 'and again, with no change');
reset role;
select is((select cancel_reason::text from public.events where id = pg_temp.id('ev')), 'MODERATION', 'the reason says so');
select is((select cancel_message from public.events where id = pg_temp.id('ev')), null, 'and carries no note');
select is((select count(*)::int from public.notifications where type = 'EVENT_CANCELED' and user_id = pg_temp.u(4)), 1,
          'the participant is told');
select is((select count(*)::int from public.notifications where type = 'EVENT_CANCELED' and user_id = pg_temp.u(3)), 0,
          'the organizer is not yet (M6)');
select is((select count(*)::int from public.moderation_actions where action = 'EVENT_CANCELED_BY_ADMIN'), 1, 'recorded once');

-- ---- reviews, disputes and flags ----------------------------------------------------------------------------------------
-- Direct inserts: these tests are about what an administrator sees, not about how a review gets written.
set local session_replication_role = replica;
insert into public.skill_reviews (id, event_id, reviewer_id, reviewee_id, sport_id, skill_score, fair_play) values
  ('00000000-0000-4000-8000-000000002301', pg_temp.id('ev'), pg_temp.u(7), pg_temp.u(8), pg_temp.football(), 5, true),
  ('00000000-0000-4000-8000-000000002302', pg_temp.id('ev'), pg_temp.u(8), pg_temp.u(7), pg_temp.football(), 5, false),
  ('00000000-0000-4000-8000-000000002303', pg_temp.id('draft'), pg_temp.u(7), pg_temp.u(8), pg_temp.football(), 5, false),
  ('00000000-0000-4000-8000-000000002304', pg_temp.id('draft'), pg_temp.u(8), pg_temp.u(7), pg_temp.football(), 5, false);
-- Ten reviews by 05: three of them far from what 02 gave the same person.
insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score)
select pg_temp.id('ev6'), pg_temp.u(5), ('00000000-0000-4000-8000-0000000239' || lpad(n::text, 2, '0'))::uuid, pg_temp.football(), case when n <= 3 then 5 else 3 end
  from generate_series(1, 10) n;
insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score)
select pg_temp.id('ev6'), pg_temp.u(2), ('00000000-0000-4000-8000-0000000239' || lpad(n::text, 2, '0'))::uuid, pg_temp.football(), 2
  from generate_series(1, 3) n;
insert into public.reliability_events (user_id, participation_id, event_id, kind, weight, occurred_at)
select pg_temp.u(4), gen_random_uuid(), pg_temp.id('ev'), 'NO_SHOW', 0, now() - (n || ' days')::interval from generate_series(1, 3) n;
insert into public.reliability_events (user_id, participation_id, event_id, kind, weight, occurred_at)
select pg_temp.u(2), gen_random_uuid(), pg_temp.id('ev'), 'NO_SHOW', 0, now() - (n * 20 || ' days')::interval from generate_series(1, 3) n;
insert into public.attendance_disputes (participation_id, reason)
select id, 'Oradaydım' from public.event_participations where event_id = pg_temp.id('ev') and user_id = pg_temp.u(4);
insert into public.attendance_disputes (participation_id, reason, status, resolution, resolved_by, resolved_at)
select id, 'Eski', 'RESOLVED', 'PRESENT', pg_temp.u(1), now()
  from public.event_participations where event_id = pg_temp.id('ev') and user_id = pg_temp.u(3);
insert into public.user_sport_ratings (user_id, sport_id, rating, confidence, sample_events)
values (pg_temp.u(8), pg_temp.football(), 4.50, 0.5, 2);
set local session_replication_role = origin;

select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok($$select public.admin_list_reviews(null, null)$$, 'P0001', 'VALIDATION_FAILED', 'a person is needed to list reviews');
select is(jsonb_array_length(public.admin_list_reviews(pg_temp.u(7), null)), 2, 'the reviews one person wrote');
select is(public.admin_list_reviews(null, pg_temp.u(7)) -> 0 ->> 'reviewer_name', 'Kişi 08', 'and the ones they got, with names');
select is(jsonb_array_length(public.admin_list_disputes()), 1, 'one dispute waits');
select is(public.admin_list_disputes() -> 0 ->> 'reason', 'Oradaydım', 'with its reason');
select is((select array_agg(f ->> 'kind' order by f ->> 'kind') from jsonb_array_elements(public.admin_list_flags()) f),
          array['MUTUAL_FIVE', 'NO_SHOWS', 'REVIEW_BOMBING'], 'one flag of each kind, and no more');
select is((select (f ->> 'count')::int from jsonb_array_elements(public.admin_list_flags()) f where f ->> 'kind' = 'MUTUAL_FIVE'),
          2, 'two events of mutual top scores');
select is((select f -> 'subjects' -> 0 ->> 'name' from jsonb_array_elements(public.admin_list_flags()) f where f ->> 'kind' = 'NO_SHOWS'),
          'Kişi 04', 'three no-shows in 30 days, and not three in 60');
select is((select f -> 'subjects' -> 0 ->> 'name' from jsonb_array_elements(public.admin_list_flags()) f where f ->> 'kind' = 'REVIEW_BOMBING'),
          'Kişi 05', 'a reviewer far from the others');
select lives_ok($$select public.admin_hide_review('00000000-0000-4000-8000-000000002301', 'Kasıtlı')$$, 'a review is hidden');
select lives_ok($$select public.admin_hide_review('00000000-0000-4000-8000-000000002301', 'Kasıtlı')$$, 'and again, with no change');
reset role;
select is((select status from public.skill_reviews where id = '00000000-0000-4000-8000-000000002301'), 'HIDDEN', 'it is hidden');
select is((select count(*)::int from public.user_sport_ratings where user_id = pg_temp.u(8)), 0, 'the rating was computed again');
select is((select count(*)::int from public.moderation_actions where action = 'REVIEW_HIDDEN'), 1, 'recorded once');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is((select count(*)::int from jsonb_array_elements(public.admin_list_flags()) f where f ->> 'kind' = 'MUTUAL_FIVE'),
          0, 'a hidden review no longer counts towards a flag: one event is not a pattern');
select lives_ok($$select public.admin_restore_review('00000000-0000-4000-8000-000000002301', 'Yanlış karar')$$, 'and can be restored');
select throws_ok(format($$select public.admin_hide_review(%L, %L)$$, gen_random_uuid(), 'x'), 'P0001', 'NOT_FOUND', 'an unknown review');

-- ---- looking around -----------------------------------------------------------------------------------------------------
select is(jsonb_array_length(public.admin_search_users('Kişi 0')), 9, 'a name search');
select is(jsonb_array_length(public.admin_search_users('Kişi %')), 0, 'a percent sign is a character, not a pattern');
select throws_ok($$select public.admin_search_users('k')$$, 'P0001', 'VALIDATION_FAILED', 'at least two letters');
select is((public.admin_get_user(pg_temp.u(6)) ->> 'reports_total')::int, 2, 'a person, with their reports');
select is(public.admin_get_user(pg_temp.u(6)) -> 'history' -> 0 ->> 'action', 'USER_REINSTATED', 'and what was decided, newest first');
select is(jsonb_array_length(public.admin_list_actions(null, 3) -> 'items'), 3, 'the audit list pages');
select isnt(public.admin_list_actions(null, 3) -> 'next_cursor', 'null'::jsonb, 'with a cursor');
select is(public.admin_list_actions(public.admin_list_actions(null, 3) -> 'next_cursor', 50) -> 'items' -> 0 ->> 'action',
          'USER_REINSTATED', 'and the next page goes back in time');
select is(public.admin_list_actions() -> 'items' -> 0 ->> 'actor_name', 'Kişi 01', 'by whom');

-- ---- nothing can be changed afterwards ----------------------------------------------------------------------------------
reset role;
select throws_ok($$update public.moderation_actions set note = 'başka'$$, '42501', null, 'an entry cannot be edited');
select throws_ok($$delete from public.moderation_actions$$, '42501', null, 'or deleted');
select throws_ok($$truncate public.moderation_actions$$, '42501', null, 'or emptied');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok($$select * from public.moderation_actions$$, '42501', null, 'and the table is not readable, even to an administrator');

select * from finish();
rollback;
