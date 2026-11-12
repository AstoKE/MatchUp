-- Phase 9 / M3 (ADR-0030): events as the organization.
begin;
select plan(16);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000037' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create function pg_temp.new_event(p_key text, p_visibility text default 'PUBLIC') returns void language plpgsql as $$
begin
  insert into ids values (p_key, public.create_event(gen_random_uuid(), jsonb_build_object(
    'sport_id', pg_temp.football(),
    'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
    'title', 'S37 ' || p_key, 'starts_at', (now() + interval '200 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'Saha', 'capacity', 12, 'visibility', p_visibility), true));
end;
$$;

-- 01 owner · 02 administrator · 03 plain member · 04 stranger
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u37-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000037%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000037%';
insert into public.organizations (name, city_id, sport_ids, status, created_by, decided_at)
values ('Kulüp 37', (select id from public.cities where slug = 'ankara'), array[pg_temp.football()], 'ACTIVE', pg_temp.u(1), now());
insert into ids select 'org', id from public.organizations where name = 'Kulüp 37';
insert into public.organization_members (organization_id, user_id, role) values
  (pg_temp.id('org'), pg_temp.u(1), 'OWNER'), (pg_temp.id('org'), pg_temp.u(2), 'ADMIN'), (pg_temp.id('org'), pg_temp.u(3), 'MEMBER');

select pg_temp.act_as(pg_temp.u(2));
select pg_temp.new_event('e_admin');
select pg_temp.new_event('e_private', 'INVITE_ONLY');
select pg_temp.act_as(pg_temp.u(3));
select pg_temp.new_event('e_member');
select pg_temp.act_as(pg_temp.u(4));
select pg_temp.new_event('e_stranger');

-- Linking.
select pg_temp.act_as(pg_temp.u(2));
select lives_ok(format('select public.set_event_organization(%L, %L)', pg_temp.id('e_admin'), pg_temp.id('org')),
  'an administrator links their own event');
select public.set_event_organization(pg_temp.id('e_private'), pg_temp.id('org'));
select throws_ok(format('select public.set_event_organization(%L, %L)', pg_temp.id('e_stranger'), pg_temp.id('org')), 'P0001', 'NOT_FOUND',
  'nobody links someone else''s event');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok(format('select public.set_event_organization(%L, %L)', pg_temp.id('e_member'), pg_temp.id('org')), 'P0001', 'NOT_ALLOWED',
  'a plain member cannot use the organization''s name');
select pg_temp.act_as(pg_temp.u(4));
select throws_ok(format('select public.set_event_organization(%L, %L)', pg_temp.id('e_stranger'), pg_temp.id('org')), 'P0001', 'NOT_ALLOWED',
  'nor can a stranger');
reset role;
select is((select organization_id from public.events where id = pg_temp.id('e_admin')), pg_temp.id('org'), 'the link is stored');

-- Showing it.
select pg_temp.act_as(pg_temp.u(4));
select is(public.get_event_organization(pg_temp.id('e_admin')) ->> 'name', 'Kulüp 37', 'anyone who sees the event sees the organization');
select is(public.get_event_organization(pg_temp.id('e_private')), null, 'not for an invite-only event the viewer is not in');
select is(jsonb_array_length(public.list_organization_events(pg_temp.id('org'))), 1, 'the page lists the upcoming public events');
select is(public.list_organization_events(pg_temp.id('org')) -> 0 ->> 'title', 'S37 e_admin', 'which one');
select pg_temp.act_as(pg_temp.u(2));
select is(public.get_event_organization(pg_temp.id('e_private')) ->> 'name', 'Kulüp 37', 'the organizer sees it on their own event');

-- Unlinking, finished events, dissolved organizations.
select public.set_event_organization(pg_temp.id('e_private'));
reset role;
select is((select organization_id from public.events where id = pg_temp.id('e_private')), null, 'the organizer can unlink');
select pg_temp.act_as(pg_temp.u(2));
select public.cancel_event(pg_temp.id('e_private'), 'OTHER');
select throws_ok(format('select public.set_event_organization(%L, %L)', pg_temp.id('e_private'), pg_temp.id('org')), 'P0001', 'INVALID_TRANSITION',
  'a finished event keeps what it had');
reset role;
update public.organizations set status = 'DISSOLVED' where id = pg_temp.id('org');
select pg_temp.act_as(pg_temp.u(4));
select is(public.get_event_organization(pg_temp.id('e_admin')), null, 'a dissolved organization is no longer shown');
select throws_ok(format('select public.list_organization_events(%L)', pg_temp.id('org')), 'P0001', 'NOT_FOUND', 'nor its page');
reset role;
select ok(not has_function_privilege('anon', 'public.set_event_organization(uuid, uuid)', 'execute')
      and not has_function_privilege('anon', 'public.list_organization_events(uuid)', 'execute'), 'guests cannot call them');
select has_column('public', 'events', 'organization_id', 'the design seam is now a column');

select * from finish();
rollback;
