-- Phase 4 / M4: venues: suggesting, finding, using in an event, and what administrators do with them.
begin;
select plan(58);

-- Local E2E and integration runs may leave venues behind; the counts below are about this file's only (rolled back).
update public.event_private_details set venue_id = null where venue_id is not null;
delete from public.venues;

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000027' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where k = $1; $$;
create function pg_temp.ankara() returns uuid language sql as $$ select id from public.cities where slug = 'ankara'; $$;
create function pg_temp.district(slug text) returns uuid language sql as $$
  select id from public.districts where slug = $1 and city_id = pg_temp.ankara();
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create function pg_temp.venue(p_name text, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'COMMERCIAL_FACILITY', 'name', p_name, 'city_id', pg_temp.ankara(),
    'district_id', pg_temp.district('cankaya'), 'point', '{"lat": 39.8950, "lon": 32.7795}'::jsonb,
    'sport_ids', jsonb_build_array(pg_temp.football())) || p_extra;
$$;
create function pg_temp.search(p jsonb) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as_anon();
  r := public.search_venues(p) -> 'items';
  reset role;
  return r;
end;
$$;
create function pg_temp.event_input(p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', pg_temp.football(),
    'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
    'title', 'S27 maç', 'starts_at', (now() + interval '10 days')::text, 'duration_minutes', 90,
    'city_id', pg_temp.ankara(), 'district_id', pg_temp.district('cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12) || p_extra;
$$;

-- 01 admin · 02 player · 03 new account (2 days old) · 04 another player
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u27-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(),
       created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000027%';
update public.profiles set created_at = now() - interval '2 days' where id = pg_temp.u(3);
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000027%';
insert into public.platform_admins (user_id) values (pg_temp.u(1));

-- ---- access ---------------------------------------------------------------------------------------------------------------
select function_privs_are('public', 'search_venues', array['jsonb'], 'anon', array['EXECUTE'], 'guests may search venues');
select function_privs_are('public', 'suggest_venue', array['jsonb'], 'anon', array[]::text[], 'but not suggest one');
select function_privs_are('public', 'admin_add_venue', array['jsonb', 'text'], 'anon', array[]::text[], 'nor add one');
select ok(not has_table_privilege('anon', 'public.venues', 'select')
          and not has_table_privilege('authenticated', 'public.venues', 'select'), 'the table is closed: who suggested stays private');

-- ---- suggesting ---------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
insert into ids values ('s1', public.suggest_venue(pg_temp.venue('Yıldız Halı Saha', '{"address_text": "Üniversiteler Mh."}')));
select is(public.suggest_venue(pg_temp.venue('  yildiz   HALI saha ')), pg_temp.id('s1'),
          'the same name nearby, however written, is the same venue');
select isnt(public.suggest_venue(pg_temp.venue('Yıldız Halı Saha', '{"point": {"lat": 39.9300, "lon": 32.8000}}')),
            pg_temp.id('s1'), 'the same name 4 km away is another one');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Ara 0532 123 45 67')), 'P0001', 'VALIDATION_FAILED',
                 'no phone number in a name');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('www.sahalar.com')), 'P0001', 'VALIDATION_FAILED',
                 'no link in a name');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', '{"point": {"lat": 38.4189, "lon": 27.1285}}')),
                 'P0001', 'VALIDATION_FAILED', 'a point far from the district');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', '{"point": null}')),
                 'P0001', 'VALIDATION_FAILED', 'a venue needs a point');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', '{"sport_ids": []}')),
                 'P0001', 'VALIDATION_FAILED', 'and at least one sport');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', jsonb_build_object('sport_ids', jsonb_build_array(gen_random_uuid())))),
                 'P0001', 'VALIDATION_FAILED', 'that exists');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', '{"kind": "STADIUM"}')),
                 'P0001', 'VALIDATION_FAILED', 'of a known kind');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha X', jsonb_build_object('district_id', pg_temp.district('mamak'), 'city_id', (select id from public.cities where slug = 'izmir')))),
                 'P0001', 'VALIDATION_FAILED', 'a district of another province');
reset role;
select is((select verification_status || '/' || listing_status || '/' || provenance from public.venues where id = pg_temp.id('s1')),
          'UNVERIFIED/ACTIVE/USER_SUBMITTED', 'a suggestion is listed at once, unverified');
select is((select submitted_by from public.venues where id = pg_temp.id('s1')), pg_temp.u(2), 'and remembers who suggested it');

