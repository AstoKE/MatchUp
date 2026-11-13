-- ROADMAP P-23: snapshot accuracy, data minimization and the second-factor boundary.
begin;
select plan(28);
-- Other local suites can leave queues behind. These deletions are rolled back.
delete from public.reports;
delete from public.organizations where status = 'PENDING';
delete from public.businesses where status = 'PENDING';
delete from public.feedback;
delete from public.attendance_disputes;

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000042' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table snapshot (value jsonb);
grant all on snapshot to authenticated;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.city() returns uuid language sql as $$ select id from public.cities where slug = 'ankara'; $$;

insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u42-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 3) n;
update public.profiles set display_name = 'Dashboard secret name', adult_confirmed_at = now(),
  created_at = now() - interval '30 days', onboarded_at = now()
  where id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
  cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
  where p.id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.platform_admins (user_id) values (pg_temp.u(1));

select ok(not has_function_privilege('anon', 'public.admin_dashboard_summary()', 'execute'), 'guests have no execute');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok('select public.admin_dashboard_summary()', 'P0001', 'NOT_ALLOWED', 'player is refused');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok('select public.admin_dashboard_summary()', 'P0001', 'MFA_REQUIRED', 'admin needs second factor');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
insert into snapshot values (public.admin_dashboard_summary());
select is((select value #>> '{reports,count}' from snapshot), '0', 'empty count');
select is((select value #> '{reports,oldest_at}' from snapshot), 'null'::jsonb, 'empty oldest is null');
select is((select value #> '{reports,by_type}' from snapshot), '{"USER":0,"EVENT":0,"VENUE":0,"ORGANIZATION":0}'::jsonb, 'all report types present when empty');
delete from snapshot;

-- A real event and participation provide the dispute's foreign key.
select pg_temp.act_as(pg_temp.u(3));
insert into ids values ('event', public.create_event(gen_random_uuid(), jsonb_build_object(
  'sport_id', (select id from public.sports where slug = 'football'),
  'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id where s.slug = 'football' and f.slug = '5v5'),
  'title', 'Dashboard fixture', 'starts_at', (now() + interval '290 days')::text,
  'duration_minutes', 90, 'city_id', pg_temp.city(),
  'district_id', (select id from public.districts where slug = 'cankaya'),
  'location_label', 'Fixture court', 'capacity', 12, 'visibility', 'PUBLIC'), true));
select pg_temp.act_as(pg_temp.u(2));
select public.request_join(pg_temp.id('event'));
reset role;
insert into public.attendance_disputes (participation_id, created_at)
select id, '2000-01-01Z'::timestamptz from public.event_participations where event_id = pg_temp.id('event') and user_id = pg_temp.u(2);
insert into public.reports (reporter_id, target_type, target_id, reason, status, handled_at, created_at) values
  (pg_temp.u(2), 'USER', pg_temp.u(3), 'SPAM', 'OPEN', null, '2000-01-01Z'),
  (pg_temp.u(2), 'EVENT', pg_temp.id('event'), 'SPAM', 'OPEN', null, '2000-01-02Z'),
  (pg_temp.u(3), 'USER', pg_temp.u(2), 'SPAM', 'DISMISSED', now(), '1999-01-01Z');
insert into public.organizations (name, city_id, sport_ids, created_by, status, decided_at, created_at) values
  ('Pending fixture', pg_temp.city(), array[(select id from public.sports where slug = 'football')], pg_temp.u(2), 'PENDING', null, '2000-01-01Z'),
  ('Active fixture', pg_temp.city(), array[(select id from public.sports where slug = 'football')], pg_temp.u(2), 'ACTIVE', now(), '1999-01-01Z');
insert into public.businesses (name, city_id, created_by, status, created_at) values
  ('Pending fixture', pg_temp.city(), pg_temp.u(2), 'PENDING', '2000-01-01Z'),
  ('Active fixture', pg_temp.city(), pg_temp.u(2), 'ACTIVE', '1999-01-01Z');
insert into public.feedback (user_id, kind, body, status, handled_at, created_at) values
  (pg_temp.u(2), 'REQUEST', 'Dashboard fixture feedback', 'NEW', null, '2000-01-01Z'),
  (pg_temp.u(2), 'REQUEST', 'Already handled feedback', 'DONE', now(), '1999-01-01Z');
-- Dates and insertion order deliberately differ: recent means timestamp, with id breaking ties.
insert into public.moderation_actions (actor_id, action, target_type, target_id, note, created_at)
select pg_temp.u(1), 'USER_SUSPENDED', 'USER', pg_temp.u(2), 'Action ' || n,
  '2100-01-01Z'::timestamptz + (13 - n) * interval '1 hour' from generate_series(1, 12) n;
select pg_temp.act_as(pg_temp.u(1), 'aal2');
insert into snapshot values (public.admin_dashboard_summary());
select is((select value #>> '{reports,count}' from snapshot), '2', 'only open reports');
select is((select value #> '{reports,by_type}' from snapshot), '{"USER":1,"EVENT":1,"VENUE":0,"ORGANIZATION":0}'::jsonb, 'correct report breakdown');
select is((select value #>> '{organization_requests,count}' from snapshot), '1', 'only pending organizations');
select is((select value #>> '{business_requests,count}' from snapshot), '1', 'only pending businesses');
select is((select value #>> '{feedback,count}' from snapshot), '1', 'only new feedback');
select is((select value #>> '{disputes,count}' from snapshot), '1', 'only open disputes');
select is((select (value #>> '{reports,oldest_at}')::timestamptz from snapshot), '2000-01-01Z'::timestamptz, 'oldest open report');
select is((select (value #>> '{organization_requests,oldest_at}')::timestamptz from snapshot), '2000-01-01Z'::timestamptz, 'oldest pending organization');
select is((select (value #>> '{business_requests,oldest_at}')::timestamptz from snapshot), '2000-01-01Z'::timestamptz, 'oldest pending business');
select is((select (value #>> '{feedback,oldest_at}')::timestamptz from snapshot), '2000-01-01Z'::timestamptz, 'oldest new feedback');
select is((select (value #>> '{disputes,oldest_at}')::timestamptz from snapshot), '2000-01-01Z'::timestamptz, 'oldest open dispute');
select is((select (value #>> '{flags,count}')::int from snapshot), jsonb_array_length(public.admin_list_flags()), 'flags reuse existing function');
select is((select jsonb_array_length(value -> 'recent_actions') from snapshot), 10, 'recent actions capped at ten');
select is((select value #>> '{recent_actions,0,note}' from snapshot), 'Action 1', 'newest timestamp first');
select is((select value #>> '{recent_actions,9,note}' from snapshot), 'Action 10', 'descending timestamp through tenth');
select ok((select not exists (select 1 from jsonb_array_elements(value -> 'recent_actions') a
  where not (a ?& array['action','target_type','note','created_at']) or a ? 'actor_id' or a ? 'target_id') from snapshot), 'actions expose only required fields');
select ok((select value ?& array['generated_at','reports','organization_requests','business_requests','feedback','disputes','flags','recent_actions'] from snapshot), 'all summary keys present');
select ok((select value::text !~ 'display_name|email|Dashboard secret name|@test.invalid' from snapshot), 'no names or emails');
select is((select (value ->> 'generated_at')::timestamptz from snapshot), now(), 'generated timestamp');
reset role;
update public.attendance_disputes set status = 'RESOLVED', resolution = 'ABSENT', resolved_by = pg_temp.u(1), resolved_at = now()
  where participation_id = (select id from public.event_participations where event_id = pg_temp.id('event') and user_id = pg_temp.u(2));
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is(public.admin_dashboard_summary() #>> '{disputes,count}', '0', 'resolved disputes excluded');
reset role;
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(1);
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok('select public.admin_dashboard_summary()', 'P0001', 'ACCOUNT_RESTRICTED', 'suspended admin refused');
reset role;
update public.profiles set account_status = 'ACTIVE' where id = pg_temp.u(1);
update public.platform_admins set revoked_at = now() where user_id = pg_temp.u(1);
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok('select public.admin_dashboard_summary()', 'P0001', 'NOT_ALLOWED', 'revoked admin refused');
select * from finish();
rollback;
