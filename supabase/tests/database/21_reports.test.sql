-- Phase 6 / M2: reporting (S-16, FL-9). Who may report what, and what the reporter and the target can learn.
begin;
select plan(38);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000021' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.input(p_title text, p_visibility text default 'PUBLIC') returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '290 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12, 'visibility', p_visibility);
$$;

-- 01 reporter · 02 organizer of a public event · 03 fellow player · 04 stranger, private profile · 05 organizer of a private event
-- · 06 public profile · 07 not a real target for 01 · 08 deleted later · 09 report-happy
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u21-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000021%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000021%';
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(6);

select pg_temp.act_as(pg_temp.u(2));
insert into ids values ('pub', public.create_event(gen_random_uuid(), pg_temp.input('S21 Herkese açık'), true));
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S21 Taslak'), false));
select pg_temp.act_as(pg_temp.u(5));
insert into ids values ('inv', public.create_event(gen_random_uuid(), pg_temp.input('S21 Davetli', 'INVITE_ONLY'), true));
select pg_temp.act_as(pg_temp.u(1)); select public.request_join(pg_temp.ev('pub'));
select pg_temp.act_as(pg_temp.u(3)); select public.request_join(pg_temp.ev('pub'));
select pg_temp.act_as(pg_temp.u(2));
select public.approve_participation(pg_temp.part('pub', 1));
select public.approve_participation(pg_temp.part('pub', 3));
reset role;
create temp table tokens as select id, invite_token from public.events;
grant select on tokens to authenticated;

-- ---- access ------------------------------------------------------------------------------------------------------------
select table_privs_are('public', 'reports', 'anon', array[]::text[], 'guests read nothing');
select table_privs_are('public', 'reports', 'authenticated', array[]::text[], 'no table-wide rights, only some columns');
select ok(has_column_privilege('authenticated', 'public.reports', 'details', 'select'), 'the reporter reads what they wrote');
select ok(not has_column_privilege('authenticated', 'public.reports', 'handled_by', 'select'), 'but not who handled it');
select ok(not has_column_privilege('authenticated', 'public.reports', 'status', 'select'), 'nor what was decided');
select function_privs_are('public', 'report', array['text', 'uuid', 'text', 'text', 'text'], 'anon', array[]::text[], 'guests cannot report');
select function_privs_are('private', 'can_report_user', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'the check is internal');

-- ---- validation ----------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format($$select public.report('VENUE', %L, 'SPAM')$$, pg_temp.ev('pub')), 'P0001', 'VALIDATION_FAILED', 'venues wait for Phase 4');
select throws_ok(format($$select public.report('EVENT', %L, 'BAD')$$, pg_temp.ev('pub')), 'P0001', 'VALIDATION_FAILED', 'an unknown reason');
select throws_ok(format($$select public.report('EVENT', %L, 'OTHER', repeat('x', 1001))$$, pg_temp.ev('pub')), 'P0001', 'VALIDATION_FAILED', 'details too long');
select throws_ok(format($$select public.report('USER', %L, 'SPAM')$$, pg_temp.u(1)), 'P0001', 'VALIDATION_FAILED', 'not yourself');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format($$select public.report('EVENT', %L, 'SPAM')$$, pg_temp.ev('pub')), 'P0001', 'VALIDATION_FAILED', 'not your own event');