-- Quotas: 5 a day, 1 for a new account.
select pg_temp.act_as(pg_temp.u(3));
select lives_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Yeni Saha 1')), 'a new account may suggest one');
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Yeni Saha 2')), 'P0001', 'QUOTA_EXCEEDED', 'not two');
select lives_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Yıldız Halı Saha')), 'repeating a listed venue costs nothing');
select pg_temp.act_as(pg_temp.u(2));
select public.suggest_venue(pg_temp.venue('Saha ' || n)) from generate_series(3, 5) n;
select throws_ok(format($$select public.suggest_venue(%L)$$, pg_temp.venue('Saha 6')), 'P0001', 'QUOTA_EXCEEDED', 'five a day');
reset role;

-- ---- finding --------------------------------------------------------------------------------------------------------------------
select is(jsonb_array_length(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara(), 'q', 'yildiz'))), 2,
          'found without Turkish letters');
select is(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara(), 'q', 'YILDIZ')) -> 0 -> 'verified', 'false'::jsonb,
          'shown as unverified');
select ok((select bool_and(not (v ? 'submitted_by')) from jsonb_array_elements(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara()))) v),
          'nobody learns who suggested it');
select is(jsonb_array_length(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara(), 'district_id', pg_temp.district('mamak')))), 0,
          'filtered by district');
select is(jsonb_array_length(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara(), 'sport_id',
            (select id from public.sports where slug = 'tennis')))), 0, 'and by sport');
select throws_ok($$select public.search_venues('{}')$$, 'P0001', 'VALIDATION_FAILED', 'a province is required');

-- ---- administrators -------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select throws_ok(format($$select public.admin_set_venue_status(%L, 'VERIFY')$$, pg_temp.id('s1')), 'P0001', 'NOT_ALLOWED',
                 'a player cannot verify');
select throws_ok($$select public.admin_list_venues()$$, 'P0001', 'NOT_ALLOWED', 'nor see the queue');
select pg_temp.act_as(pg_temp.u(1), 'aal1');
select throws_ok(format($$select public.admin_set_venue_status(%L, 'VERIFY')$$, pg_temp.id('s1')), 'P0001', 'MFA_REQUIRED',
                 'an administrator needs the second factor');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is(jsonb_array_length(public.admin_list_venues('UNVERIFIED') -> 'items'), 6, 'the queue holds the suggestions');
reset role;
-- One transaction has one now(): make the first suggestion the oldest, so the order is about time and not ids.
update public.venues set created_at = now() - interval '1 hour' where id = pg_temp.id('s1');
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is(public.admin_list_venues('UNVERIFIED') -> 'items' -> 0 ->> 'id', pg_temp.id('s1')::text, 'oldest first');
select is(public.admin_list_venues('UNVERIFIED') -> 'items' -> 0 ->> 'submitter_name', 'Kişi 02', 'with who suggested it');
select ok(public.admin_set_venue_status(pg_temp.id('s1'), 'VERIFY'), 'verify');
select ok(not public.admin_set_venue_status(pg_temp.id('s1'), 'VERIFY'), 'twice changes nothing');
select is(jsonb_array_length(public.admin_list_venues('UNVERIFIED') -> 'items'), 5, 'and it leaves the queue');
insert into ids values ('a1', public.admin_add_venue(pg_temp.venue('Belediye Spor Kompleksi', '{"kind": "PUBLIC_SPACE"}'), 'manual:2026-11-07'));
select throws_ok(format($$select public.admin_set_venue_status(%L, 'DELETE')$$, pg_temp.id('a1')), 'P0001', 'VALIDATION_FAILED',
                 'only verify, hide or restore');
reset role;
select is((select verification_status || '/' || provenance from public.venues where id = pg_temp.id('a1')), 'VERIFIED/ADMIN_CURATED',
          'an administrator''s venue is verified from the start');
select is((select array_agg(action order by created_at, action) from public.moderation_actions where actor_id = pg_temp.u(1)),
          array['VENUE_ADDED', 'VENUE_VERIFIED'], 'both are on the record');
select is(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara())) -> 0 ->> 'name', 'Belediye Spor Kompleksi',
          'verified venues come first');

-- ---- in an event ------------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(4));
insert into ids values ('pub', public.create_event(gen_random_uuid(), pg_temp.event_input(jsonb_build_object('venue_id', pg_temp.id('s1'))), true));
insert into ids values ('hid', public.create_event(gen_random_uuid(), pg_temp.event_input(jsonb_build_object(
  'venue_id', pg_temp.id('s1'), 'location_visibility', 'APPROVED_ONLY')), true));
