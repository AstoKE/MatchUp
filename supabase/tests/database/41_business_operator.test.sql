-- Phase 10 / M3 (ADR-0031): the owner edits their business and its venues; the place, kind and verification stay.
begin;
select plan(14);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000041' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.sport(p text) returns uuid language sql as $$ select id from public.sports where slug = p; $$;

-- 01 owner · 02 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u41-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 2) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000041%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000041%';
insert into public.venues (kind, name, city_id, district_id, location, provenance, verification_status, verified_at)
values ('COMMERCIAL_FACILITY', 'Saha 41', (select id from public.cities where slug = 'ankara'),
        (select id from public.districts where slug = 'cankaya'),
        extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED', 'VERIFIED', now());
insert into ids select 'v', id from public.venues where name = 'Saha 41';
insert into public.venue_sports (venue_id, sport_id) values (pg_temp.id('v'), pg_temp.sport('football'));
insert into public.businesses (name, city_id, contact_phone, status, created_by, decided_at)
values ('İşletme 41', (select id from public.cities where slug = 'ankara'), '05321112233', 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'b', id from public.businesses where name = 'İşletme 41';
insert into public.business_members (business_id, user_id, role) values (pg_temp.id('b'), pg_temp.u(1), 'OWNER');
insert into public.business_venues (business_id, venue_id) values (pg_temp.id('b'), pg_temp.id('v'));

-- Reading.
select pg_temp.act_as(pg_temp.u(1));
select is(public.get_my_business(pg_temp.id('b')) ->> 'contact_phone', '05321112233', 'the owner sees their contact details');
select is(jsonb_array_length(public.get_my_business(pg_temp.id('b')) -> 'venues'), 1, 'and their venues');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format('select public.get_my_business(%L)', pg_temp.id('b')), 'P0001', 'NOT_FOUND', 'nobody else does');

-- The business.
select pg_temp.act_as(pg_temp.u(1));
select public.update_my_business(pg_temp.id('b'), ' Yeni Ad Spor ', '', 'iletisim@ornek.com');
reset role;
select ok((select name = 'Yeni Ad Spor' and contact_phone is null and contact_email = 'iletisim@ornek.com'
             from public.businesses where id = pg_temp.id('b')), 'name and contact updated');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format('select public.update_my_business(%L, ''Ad'', '''', '''')', pg_temp.id('b')), 'P0001', 'VALIDATION_FAILED',
  'a contact is still required');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok(format('select public.update_my_business(%L, ''Ad'', ''05321112233'', null)', pg_temp.id('b')), 'P0001', 'NOT_FOUND',
  'a stranger cannot edit it');

-- Its venue.
select pg_temp.act_as(pg_temp.u(1));
select public.update_business_venue(pg_temp.id('b'), pg_temp.id('v'), 'Saha 41 Kapalı', 'Üniversiteler Mh. No 5',
                                    array[pg_temp.sport('football'), pg_temp.sport('futsal')]);
reset role;
select ok((select name = 'Saha 41 Kapalı' and address_text = 'Üniversiteler Mh. No 5' from public.venues where id = pg_temp.id('v')),
  'name and address updated');
select is((select count(*)::int from public.venue_sports where venue_id = pg_temp.id('v')), 2, 'sports replaced');
select ok((select verification_status = 'VERIFIED' and kind = 'COMMERCIAL_FACILITY' from public.venues where id = pg_temp.id('v')),
  'verification and kind stay');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format('select public.update_business_venue(%L, %L, ''Saha'', null, ''{}'')', pg_temp.id('b'), pg_temp.id('v')), 'P0001',
  'VALIDATION_FAILED', 'at least one sport');
select throws_ok(format('select public.update_business_venue(%L, %L, ''www.reklam.com'', null, array[%L]::uuid[])', pg_temp.id('b'), pg_temp.id('v'),
  pg_temp.sport('football')), 'P0001', 'VALIDATION_FAILED', 'no links in a venue name');
select throws_ok(format('select public.update_business_venue(%L, gen_random_uuid(), ''Saha'', null, array[%L]::uuid[])', pg_temp.id('b'),
  pg_temp.sport('football')), 'P0001', 'NOT_FOUND', 'only the business''s own venues');

-- A hidden business is not editable.
reset role;
update public.businesses set status = 'HIDDEN' where id = pg_temp.id('b');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok(format('select public.update_my_business(%L, ''Ad'', ''05321112233'', null)', pg_temp.id('b')), 'P0001', 'NOT_FOUND',
  'a hidden business cannot be edited');
reset role;
select ok(not has_function_privilege('anon', 'public.update_business_venue(uuid, uuid, text, text, uuid[])', 'execute')
      and not has_function_privilege('authenticated', 'private.lock_owned_business(uuid, uuid)', 'execute'),
  'guests cannot call them, and nobody calls the internals');

select * from finish();
rollback;