-- ---- what can be reported: only what the reporter could see -----------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select lives_ok(format($$select public.report('EVENT', %L, 'FAKE_EVENT', '  Sahte  ')$$, pg_temp.ev('pub')), 'a public event');
select is((select details from public.reports where target_id = pg_temp.ev('pub')), 'Sahte', 'the text is trimmed');
select lives_ok(format($$select public.report('USER', %L, 'HARASSMENT')$$, pg_temp.u(2)), 'the organizer of a public event');
select lives_ok(format($$select public.report('USER', %L, 'UNSAFE')$$, pg_temp.u(3)), 'someone approved in the same event');
select lives_ok(format($$select public.report('USER', %L, 'SPAM')$$, pg_temp.u(6)), 'a public profile');
select throws_ok(format($$select public.report('USER', %L, 'SPAM')$$, pg_temp.u(4)), 'P0001', 'NOT_FOUND', 'a stranger with a private profile');
select throws_ok($$select public.report('USER', gen_random_uuid(), 'SPAM')$$, 'P0001', 'NOT_FOUND', 'the same as someone who does not exist');
select throws_ok(format($$select public.report('EVENT', %L, 'SPAM')$$, pg_temp.ev('draft')), 'P0001', 'NOT_FOUND', 'a draft');
select throws_ok(format($$select public.report('EVENT', %L, 'SPAM')$$, pg_temp.ev('inv')), 'P0001', 'NOT_FOUND', 'an invite-only event without its link');
select lives_ok(format($$select public.report('EVENT', %L, 'SPAM', null, %L)$$, pg_temp.ev('inv'),
  (select invite_token from tokens where id = pg_temp.ev('inv'))), 'with the link it can be reported');

-- ---- twice, and blocked -------------------------------------------------------------------------------------------------------
select is(public.report('EVENT', pg_temp.ev('pub'), 'SPAM'), (select id from public.reports where target_id = pg_temp.ev('pub')), 'reporting again returns the first report');
select is((select count(*)::int from public.reports where target_id = pg_temp.ev('pub')), 1, 'and adds nothing');
select public.block_user(pg_temp.u(3));
select is((select count(*)::int from public.reports where target_id = pg_temp.u(3)), 1, 'blocking leaves the report');
select pg_temp.act_as(pg_temp.u(3));
select is((select count(*)::int from public.reports), 0, 'the target cannot read reports about them');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$update public.reports set reason = 'OTHER'$$, '42501', null, 'nobody edits a report');
select throws_ok($$delete from public.reports$$, '42501', null, 'nor deletes one');
reset role;

-- ---- closed reports: the same thing may be reported again -----------------------------------------------------------------------
update public.reports set status = 'DISMISSED', handled_at = now() where target_id = pg_temp.u(2);
select pg_temp.act_as(pg_temp.u(1));
select lives_ok(format($$select public.report('USER', %L, 'HARASSMENT')$$, pg_temp.u(2)), 'after one is closed, a new one can be filed');
reset role;
select is((select count(*)::int from public.reports where target_id = pg_temp.u(2)), 2, 'there are two now');

-- ---- rate limit (S-16) -------------------------------------------------------------------------------------------------------------
insert into public.reports (reporter_id, target_type, target_id, reason)
select pg_temp.u(9), 'EVENT', gen_random_uuid(), 'SPAM' from generate_series(1, 19);
select pg_temp.act_as(pg_temp.u(9));
select lives_ok(format($$select public.report('EVENT', %L, 'SPAM')$$, pg_temp.ev('pub')), 'the 20th of the day');
select throws_ok(format($$select public.report('USER', %L, 'SPAM')$$, pg_temp.u(6)), 'P0001', 'RATE_LIMITED', 'the 21st is refused');
select lives_ok(format($$select public.report('EVENT', %L, 'SPAM')$$, pg_temp.ev('pub')), 'repeating an open one is still answered');
select throws_ok($$select reporter_id from public.reports$$, '42501', null, 'who reported is not a readable column, even of my own');
reset role;

-- ---- account lifecycle (ADR-0017) ----------------------------------------------------------------------------------------------------
select is(jsonb_array_length(private.export_event_data(pg_temp.u(1)) -> 'reports_written'), 6, 'what I wrote is in the export');
select is(jsonb_array_length(private.export_event_data(pg_temp.u(2)) -> 'reports_written'), 0, 'reports about me are not: they would identify the reporter');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(1);
select ok(private.purge_account(pg_temp.u(1)), 'the account is purged');
select is((select count(*)::int from public.reports where reporter_id = pg_temp.u(1) and details is not null), 0, 'the free text is gone, the reports stay');

select * from finish();
rollback;
