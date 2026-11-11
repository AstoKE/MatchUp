-- Phase 9 / M1 (ADR-0030): the creation request and its review. Who may do what, the limit, export and purge.
begin;
select plan(33);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000035' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.ankara() returns uuid language sql as $$ select id from public.cities where slug = 'ankara'; $$;
create function pg_temp.sports() returns uuid[] language sql as $$
  select array_agg(id order by slug) from public.sports where slug in ('football', 'tennis');
$$;
create function pg_temp.mine(p_user int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(p_user));
  v := public.list_my_organizations();
  reset role;
  return v;
end;
$$;

-- 01 requester · 02 administrator · 03 stranger · 04 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u35-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.platform_admins (user_id) values (pg_temp.u(2));

select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.organizations'::regclass, 'public.organization_members'::regclass)), 'RLS is on for both');
select table_privs_are('public', 'organizations', 'authenticated', array[]::text[], 'no API access to organizations');
select table_privs_are('public', 'organization_members', 'authenticated', array[]::text[], 'nor to members');
select ok(not has_function_privilege('anon', 'public.request_organization(text, text, uuid, uuid[])', 'execute')
      and not has_function_privilege('anon', 'public.list_my_organizations()', 'execute'), 'guests cannot ask or list');

-- The request.
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('o1', public.request_organization('  Çankaya Kartalları ', 'Hafta içi akşam halı saha.', pg_temp.ankara(), pg_temp.sports()));
reset role;
select is((select name from public.organizations where id = pg_temp.id('o1')), 'Çankaya Kartalları', 'saved, trimmed');
select is((select status from public.organizations where id = pg_temp.id('o1')), 'PENDING', 'it waits for a person');
select is((select role from public.organization_members where organization_id = pg_temp.id('o1') and user_id = pg_temp.u(1)), 'OWNER',
  'the requester is its owner');
select is(pg_temp.mine(1) -> 'items' -> 0 ->> 'status', 'PENDING', 'the requester sees the waiting request');
select is((pg_temp.mine(1) ->> 'max_owned')::int, 2, 'and the limit');

select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.request_organization('www.reklam.com', null, pg_temp.ankara(), pg_temp.sports())$$, 'P0001', 'VALIDATION_FAILED',
  'no links in the name');
select throws_ok($$select public.request_organization('Kulüp', 'Ara: 0532 123 45 67', pg_temp.ankara(), pg_temp.sports())$$, 'P0001', 'VALIDATION_FAILED',
  'no phone numbers in the description');
select throws_ok($$select public.request_organization('Kulüp', null, pg_temp.ankara(), array[]::uuid[])$$, 'P0001', 'VALIDATION_FAILED',
  'at least one sport');
select throws_ok($$select public.request_organization('Kulüp', null, pg_temp.ankara(), array[gen_random_uuid()])$$, 'P0001', 'VALIDATION_FAILED',
  'only known sports');
insert into ids values ('o2', public.request_organization('İkinci Kulüp', null, pg_temp.ankara(), pg_temp.sports()));
select throws_ok($$select public.request_organization('Üçüncü Kulüp', null, pg_temp.ankara(), pg_temp.sports())$$, 'P0001', 'QUOTA_EXCEEDED',
  'at most two, waiting ones included');
select throws_ok($$select public.admin_list_organization_requests()$$, 'P0001', 'NOT_ALLOWED', 'a player cannot review');

select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format('select public.cancel_organization_request(%L)', pg_temp.id('o2')), 'P0001', 'NOT_FOUND',
  'nobody else can withdraw it');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.request_organization('Yeni Kulüp', null, pg_temp.ankara(), pg_temp.sports())$$, 'P0001', null,
  'an account that has not finished onboarding cannot ask');

-- The review.
select pg_temp.act_as(pg_temp.u(2), 'aal1');
select throws_ok($$select public.admin_list_organization_requests()$$, 'P0001', 'MFA_REQUIRED', 'reviewing needs the second factor');
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select is((select count(*)::int from jsonb_array_elements(public.admin_list_organization_requests()) i
            where (i ->> 'requester_id')::uuid = pg_temp.u(1)), 2, 'the administrator sees both waiting requests');
select is((select i ->> 'requester_name' from jsonb_array_elements(public.admin_list_organization_requests()) i limit 1)
            is not null, true, 'with the requester to look at');
select throws_ok(format('select public.admin_decide_organization(%L, false)', pg_temp.id('o2')), 'P0001', 'VALIDATION_FAILED',
  'a rejection needs a reason');
select public.admin_decide_organization(pg_temp.id('o1'), true);
select public.admin_decide_organization(pg_temp.id('o2'), false, 'İsim başka bir kulübü taklit ediyor.');
select throws_ok(format('select public.admin_decide_organization(%L, true)', pg_temp.id('o2')), 'P0001', 'INVALID_TRANSITION',
  'a decision is final');
reset role;
select is((select status from public.organizations where id = pg_temp.id('o1')), 'ACTIVE', 'approved');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u(1) and type = 'ORGANIZATION_APPROVED'
                    and payload ->> 'organization_id' = pg_temp.id('o1')::text), 'the requester is told');
select ok(exists (select 1 from private.audit_logs where action = 'ORGANIZATION_REJECTED' and target_id = pg_temp.id('o2')
                    and metadata::text !~ 'taklit'), 'the rejection is audited, without the reason''s text');
select is((select i ->> 'reject_reason' from jsonb_array_elements(pg_temp.mine(1) -> 'items') i where (i ->> 'id')::uuid = pg_temp.id('o2')),
  'İsim başka bir kulübü taklit ediyor.', 'the requester sees why');

-- A rejected request no longer counts: a new one is possible.
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('o3', public.request_organization('Yeni İsim Kulübü', null, pg_temp.ankara(), pg_temp.sports()));
select public.cancel_organization_request(pg_temp.id('o3'));
reset role;
select is((select count(*)::int from public.organizations where id = pg_temp.id('o3')), 0, 'a waiting request can be withdrawn');

-- A second active organization with another administrator survives its owner.
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('o4', public.request_organization('Tenis Grubu', null, pg_temp.ankara(), pg_temp.sports()));
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select public.admin_decide_organization(pg_temp.id('o4'), true);
reset role;
insert into public.organization_members (organization_id, user_id, role) values (pg_temp.id('o4'), pg_temp.u(3), 'ADMIN');

-- Export and purge.
select ok(private.export_organization_data(pg_temp.u(1)) -> 'organizations' @> '[{"name": "Çankaya Kartalları", "role": "OWNER"}]'::jsonb,
  'the export has the organizations');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(1);
select is(private.purge_account(pg_temp.u(1)), true, 'the account is purged');
select is((select status from public.organizations where id = pg_temp.id('o1')), 'DISSOLVED',
  'an organization left without an owner or administrator is dissolved');
select is((select role from public.organization_members where organization_id = pg_temp.id('o4') and user_id = pg_temp.u(3)), 'OWNER',
  'one with another administrator goes on, and that administrator becomes the owner');
select is((select status from public.organizations where id = pg_temp.id('o4')), 'ACTIVE', 'still active');
select is((select status from public.organizations where id = pg_temp.id('o2')), 'REJECTED', 'a rejected request stays as it was');

select * from finish();
rollback;
