-- Phase 9 / M2 (ADR-0030): membership. Invitations, requests, roles, leaving, hand-over, blocks.
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
  select ('00000000-0000-4000-8000-0000000036' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.org() returns uuid language sql as $$ select v from ids where k = 'org'; $$;
create function pg_temp.status_of(n int) returns text language sql as $$
  select status from public.organization_members where organization_id = pg_temp.org() and user_id = pg_temp.u(n);
$$;
create function pg_temp.role_of(n int) returns text language sql as $$
  select role from public.organization_members where organization_id = pg_temp.org() and user_id = pg_temp.u(n);
$$;
create function pg_temp.page_as(n int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.act_as(pg_temp.u(n));
  v := public.get_organization(pg_temp.org());
  reset role;
  return v;
end;
$$;
create function pg_temp.notes(n int, p_type text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = pg_temp.u(n) and type = p_type;
$$;

-- 01 owner · 02 invited, accepts · 03 asks, approved · 04 asks, declined · 05 invited then asks · 06 stranger · 07 blocks owner
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u36-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 7) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000036%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000036%';
insert into public.organizations (name, city_id, sport_ids, status, created_by, decided_at)
values ('Kartallar 36', (select id from public.cities where slug = 'ankara'),
        array[(select id from public.sports where slug = 'football')], 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'org', id from public.organizations where name = 'Kartallar 36';
insert into public.organization_members (organization_id, user_id, role) values (pg_temp.org(), pg_temp.u(1), 'OWNER');
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u(7), pg_temp.u(1));

-- The page.
select is(pg_temp.page_as(6) ->> 'name', 'Kartallar 36', 'anyone signed in sees an active organization');
select is(pg_temp.page_as(6) -> 'members', 'null'::jsonb, 'but not its members');
select is(jsonb_array_length(pg_temp.page_as(6) -> 'leaders'), 1, 'only who runs it');
select is(pg_temp.page_as(1) ->> 'role', 'OWNER', 'the owner sees their role');
select ok(pg_temp.page_as(1) ? 'waiting', 'and the waiting list');
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.get_organization(gen_random_uuid())$$, 'P0001', 'NOT_AUTHENTICATED', 'guests get nothing');

-- Invitations.
select pg_temp.act_as(pg_temp.u(1));
select is(public.invite_to_organization(pg_temp.org(), pg_temp.u(2)), 'INVITED', 'the owner invites');
select is(public.invite_to_organization(pg_temp.org(), pg_temp.u(2)), 'INVITED', 'twice is the same invitation');
select throws_ok(format('select public.invite_to_organization(%L, %L)', pg_temp.org(), pg_temp.u(7)), 'P0001', 'NOT_FOUND',
  'a blocked pair cannot invite each other');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok(format('select public.invite_to_organization(%L, %L)', pg_temp.org(), pg_temp.u(3)), 'P0001', 'NOT_ALLOWED',
  'a stranger cannot invite');
reset role;
select is(pg_temp.notes(2, 'ORGANIZATION_INVITED'), 1::bigint, 'the invited person is told once');
select is(pg_temp.status_of(2), 'INVITED', 'they wait');
select is((pg_temp.page_as(6) ->> 'member_count')::int, 1, 'a waiting person does not count');
select pg_temp.act_as(pg_temp.u(2));
select public.respond_to_organization_invite(pg_temp.org(), true);
reset role;
select is(pg_temp.status_of(2), 'ACTIVE', 'accepting makes a member');
select ok(jsonb_array_length(pg_temp.page_as(2) -> 'members') = 2, 'a member sees the members');
select is(pg_temp.page_as(2) -> 'waiting', 'null'::jsonb, 'but not the waiting list');

-- Requests.
select pg_temp.act_as(pg_temp.u(3));
select is(public.request_to_join_organization(pg_temp.org()), 'REQUESTED', 'a person asks to join');
select pg_temp.act_as(pg_temp.u(4));
select public.request_to_join_organization(pg_temp.org());
select pg_temp.act_as(pg_temp.u(7));
select throws_ok(format('select public.request_to_join_organization(%L)', pg_temp.org()), 'P0001', 'NOT_FOUND',
  'someone in a block with the owner cannot ask');
reset role;
select is(pg_temp.notes(1, 'ORGANIZATION_JOIN_REQUESTED'), 2::bigint, 'the owner is told of each request');
select is(jsonb_array_length(pg_temp.page_as(1) -> 'waiting'), 2, 'and sees them waiting');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format('select public.decide_organization_request(%L, %L, true)', pg_temp.org(), pg_temp.u(3)), 'P0001', 'NOT_ALLOWED',
  'a plain member cannot decide');
