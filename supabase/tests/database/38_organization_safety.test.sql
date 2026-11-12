-- Phase 9 / M4 (ADR-0030): reporting, hiding and restoring an organization.
begin;
select plan(17);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000038' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;

-- 01 owner · 02 reporter · 03 administrator · 04 member
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u38-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000038%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000038%';
insert into public.platform_admins (user_id) values (pg_temp.u(3));
insert into public.organizations (name, city_id, sport_ids, status, created_by, decided_at)
values ('Kulüp 38', (select id from public.cities where slug = 'ankara'),
        array[(select id from public.sports where slug = 'football')], 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'org', id from public.organizations where name = 'Kulüp 38';
insert into public.organization_members (organization_id, user_id, role) values
  (pg_temp.id('org'), pg_temp.u(1), 'OWNER'), (pg_temp.id('org'), pg_temp.u(4), 'MEMBER');

-- Reporting.
select pg_temp.act_as(pg_temp.u(2));
insert into ids values ('r1', public.report('ORGANIZATION', pg_temp.id('org'), 'INAPPROPRIATE', 'Adı hakaret içeriyor.'));
select is(public.report('ORGANIZATION', pg_temp.id('org'), 'SPAM'), pg_temp.id('r1'), 'a second report while one is open is the same report');
select throws_ok(format('select public.report(''ORGANIZATION'', %L, ''SPAM'')', gen_random_uuid()), 'P0001', 'NOT_FOUND',
  'an unknown organization cannot be reported');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format('select public.report(''ORGANIZATION'', %L, ''SPAM'')', pg_temp.id('org')), 'P0001', 'VALIDATION_FAILED',
  'nor one''s own');
reset role;
select is((select target_type from public.reports where id = pg_temp.id('r1')), 'ORGANIZATION', 'stored with its target type');

-- The console.
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select is(public.admin_get_report(pg_temp.id('r1')) ->> 'target_label', 'Kulüp 38', 'the queue names the organization');
select is((public.admin_get_report(pg_temp.id('r1')) -> 'target' ->> 'member_count')::int, 2, 'and shows its size');
select is(jsonb_array_length(public.admin_get_organization(pg_temp.id('org')) -> 'members'), 2, 'the administrator sees its members');
select is((public.admin_get_organization(pg_temp.id('org')) ->> 'open_reports')::int, 1, 'and its open reports');
select throws_ok(format('select public.admin_set_organization_hidden(%L, true, '' '')', pg_temp.id('org')), 'P0001', 'VALIDATION_FAILED',
  'hiding needs a note');
select public.admin_set_organization_hidden(pg_temp.id('org'), true, 'Hakaret içeren ad.');
reset role;
select is((select status from public.organizations where id = pg_temp.id('org')), 'HIDDEN', 'hidden');
select ok(exists (select 1 from public.moderation_actions where action = 'ORGANIZATION_HIDDEN' and target_id = pg_temp.id('org')),
  'recorded as a moderation action');

-- A hidden organization is out of sight and frozen.
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format('select public.get_organization(%L)', pg_temp.id('org')), 'P0001', 'NOT_FOUND', 'its page is gone');
select throws_ok(format('select public.request_to_join_organization(%L)', pg_temp.id('org')), 'P0001', 'NOT_FOUND', 'nobody can join');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok(format('select public.leave_organization(%L)', pg_temp.id('org')), 'P0001', 'NOT_FOUND', 'membership changes stop');

-- Restoring.
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select throws_ok(format('select public.admin_set_organization_hidden(%L, true, ''Tekrar'')', pg_temp.id('org')), 'P0001', 'INVALID_TRANSITION',
  'hiding twice is refused');
select public.admin_set_organization_hidden(pg_temp.id('org'), false, 'Ad değiştirildi.');
reset role;
select is((select status from public.organizations where id = pg_temp.id('org')), 'ACTIVE', 'restored');
select pg_temp.act_as(pg_temp.u(3), 'aal1');
select throws_ok(format('select public.admin_get_organization(%L)', pg_temp.id('org')), 'P0001', 'MFA_REQUIRED',
  'the console needs the second factor');

select * from finish();
rollback;