select throws_ok(format($$select public.create_event(gen_random_uuid(), %L)$$, pg_temp.event_input(jsonb_build_object(
  'venue_id', pg_temp.id('s1'), 'district_id', pg_temp.district('mamak')))), 'P0001', 'VALIDATION_FAILED',
  'the venue must be in the event''s district');
reset role;
select ok((select extensions.st_dwithin(d.exact_point, v.location, 0.5) from public.event_private_details d
             join public.venues v on v.id = d.venue_id where d.event_id = pg_temp.id('pub')), 'without a pin the event takes the venue''s');
select pg_temp.act_as_anon();
select is(public.get_event(pg_temp.id('pub')) -> 'venue' ->> 'name', 'Yıldız Halı Saha', 'a public location names its venue');
select is(public.get_event(pg_temp.id('pub')) -> 'venue' -> 'verified', 'true'::jsonb, 'as verified');
select is(public.get_event(pg_temp.id('hid')) -> 'venue', 'null'::jsonb, 'a hidden location does not: the venue would give it away');
select is((select i -> 'venue' from jsonb_array_elements(public.search_events(jsonb_build_object('limit', 50)) -> 'items') i
            where i ->> 'id' = pg_temp.id('hid')::text), 'null'::jsonb, 'nor does search');
reset role;

-- Another venue moves the pin to it; a new district with the app's whole form (venue_id null, no point) drops both.
select pg_temp.act_as(pg_temp.u(4));
select public.update_event(pg_temp.id('hid'), jsonb_build_object('venue_id', pg_temp.id('a1')));
reset role;
select ok((select extensions.st_dwithin(d.exact_point, v.location, 0.5) from public.event_private_details d
             join public.venues v on v.id = pg_temp.id('a1') where d.event_id = pg_temp.id('hid')), 'another venue brings its point');
select pg_temp.act_as(pg_temp.u(4));
select public.update_event(pg_temp.id('hid'), jsonb_build_object('venue_id', null, 'district_id', pg_temp.district('mamak')));
reset role;
select ok((select exact_point is null and venue_id is null from public.event_private_details where event_id = pg_temp.id('hid')),
          'a new district without a pin leaves neither the old pin nor the venue');

-- Hiding: gone from search, kept as plain text on the events that used it, and an edit does not fail because of it.
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select ok(public.admin_set_venue_status(pg_temp.id('s1'), 'HIDE', 'kapalı'), 'hide');
reset role;
select is(jsonb_array_length(pg_temp.search(jsonb_build_object('city_id', pg_temp.ankara(), 'q', 'yildiz halı saha'))), 1,
          'a hidden venue is not found (the other one of that name is)');
select pg_temp.act_as(pg_temp.u(4));
select lives_ok(format($$select public.update_event(%L, '{"title": "S27 maç 2"}')$$, pg_temp.id('pub')),
                'an event whose venue was hidden can still be edited');
select throws_ok(format($$select public.create_event(gen_random_uuid(), %L)$$, pg_temp.event_input(jsonb_build_object('venue_id', pg_temp.id('s1')))),
                 'P0001', 'VALIDATION_FAILED', 'a hidden venue cannot be chosen');
select throws_ok(format($$select public.report('VENUE', %L, 'SPAM')$$, pg_temp.id('s1')), 'P0001', 'NOT_FOUND',
                 'nor reported');
insert into ids values ('r1', public.report('VENUE', pg_temp.id('a1'), 'FAKE_EVENT', 'Böyle bir saha yok'));
select pg_temp.act_as(pg_temp.u(1), 'aal2');
select is(public.admin_get_report(pg_temp.id('r1')) -> 'target' ->> 'name', 'Belediye Spor Kompleksi',
          'a listed venue can be reported, and the administrator sees which');
select is(public.admin_list_venues('VERIFIED') -> 'items' -> 0 ->> 'open_reports', '1', 'the venue list counts its open reports');
reset role;

-- ---- export and purge -------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(jsonb_array_length(public.export_my_data() -> 'venue_suggestions'), 5, 'the export holds my suggestions');
reset role;
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(2);
select ok(private.purge_account(pg_temp.u(2)), 'purged');
select is((select count(*)::int from public.venues where submitted_by = pg_temp.u(2)), 0, 'no venue names the purged account');
select is((select count(*)::int from public.venues where id = pg_temp.id('s1')), 1, 'the venue itself stays');

select * from finish();
rollback;
