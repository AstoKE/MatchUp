-- Phase 7 / M4: opt-in usage analytics and the pilot metrics (ADR-0025).
begin;
select plan(31);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000028' || lpad(n::text, 2, '0'))::uuid;
$$;

-- 01 consents · 02 does not · 03 admin · 04 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u28-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 4) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(),
       created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000028%' and id <> pg_temp.u(4);
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000028%' and p.id <> pg_temp.u(4);
insert into public.platform_admins (user_id) values (pg_temp.u(3));

-- ---- access -----------------------------------------------------------------------------------------------------------------
select function_privs_are('public', 'track_event', array['text', 'jsonb'], 'anon', array[]::text[], 'guests are never recorded');
select function_privs_are('public', 'set_analytics_consent', array['boolean'], 'anon', array[]::text[], 'nor can they consent');
select function_privs_are('public', 'admin_pilot_metrics', array['integer'], 'anon', array[]::text[], 'nor see the metrics');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'select')
          and not has_table_privilege('authenticated', 'public.analytics_events', 'insert'), 'the table is closed');

-- ---- without consent nothing is recorded ------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(public.track_event('map_opened', '{"where": "DISCOVER"}'), false, 'no consent: nothing recorded, no error');
reset role;
select is((select count(*)::int from public.analytics_events where user_id = pg_temp.u(2)), 0, 'and no row');
select is((select analytics_consent_at from public.user_settings where user_id = pg_temp.u(2)), null::timestamptz,
          'off by default');

-- ---- with consent ------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.set_analytics_consent(true)$$, 'a player consents');
select is(public.track_event('map_opened', '{"where": "DISCOVER"}'), true, 'then an event is recorded');
select is(public.track_event('event_detail_viewed'), true, 'an event without properties');
select is(public.track_event('near_me_used', '{"result": "DENIED"}'), true, 'a coded result');
reset role;
select is((select count(*)::int from public.analytics_events where user_id = pg_temp.u(1)), 3, 'three rows');
select is((select version from public.user_consents where user_id = pg_temp.u(1) and kind = 'ANALYTICS' and revoked_at is null),
          'v1', 'the consent is recorded with its version');

-- No free text, no unknown events, no other keys.
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.track_event('page_viewed')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown event');
select throws_ok($$select public.track_event('filter_applied', '{"kind": "Çankaya maçları"}')$$, 'P0001', 'VALIDATION_FAILED',
                 'free text in a value');
select throws_ok($$select public.track_event('map_opened', '{"where": "PIN", "lat": 39.9}')$$, 'P0001', 'VALIDATION_FAILED',
                 'a coordinate');
select throws_ok($$select public.track_event('discover_viewed', '[1]')$$, 'P0001', 'VALIDATION_FAILED', 'not an object');
reset role;

-- At most 300 an hour.
insert into public.analytics_events (user_id, name) select pg_temp.u(1), 'event_detail_viewed' from generate_series(1, 297);
select pg_temp.act_as(pg_temp.u(1));
select is(public.track_event('event_detail_viewed'), false, 'the 301st event of the hour is dropped quietly');
reset role;

-- ---- export, withdrawal, purge -------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select is(jsonb_array_length(public.export_my_data() -> 'usage_analytics'), 300, 'the export holds them');
select lives_ok($$select public.set_analytics_consent(false)$$, 'the player withdraws');
select is(public.track_event('map_opened', '{"where": "PIN"}'), false, 'nothing is recorded after that');
reset role;
select is((select count(*)::int from public.analytics_events where user_id = pg_temp.u(1)), 0,
          'and what was recorded is deleted');
select ok((select revoked_at is not null from public.user_consents where user_id = pg_temp.u(1) and kind = 'ANALYTICS'),
          'the consent shows when it was withdrawn');

select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.set_analytics_consent(true)$$, 'P0001', null, 'consent needs a finished onboarding');
reset role;

-- ---- the pilot metrics -------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select throws_ok($$select public.admin_pilot_metrics()$$, 'P0001', 'NOT_ALLOWED', 'a player cannot see them');
select pg_temp.act_as(pg_temp.u(3), 'aal1');
select throws_ok($$select public.admin_pilot_metrics()$$, 'P0001', 'MFA_REQUIRED', 'an admin needs the second factor');
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select throws_ok($$select public.admin_pilot_metrics(0)$$, 'P0001', 'VALIDATION_FAILED', 'one day at least');
select ok(public.admin_pilot_metrics(30) ?& array['players', 'events', 'participation', 'provinces', 'provinces_active',
                                                  'usage', 'daily'], 'totals, rates, provinces, usage and a daily series');
select is(jsonb_array_length(public.admin_pilot_metrics(7) -> 'daily'), 7, 'one row per day');
select ok((public.admin_pilot_metrics(30) -> 'players' ->> 'onboarded')::int >= 3, 'onboarded players are counted');
select ok(public.admin_pilot_metrics(30)::text !~ '00000000-0000-4000-8000-0000000028', 'no person in it');
reset role;

select * from finish();
rollback;
