-- Phase 6 / M6: tighter quotas for new accounts, display names, and the notifications an administrator's decisions send.
begin;
select plan(39);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000024' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.input(p_title text) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title, 'starts_at', (now() + interval '280 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12, 'visibility', 'PUBLIC');
$$;
create function pg_temp.mk(p_title text) returns uuid language sql as $$
  select public.create_event(gen_random_uuid(), pg_temp.input(p_title), true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end;
$$;

-- 01 administrator · 02 new organizer · 03 old organizer · 04 new player · 05 old player · 06 reporter · 07 second reporter
-- · 08 reported · 09 organizer of the event for reminders · 10 a second old organizer
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u24-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 10) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000024%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000024%';
update public.profiles set created_at = now() - interval '30 days' where id in (pg_temp.u(1), pg_temp.u(3), pg_temp.u(5), pg_temp.u(6), pg_temp.u(7), pg_temp.u(9), pg_temp.u(10));
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(8);
insert into public.platform_admins (user_id) values (pg_temp.u(1));
update public.app_config set value = '2'::jsonb where key = 'quota.new_account_max_open_requests';

-- ---- a new account: tighter quotas -------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(pg_temp.try($$select pg_temp.mk('S24 N1')$$), 'ok', 'a new organizer creates one event');
select is(pg_temp.try($$select pg_temp.mk('S24 N2')$$), 'ok', 'and a second');
select is(pg_temp.try($$select pg_temp.mk('S24 N3')$$), 'QUOTA_EXCEEDED', 'but not a third in a day');
select pg_temp.act_as(pg_temp.u(3));
select is(pg_temp.try($$select pg_temp.mk('S24 O1')$$), 'ok', 'an older account is held to the usual limit');
select is(pg_temp.try($$select pg_temp.mk('S24 O2')$$), 'ok', 'which allows a second');
select is(pg_temp.try($$select pg_temp.mk('S24 O3')$$), 'ok', 'and a third');
insert into ids select 'e' || n, public.create_event(gen_random_uuid(), pg_temp.input('S24 Q' || n), true) from generate_series(1, 2) n;
reset role;
select is(private.account_quota(pg_temp.u(2), 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2), 2,
          'the helper says 2 for a new account');
select is(private.account_quota(pg_temp.u(3), 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2), 10,
          'and the usual 10 for an old one');
update public.app_config set value = '100'::jsonb where key = 'quota.new_account_max_events_per_day';
select is(private.account_quota(pg_temp.u(2), 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2), 10,
          'a tighter value never loosens the usual one');
update public.app_config set value = '2'::jsonb where key = 'quota.new_account_max_events_per_day';
update public.app_config set value = '1'::jsonb where key = 'quota.new_account_days';
select is(private.account_quota(pg_temp.u(2), 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2), 2,
          'the age that counts as new is a setting: 1 day still holds');
update public.profiles set created_at = now() - interval '2 days' where id = pg_temp.u(2);
select is(private.account_quota(pg_temp.u(2), 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2), 10,
          'and a 2-day-old account is no longer new');
update public.profiles set created_at = now() where id = pg_temp.u(2);
update public.app_config set value = '7'::jsonb where key = 'quota.new_account_days';

-- open requests: the setting was lowered to 2 for this test
select pg_temp.act_as(pg_temp.u(4));
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e1'))), 'ok', 'a new player sends a request');
select pg_temp.act_as(pg_temp.u(10));
insert into ids values ('e3', public.create_event(gen_random_uuid(), pg_temp.input('S24 Q3'), true));
select pg_temp.act_as(pg_temp.u(4));
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e2'))), 'ok', 'and a second');
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e3'))), 'QUOTA_EXCEEDED', 'but not a third open one');
select pg_temp.act_as(pg_temp.u(5));
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e1'))), 'ok', 'an old player is not held to it');
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e2'))), 'ok', 'for a second');
select is(pg_temp.try(format($$select public.request_join(%L)$$, pg_temp.id('e3'))), 'ok', 'and a third');
reset role;

-- ---- display names -----------------------------------------------------------------------------------------------------------
select is(private.clean_display_name('  Ayşe Yılmaz  '), 'Ayşe Yılmaz', 'a name is trimmed');
select throws_ok($$select private.clean_display_name('ali.com')$$, 'P0001', 'VALIDATION_FAILED', 'no web address');
select throws_ok($$select private.clean_display_name('http://x')$$, 'P0001', 'VALIDATION_FAILED', 'no link');
select throws_ok($$select private.clean_display_name('ali@ornek')$$, 'P0001', 'VALIDATION_FAILED', 'no e-mail address');
select throws_ok($$select private.clean_display_name('Ara 0532 123 45 67')$$, 'P0001', 'VALIDATION_FAILED', 'no phone number');
select throws_ok($$select private.clean_display_name('(0532)123-45-67')$$, 'P0001', 'VALIDATION_FAILED', 'whatever separates its digits');
select is(private.clean_display_name('Mert 2026'), 'Mert 2026', 'a few digits are fine');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok($$select public.update_my_profile('ali.com', null, null, null)$$, 'P0001', 'VALIDATION_FAILED', 'the profile update refuses it too');
reset role;

