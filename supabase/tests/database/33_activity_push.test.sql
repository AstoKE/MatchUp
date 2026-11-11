-- ROADMAP P-20: push for a new join request and an approval ("my events", ADR-0028 addendum).
begin;
select plan(19);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000033' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.football() returns uuid language sql as $$ select id from public.sports where slug = 'football'; $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
create function pg_temp.new_event(p_key text, p_auto boolean) returns void language plpgsql as $$
begin
  insert into ids values (p_key, public.create_event(gen_random_uuid(), jsonb_build_object(
    'sport_id', pg_temp.football(),
    'sport_format_id', (select id from public.sport_formats where sport_id = pg_temp.football() and slug = '5v5'),
    'title', 'S33 ' || p_key, 'starts_at', (now() + interval '270 days')::text, 'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2', 'capacity', 12, 'auto_approve', p_auto), true));
end;
$$;
create function pg_temp.queued(p_user int, p_kind text) returns bigint language sql as $$
  select count(*) from public.push_outbox where user_id = pg_temp.u(p_user) and kind = p_kind;
$$;

-- 01 organizer · 02 player, phone · 03 player, no phone · 04 organizer, auto-approve · 05 organizer, "my events" off
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u33-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 5) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000033%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000033%';
insert into public.push_devices (user_id, token, platform)
select pg_temp.u(n), 'ExponentPushToken[s33device' || n || 'xxxx]', 'ios' from unnest(array[1, 2, 4, 5]) n;

select is((select push_activity from public.user_settings where user_id = pg_temp.u(1)), true, '"my events" starts on');
update public.user_settings set push_activity = false where user_id = pg_temp.u(5);

select pg_temp.act_as(pg_temp.u(1));
select pg_temp.new_event('e1', false);
select pg_temp.act_as(pg_temp.u(4));
select pg_temp.new_event('e2', true);
select pg_temp.act_as(pg_temp.u(5));
select pg_temp.new_event('e3', false);
select pg_temp.act_as(pg_temp.u(2));
select public.request_join(pg_temp.id('e1'));
reset role;

select is(pg_temp.queued(1, 'JOIN_REQUEST'), 1::bigint, 'a request that needs a decision is pushed to the organizer');
select is((select args #>> '{sport,tr}' from public.push_outbox where user_id = pg_temp.u(1)), 'Futbol',
  'with the sport (catalog names only)');
select ok((select send_after is not distinct from private.push_quiet_until(now()) from public.push_outbox where user_id = pg_temp.u(1)),
  'held until morning during quiet hours, sent at once otherwise');
select ok((select args::text !~ 'Kişi|ODTÜ' from public.push_outbox where user_id = pg_temp.u(1)),
  'no name and no place in what is queued');

select pg_temp.act_as(pg_temp.u(3));
select public.request_join(pg_temp.id('e1'));
select pg_temp.act_as(pg_temp.u(2));
select public.request_join(pg_temp.id('e2'));
select public.request_join(pg_temp.id('e3'));
reset role;
select is(pg_temp.queued(1, 'JOIN_REQUEST'), 1::bigint, 'a second request while the first waits: no second push');
select is(pg_temp.queued(4, 'JOIN_REQUEST'), 0::bigint, 'an automatic approval needs no decision: no push');
select is(pg_temp.queued(5, 'JOIN_REQUEST'), 0::bigint, '"my events" off: no push');

select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(p.id) from public.event_participations p
 where p.event_id = pg_temp.id('e1') and p.user_id in (pg_temp.u(2), pg_temp.u(3));
reset role;
select is(pg_temp.queued(2, 'REQUEST_APPROVED'), 1::bigint, 'the approved player is told');
select is(pg_temp.queued(3, 'REQUEST_APPROVED'), 0::bigint, 'a player without a phone gets nothing queued');

select ok(not private.push_relevant('JOIN_REQUEST', pg_temp.u(1), pg_temp.id('e1')),
  'once nobody waits for a decision, the request push no longer means anything');
select ok(private.push_relevant('REQUEST_APPROVED', pg_temp.u(2), pg_temp.id('e1')), 'the approval still does');

-- The sender: a message whose time has not come waits; one that no longer means anything is closed without a delivery.
update public.app_config set value = 'true'::jsonb where key = 'push.enabled';
update public.push_outbox set send_after = null where user_id = pg_temp.u(1);
update public.push_outbox set send_after = now() + interval '1 hour' where user_id = pg_temp.u(2);
select private.push_dispatch();
select ok((select dispatched_at is not null from public.push_outbox where user_id = pg_temp.u(1))
      and not exists (select 1 from public.push_deliveries d join public.push_outbox o on o.id = d.outbox_id
                       where o.user_id = pg_temp.u(1)),
  'a decided request is closed, not sent');
select ok((select dispatched_at is null from public.push_outbox where user_id = pg_temp.u(2)), 'a held message waits');
update public.push_outbox set send_after = null where user_id = pg_temp.u(2);
select private.push_dispatch();
select is((select count(*) from public.push_deliveries d join public.push_outbox o on o.id = d.outbox_id
            where o.user_id = pg_temp.u(2)), 1::bigint, 'and is sent when its time comes');

select is(private.push_text('JOIN_REQUEST', 'tr', '{"sport": {"tr": "Futbol"}, "district": {"tr": "Çankaya"}}') ->> 'body',
  'Futbol · Çankaya: etkinliğine katılmak isteyen var. Karar vermek için dokun.', 'the request text');
select is(private.push_text('REQUEST_APPROVED', 'en', '{}') ->> 'title', 'You''re in', 'the approval text, in English');
select is(private.push_quiet_until('2026-11-10 20:30:00+00'::timestamptz), '2026-11-11 06:00:00+00'::timestamptz,
  '23:30 in Istanbul waits until 09:00');
select ok(not has_function_privilege('anon', 'public.set_push_preferences(boolean, boolean, boolean)', 'execute')
      and not has_function_privilege('authenticated', 'private.push_relevant(text, uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.queue_activity_push()', 'execute'),
  'guests cannot set it, and nobody calls the internals');

select * from finish();
rollback;
