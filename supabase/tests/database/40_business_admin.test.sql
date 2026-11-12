-- Phase 10 / M2 (ADR-0031): administrators add businesses; hide and restore; a venue's business.
begin;
select plan(14);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000040' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.ankara() returns uuid language sql as $$ select id from public.cities where slug = 'ankara'; $$;

-- 01 administrator · 02 future owner · 03 player · 04 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u40-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.platform_admins (user_id) values (pg_temp.u(1));
insert into public.venues (kind, name, city_id, district_id, location, provenance)
values ('COMMERCIAL_FACILITY', 'Halı Saha 40', pg_temp.ankara(), (select id from public.districts where slug = 'cankaya'),
        extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED');
insert into ids select 'v', id from public.venues where name = 'Halı Saha 40';

-- Creating.
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format('select public.admin_create_business(''X Spor'', %L, %L, ''{}'')', pg_temp.ankara(), pg_temp.u(2)), 'P0001', 'NOT_ALLOWED',
  'a player cannot add a business');
select pg_temp.act_as(pg_temp.u(1), 'aal1');
select throws_ok(format('select public.admin_create_business(''X Spor'', %L, %L, ''{}'')', pg_temp.ankara(), pg_temp.u(2)), 'P0001', 'MFA_REQUIRED',
  'an administrator needs the second factor');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok(format('select public.admin_create_business(''X Spor'', %L, %L, ''{}'')', pg_temp.ankara(), pg_temp.u(4)), 'P0001', 'NOT_FOUND',
  'the owner must be an onboarded person');
insert into ids values ('b', public.admin_create_business('Yıldız Spor', pg_temp.ankara(), pg_temp.u(2), array[pg_temp.id('v')]));
select throws_ok(format('select public.admin_create_business(''Başka'', %L, %L, array[%L]::uuid[])', pg_temp.ankara(), pg_temp.u(3), pg_temp.id('v')),
  'P0001', 'VENUE_CLAIMED', 'a venue already run cannot be given again');
reset role;
select is((select status from public.businesses where id = pg_temp.id('b')), 'ACTIVE', 'an added business is active at once');
select is((select role from public.business_members where business_id = pg_temp.id('b') and user_id = pg_temp.u(2)), 'OWNER',
  'with the chosen owner');
select ok(exists (select 1 from private.audit_logs where action = 'BUSINESS_ADDED' and target_id = pg_temp.id('b')), 'audited');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u(2) and type = 'BUSINESS_APPROVED'), 'the owner is told');

-- Shown with the venue.
select pg_temp.act_as(pg_temp.u(3));
select is(public.get_venue_business(pg_temp.id('v')) ->> 'name', 'Yıldız Spor', 'a venue shows its business');

-- Hiding and restoring.
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select throws_ok(format('select public.admin_set_business_hidden(%L, true, '' '')', pg_temp.id('b')), 'P0001', 'VALIDATION_FAILED',
  'hiding needs a note');
select public.admin_set_business_hidden(pg_temp.id('b'), true, 'Şikayet incelemede.');
select pg_temp.act_as(pg_temp.u(3));
select is(public.get_venue_business(pg_temp.id('v')), null, 'a hidden business is not shown');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is(jsonb_array_length(public.admin_list_business_requests('HIDDEN')), 1, 'the console lists it under hidden');
select public.admin_set_business_hidden(pg_temp.id('b'), false, 'İnceleme bitti.');
reset role;
select ok(exists (select 1 from public.moderation_actions where action = 'BUSINESS_RESTORED' and target_id = pg_temp.id('b')),
  'both are moderation actions');
select ok(not has_function_privilege('anon', 'public.get_venue_business(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.admin_create_business(text, uuid, uuid, uuid[])', 'execute'),
  'guests cannot call them');

select * from finish();
rollback;