-- ---- what a decision sends ---------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(8));
insert into ids values ('ev8', public.create_event(gen_random_uuid(), pg_temp.input('S24 Hedef'), true));
select pg_temp.act_as(pg_temp.u(6));
insert into ids values ('r1', public.report('USER', pg_temp.u(8), 'SPAM'));
select pg_temp.act_as(pg_temp.u(7));
insert into ids values ('r2', public.report('USER', pg_temp.u(8), 'HARASSMENT'));
reset role;
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select public.admin_resolve_report(pg_temp.id('r1'), 'ACTIONED', 'x');
select public.admin_resolve_report(pg_temp.id('r1'), 'ACTIONED', 'x');
reset role;
select is((select count(*)::int from public.notifications where type = 'REPORT_OUTCOME' and user_id in (pg_temp.u(6), pg_temp.u(7))), 2,
          'both reporters are thanked, once');
select is((select count(*)::int from public.notifications where type = 'REPORT_OUTCOME' and user_id = pg_temp.u(8)), 0, 'the one reported is told nothing');
select is((select payload from public.notifications where type = 'REPORT_OUTCOME' limit 1), '{}'::jsonb, 'and nothing of the decision is in it');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select public.admin_suspend_user(pg_temp.u(8), 'x');
reset role;
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(8)), 0, 'a suspension sends nothing (a suspended person sees a page)');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select public.admin_reinstate_user(pg_temp.u(8), 'x');
select public.admin_cancel_event(pg_temp.id('ev8'), 'x');
reset role;
select is((select count(*)::int from public.notifications where type = 'ACCOUNT_REINSTATED' and user_id = pg_temp.u(8)), 1, 'a reinstated person is told');
select is((select payload ->> 'event_id' from public.notifications where type = 'EVENT_CANCELED_BY_ADMIN' and user_id = pg_temp.u(8)),
          pg_temp.id('ev8')::text, 'the organizer is told which event an administrator canceled');

-- ---- reminders ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(9));
insert into ids values ('rem', public.create_event(gen_random_uuid(), pg_temp.input('S24 Hatırlatma'), true));
insert into ids values ('empty', public.create_event(gen_random_uuid(), pg_temp.input('S24 Boş'), true));
insert into ids values ('old', public.create_event(gen_random_uuid(), pg_temp.input('S24 Eski'), true));
insert into ids values ('fin', public.create_event(gen_random_uuid(), pg_temp.input('S24 Kesin'), true));
select pg_temp.act_as(pg_temp.u(5));
select public.request_join(pg_temp.id('rem'));
select public.request_join(pg_temp.id('old'));
select public.request_join(pg_temp.id('fin'));
select pg_temp.act_as(pg_temp.u(9));
select public.approve_participation(id) from public.event_participations
 where user_id = pg_temp.u(5) and event_id in (pg_temp.id('rem'), pg_temp.id('old'), pg_temp.id('fin'));
reset role;
update public.events set starts_at = now() - interval '5 hours' where id in (pg_temp.id('rem'), pg_temp.id('empty'), pg_temp.id('fin'));
update public.events set starts_at = now() - interval '5 days' where id = pg_temp.id('old');
select pg_temp.act_as(pg_temp.u(9));
select public.complete_event(pg_temp.id('fin'));
select public.finalize_attendance(pg_temp.id('fin'));
reset role;
select is(private.send_attendance_reminders(now()), 1, 'an ended event with a player gets one reminder');
select is(private.send_attendance_reminders(now()), 0, 'and not a second one for the same stage');
select is((select payload ->> 'stage' from public.notifications where type = 'ATTENDANCE_REMINDER'), 'DUE', 'at the end of the event');
select is((select payload ->> 'event_id' from public.notifications where type = 'ATTENDANCE_REMINDER'), pg_temp.id('rem')::text,
          'for that event, and not for one without a player, a final one or one from last week');
select is(private.send_attendance_reminders(now() + interval '25 hours'), 1, 'a day later there is another');
select is(private.send_attendance_reminders(now() + interval '25 hours'), 0, 'once');
select is((select count(*)::int from public.notifications where type = 'ATTENDANCE_REMINDER' and user_id = pg_temp.u(9)), 2, 'two in all, to the organizer');
select is(private.send_attendance_reminders(now() + interval '4 days'), 0, 'old history is left alone');

select * from finish();
rollback;