select pg_temp.act_as(pg_temp.u(1));
select public.decide_organization_request(pg_temp.org(), pg_temp.u(3), true);
select public.decide_organization_request(pg_temp.org(), pg_temp.u(4), false);
reset role;
select is(pg_temp.status_of(3), 'ACTIVE', 'an approved request makes a member');
select is(pg_temp.notes(3, 'ORGANIZATION_MEMBER_APPROVED'), 1::bigint, 'who is told');
select is(pg_temp.status_of(4), null, 'a declined request is gone');

-- An invitation meets a request.
select pg_temp.act_as(pg_temp.u(1));
select public.invite_to_organization(pg_temp.org(), pg_temp.u(5));
select pg_temp.act_as(pg_temp.u(5));
select is(public.request_to_join_organization(pg_temp.org()), 'ACTIVE', 'asking while invited is accepting');

-- Roles and removal.
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format('select public.set_organization_role(%L, %L, ''ADMIN'')', pg_temp.org(), pg_temp.u(3)), 'P0001', 'NOT_ALLOWED',
  'only the owner gives roles');
select pg_temp.act_as(pg_temp.u(1));
select public.set_organization_role(pg_temp.org(), pg_temp.u(2), 'ADMIN');
reset role;
select is(pg_temp.role_of(2), 'ADMIN', 'the owner makes an administrator');
select pg_temp.act_as(pg_temp.u(2));
select public.remove_organization_member(pg_temp.org(), pg_temp.u(5));
select throws_ok(format('select public.remove_organization_member(%L, %L)', pg_temp.org(), pg_temp.u(1)), 'P0001', 'NOT_ALLOWED',
  'an administrator cannot remove the owner');
reset role;
select is(pg_temp.status_of(5), null, 'an administrator removes a plain member');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format('select public.set_organization_role(%L, %L, ''OWNER'')', pg_temp.org(), pg_temp.u(3)), 'P0001', 'VALIDATION_FAILED',
  'ownership is not a role to give');

-- Leaving and handing over.
select throws_ok(format('select public.leave_organization(%L)', pg_temp.org()), 'P0001', 'NOT_ALLOWED', 'the owner hands over first');
select public.transfer_organization_ownership(pg_temp.org(), pg_temp.u(3));
reset role;
select is(pg_temp.role_of(3), 'OWNER', 'the new owner');
select is(pg_temp.role_of(1), 'ADMIN', 'the old owner stays as an administrator');
select pg_temp.act_as(pg_temp.u(1));
select public.leave_organization(pg_temp.org());
reset role;
select is(pg_temp.status_of(1), null, 'and can then leave');

-- Rules of the table and the API.
select throws_ok(format($$insert into public.organization_members (organization_id, user_id, role, status)
                          values (%L, %L, 'ADMIN', 'INVITED')$$, pg_temp.org(), pg_temp.u(6)), '23514', null,
  'a waiting person is never more than a member');
select ok(not has_function_privilege('anon', 'public.get_organization(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.invite_to_organization(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.organization_role(uuid, uuid)', 'execute'),
  'guests cannot call them, and nobody calls the internals');
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u(3), pg_temp.u(7));
select pg_temp.act_as(pg_temp.u(3));
select is(jsonb_array_length(public.list_organizations_to_invite(pg_temp.u(6))), 1, 'the player card lists what the caller runs');
select is(public.list_organizations_to_invite(pg_temp.u(7)), '[]'::jsonb, 'nothing toward a blocked pair');
reset role;

select * from finish();
rollback;
