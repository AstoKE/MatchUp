-- Phase 10 / M1 (ADR-0031): the business request, its review, claims, export and purge.
begin;
select plan(27);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000039' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.ankara() returns uuid language sql as $$ select id from public.cities where slug = 'ankara'; $$;
create function pg_temp.ask(p_name text, p_venues uuid[], p_phone text default '0532 111 22 33', p_email text default null)
returns uuid language sql as $$
  select public.request_business(p_name, pg_temp.ankara(), p_phone, p_email, 'Sahibiyim.', p_venues);
$$;

-- 01 requester · 02 administrator · 03 second requester · 04 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u39-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3));
insert into public.platform_admins (user_id) values (pg_temp.u(2));
-- Two commercial venues and a public space.
insert into public.venues (kind, name, city_id, district_id, location, provenance)
select k, n, pg_temp.ankara(), (select id from public.districts where slug = 'cankaya'),
       extensions.st_setsrid(extensions.st_makepoint(32.78, 39.90), 4326)::extensions.geography, 'ADMIN_CURATED'
  from (values ('COMMERCIAL_FACILITY', 'Halı Saha 39 A'), ('COMMERCIAL_FACILITY', 'Halı Saha 39 B'), ('PUBLIC_SPACE', 'Park 39')) v(k, n);
insert into ids select 'va', id from public.venues where name = 'Halı Saha 39 A';
insert into ids select 'vb', id from public.venues where name = 'Halı Saha 39 B';
insert into ids select 'vp', id from public.venues where name = 'Park 39';

select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.businesses'::regclass, 'public.business_members'::regclass, 'public.business_venues'::regclass)), 'RLS is on');
select table_privs_are('public', 'businesses', 'authenticated', array[]::text[], 'no API access to businesses');
select table_privs_are('public', 'business_venues', 'authenticated', array[]::text[], 'nor to their venues');
select ok(not has_function_privilege('anon', 'public.request_business(text, uuid, text, text, text, uuid[])', 'execute'),
  'guests cannot ask');

-- The request.
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('b1', pg_temp.ask('  Yıldız Spor Tesisleri ', array[pg_temp.id('va')]));
reset role;
select is((select name from public.businesses where id = pg_temp.id('b1')), 'Yıldız Spor Tesisleri', 'saved, trimmed');
select is((select contact_phone from public.businesses where id = pg_temp.id('b1')), '05321112233', 'the phone is kept as digits');
select is((select role from public.business_members where business_id = pg_temp.id('b1') and user_id = pg_temp.u(1)), 'OWNER', 'the requester is its owner');
select is((select count(*)::int from public.business_venues where business_id = pg_temp.id('b1')), 1, 'with the claimed venue');

select pg_temp.act_as(pg_temp.u(1));
select ok(not (public.list_my_businesses() -> 'items' -> 0 ? 'contact_phone'), 'the requester''s list leaves the contact details out');
select throws_ok($$select pg_temp.ask('Kulüp', '{}', null, null)$$, 'P0001', 'VALIDATION_FAILED', 'a phone or an e-mail is required');
select throws_ok($$select pg_temp.ask('Kulüp', '{}', '12', null)$$, 'P0001', 'VALIDATION_FAILED', 'a phone must look like one');
select throws_ok($$select pg_temp.ask('www.reklam.com', '{}')$$, 'P0001', 'VALIDATION_FAILED', 'no links in the name');
select throws_ok(format('select pg_temp.ask(''Park İşletmesi'', array[%L]::uuid[])', pg_temp.id('vp')), 'P0001', 'VALIDATION_FAILED',
  'a public space cannot be claimed');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format('select pg_temp.ask(''Başka İşletme'', array[%L]::uuid[])', pg_temp.id('va')), 'P0001', 'VENUE_CLAIMED',
  'a venue claimed by a waiting request cannot be claimed again');
select pg_temp.act_as(pg_temp.u(1));
select pg_temp.ask('İkinci', '{}');
select pg_temp.ask('Üçüncü', '{}', null, 'iletisim@ornek.com.tr');
select throws_ok($$select pg_temp.ask('Dördüncü', '{}')$$, 'P0001', 'QUOTA_EXCEEDED', 'at most three, waiting ones included');
select throws_ok($$select public.admin_list_business_requests()$$, 'P0001', 'NOT_ALLOWED', 'a player cannot review');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select pg_temp.ask('Yeni', '{}')$$, 'P0001', null, 'an account that has not finished onboarding cannot ask');

-- The review.
select pg_temp.act_as(pg_temp.u(2), 'aal1');
select throws_ok($$select public.admin_list_business_requests()$$, 'P0001', 'MFA_REQUIRED', 'reviewing needs the second factor');
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select is((select i ->> 'contact_phone' from jsonb_array_elements(public.admin_list_business_requests()) i
            where (i ->> 'id')::uuid = pg_temp.id('b1')), '05321112233', 'the administrator sees the contact details');
select throws_ok(format('select public.admin_decide_business(%L, false)', pg_temp.id('b1')), 'P0001', 'VALIDATION_FAILED',
  'a rejection needs a reason');
select public.admin_decide_business(pg_temp.id('b1'), false, 'Tesisle iletişim kurulamadı.');
reset role;
select is((select count(*)::int from public.business_venues where business_id = pg_temp.id('b1')), 0, 'a rejection releases the claims');
select ok(exists (select 1 from public.notifications where user_id = pg_temp.u(1) and type = 'BUSINESS_REJECTED'), 'the requester is told');

-- The released venue can now be claimed; approval makes the business active with its venue.
select pg_temp.act_as(pg_temp.u(3));
insert into ids values ('b3', pg_temp.ask('Doğru Sahip', array[pg_temp.id('va'), pg_temp.id('vb')]));
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select public.admin_decide_business(pg_temp.id('b3'), true);
reset role;
select is((select status from public.businesses where id = pg_temp.id('b3')), 'ACTIVE', 'approved');
select is((select verification_status from public.venues where id = pg_temp.id('va')), 'UNVERIFIED', 'ownership does not verify the venue');
select ok(exists (select 1 from private.audit_logs where action = 'BUSINESS_APPROVED' and target_id = pg_temp.id('b3')), 'audited');

-- Export and purge.
select ok(private.export_business_data(pg_temp.u(3)) -> 'businesses' @> '[{"name": "Doğru Sahip", "role": "OWNER"}]'::jsonb, 'exported');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(3);
select private.purge_account(pg_temp.u(3));
select ok((select status = 'DISSOLVED' and contact_phone is null from public.businesses where id = pg_temp.id('b3'))
      and not exists (select 1 from public.business_venues where business_id = pg_temp.id('b3')),
  'a business owned alone is dissolved, its venues released and its contact details erased');

select * from finish();
rollback;
