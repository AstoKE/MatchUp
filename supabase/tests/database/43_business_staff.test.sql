-- Phase 10 / M4 (ADR-0031): business staff. Invite, accept, what staff may do, leave, remove, blocks.
begin;
select plan(20);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000043' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create function pg_temp.status_of(n int) returns text language sql as $$
  select status from public.business_members where business_id = pg_temp.id('b') and user_id = pg_temp.u(n);
$$;

-- 01 owner · 02 staff (accepts) · 03 declines · 04 stranger · 05 blocks the owner
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u43-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 5) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000043%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000043%';
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u(5), pg_temp.u(1));
insert into public.venues (kind, name, city_id, district_id, location, provenance)
values ('COMMERCIAL_FACILITY', 'Saha 43', (select id from public.cities where slug = 'ankara'),
        (select id from public.districts where slug = 'cankaya'),
        extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED');
insert into ids select 'v', id from public.venues where name = 'Saha 43';
insert into public.businesses (name, city_id, contact_phone, status, created_by, decided_at)
values ('İşletme 43', (select id from public.cities where slug = 'ankara'), '05321112233', 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'b', id from public.businesses where name = 'İşletme 43';
insert into public.business_members (business_id, user_id, role) values (pg_temp.id('b'), pg_temp.u(1), 'OWNER');
insert into public.business_venues (business_id, venue_id) values (pg_temp.id('b'), pg_temp.id('v'));

-- Inviting.
select pg_temp.act_as(pg_temp.u(1));
select is(public.invite_business_staff(pg_temp.id('b'), pg_temp.u(2)), 'INVITED', 'the owner invites');
select is(public.invite_business_staff(pg_temp.id('b'), pg_temp.u(2)), 'INVITED', 'twice is the same invitation');
select public.invite_business_staff(pg_temp.id('b'), pg_temp.u(3));
select throws_ok(format('select public.invite_business_staff(%L, %L)', pg_temp.id('b'), pg_temp.u(5)), 'P0001', 'NOT_FOUND',
  'a blocked pair cannot invite each other');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok(format('select public.invite_business_staff(%L, %L)', pg_temp.id('b'), pg_temp.u(2)), 'P0001', 'NOT_FOUND',
  'a stranger cannot invite');
reset role;
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u(2) and type = 'BUSINESS_STAFF_INVITED'), 'the invited person is told');
select pg_temp.act_as(pg_temp.u(2));
select is((public.list_my_businesses() -> 'items' -> 0 ->> 'membership'), 'INVITED', 'the invitation shows in their list');
select throws_ok(format('select public.get_my_business(%L)', pg_temp.id('b')), 'P0001', 'NOT_FOUND', 'an invited person cannot open it yet');

-- Answering.
select public.respond_business_invite(pg_temp.id('b'), true);
select pg_temp.act_as(pg_temp.u(3));
select public.respond_business_invite(pg_temp.id('b'), false);
reset role;
select is(pg_temp.status_of(2), 'ACTIVE', 'accepting makes staff');
select is(pg_temp.status_of(3), null, 'declining removes the invitation');

-- What staff may do.
select pg_temp.act_as(pg_temp.u(2));
select is(public.get_my_business(pg_temp.id('b')) ->> 'role', 'STAFF', 'staff open the business');
select is(public.get_my_business(pg_temp.id('b')) -> 'contact_phone', 'null'::jsonb, 'but not the contact details');
select is(public.get_my_business(pg_temp.id('b')) -> 'staff', 'null'::jsonb, 'nor the staff list');
select lives_ok(format('select public.update_business_venue(%L, %L, ''Saha 43 Yeni'', null, array[%L]::uuid[])',
  pg_temp.id('b'), pg_temp.id('v'), pg_temp.football()), 'staff edit a venue');
select throws_ok(format('select public.update_my_business(%L, ''Ad'', ''05321112233'', null)', pg_temp.id('b')), 'P0001', 'NOT_FOUND',
  'staff do not edit the business itself');
select throws_ok(format('select public.invite_business_staff(%L, %L)', pg_temp.id('b'), pg_temp.u(4)), 'P0001', 'NOT_FOUND',
  'staff do not invite');

-- The owner's view, removal and leaving.
select pg_temp.act_as(pg_temp.u(1));
select is(jsonb_array_length(public.get_my_business(pg_temp.id('b')) -> 'staff'), 1, 'the owner sees the staff');
select throws_ok(format('select public.leave_business(%L)', pg_temp.id('b')), 'P0001', 'NOT_ALLOWED', 'the owner does not leave');
select pg_temp.act_as(pg_temp.u(2));
select public.leave_business(pg_temp.id('b'));
reset role;
select is(pg_temp.status_of(2), null, 'staff leave');
select pg_temp.act_as(pg_temp.u(1));
select public.invite_business_staff(pg_temp.id('b'), pg_temp.u(4));
select public.remove_business_staff(pg_temp.id('b'), pg_temp.u(4));
reset role;
select is(pg_temp.status_of(4), null, 'the owner withdraws an invitation');
select ok(not has_function_privilege('anon', 'public.invite_business_staff(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.lock_business_member(uuid, uuid, boolean)', 'execute'),
  'guests cannot call them, and nobody calls the internals');

select * from finish();
rollback;
