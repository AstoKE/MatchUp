-- Phase 3 / M4: participation (request_join, cancel, approve / reject / waitlist / remove, the organizer's
-- queue) and the auto-approve option. Negative paths first-class: strangers, guests, not-onboarded users,
-- drafts, closed registration, terminal states, quotas. Capacity under concurrency is proven separately
-- with real parallel connections (packages/db-tests, participation-concurrency).
begin;
select plan(90);

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid;
$$;

-- Far ahead so nothing else on the local database interferes.
create function pg_temp.input(p_title text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title,
    'starts_at', (now() + interval '230 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 10) || p_over;
$$;
create function pg_temp.tennis(p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'tennis'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'tennis' and f.slug = 'singles'),
    'capacity', 2) || p_over;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
-- The participation row id of user n on event k (read as the superuser role).
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.pstatus(k text, n int) returns text language sql as $$
  select status::text from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;
create function pg_temp.notes(n int, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = pg_temp.u(n) and type = p_type;
$$;
create function pg_temp.approved(k text) returns int language sql as $$
  select approved_count::int from public.events where id = pg_temp.ev(k);
$$;

-- 01 organizer O · 02..07 players P1..P6 · 08 not onboarded · 09 organizer Q
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u10-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 9) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000010%' and id <> pg_temp.u(8);
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000010%' and p.onboarded_at is not null;
insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level)
values (pg_temp.u(2), (select id from public.sports where slug = 'football'), 3.5);

-- ---- grants ------------------------------------------------------------------------------------------------
select function_privs_are('public', 'request_join', array['uuid', 'text', 'uuid', 'text'], 'anon', array[]::text[], 'guests cannot request');
select function_privs_are('public', 'request_join', array['uuid', 'text', 'uuid', 'text'], 'authenticated', array['EXECUTE'], 'users can request');
select function_privs_are('public', 'cancel_participation', array['uuid'], 'anon', array[]::text[], 'guests cannot cancel');
select function_privs_are('public', 'approve_participation', array['uuid'], 'anon', array[]::text[], 'guests cannot approve');
select function_privs_are('public', 'reject_participation', array['uuid'], 'anon', array[]::text[], 'guests cannot reject');
select function_privs_are('public', 'waitlist_participation', array['uuid'], 'anon', array[]::text[], 'guests cannot waitlist');
select function_privs_are('public', 'remove_participant', array['uuid', 'text'], 'anon', array[]::text[], 'guests cannot remove');
select function_privs_are('public', 'list_event_requests', array['uuid'], 'anon', array[]::text[], 'guests cannot read the queue');
select function_privs_are('private', 'lock_participation_for_organizer', array['uuid', 'uuid'], 'authenticated', array[]::text[],
  'the organizer lock helper is internal');

-- ---- fixtures --------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('main', public.create_event(gen_random_uuid(), pg_temp.input('S10 Ana maç'), true));
insert into ids values ('wl', public.create_event(gen_random_uuid(), pg_temp.input('S10 Yedekli', pg_temp.tennis()), true));
insert into ids values ('auto', public.create_event(gen_random_uuid(),
  pg_temp.input('S10 Otomatik', pg_temp.tennis('{"auto_approve": true}')), true));
insert into ids values ('past', public.create_event(gen_random_uuid(), pg_temp.input('S10 Başlamış'), true));
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S10 Taslak'), false));

select pg_temp.act_as(pg_temp.u(9));
insert into ids values ('nowl', public.create_event(gen_random_uuid(),
  pg_temp.input('S10 Listesiz', pg_temp.tennis('{"waitlist_enabled": false}')), true));
insert into ids values ('closed', public.create_event(gen_random_uuid(),
  pg_temp.input('S10 Kayıt kapalı', jsonb_build_object('registration_closes_at', (now() - interval '1 hour')::text)), true));
insert into ids values ('canc', public.create_event(gen_random_uuid(), pg_temp.input('S10 İptal'), true));
insert into ids values ('invite', public.create_event(gen_random_uuid(), pg_temp.input('S10 Davetli', '{"visibility": "INVITE_ONLY"}'), true));
select public.cancel_event(pg_temp.ev('canc'), 'WEATHER', null);

reset role;
-- The "past" event has started: moved by the owner role (organizers cannot do this through the API).
update public.events set starts_at = now() - interval '1 hour' where id = pg_temp.ev('past');
select is((select auto_approve from public.events where id = pg_temp.ev('auto')), true, 'auto_approve is stored');
select is((select auto_approve from public.events where id = pg_temp.ev('main')), false, '... and off by default');

-- ---- request_join: refusals ---------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, '42501', null, 'guests are refused');
select pg_temp.act_as(pg_temp.u(8));
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, 'P0001', 'ONBOARDING_REQUIRED', 'users who have not onboarded are refused');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, 'P0001', 'NOT_ALLOWED', 'organizers cannot join their own event (I-5)');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.request_join(pg_temp.ev('draft'))$$, 'P0001', 'NOT_FOUND', 'a draft does not exist for players');
select throws_ok($$select public.request_join(pg_temp.ev('invite'))$$, 'P0001', 'NOT_FOUND', 'invite-only events are not open to requests yet');
select throws_ok($$select public.request_join(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'an unknown event');
select throws_ok($$select public.request_join(pg_temp.ev('closed'))$$, 'P0001', 'REGISTRATION_CLOSED', 'registration closed by the organizer');
select throws_ok($$select public.request_join(pg_temp.ev('canc'))$$, 'P0001', 'REGISTRATION_CLOSED', 'a canceled event');
select throws_ok($$select public.request_join(pg_temp.ev('past'))$$, 'P0001', 'REGISTRATION_CLOSED', 'an event that has started');
select throws_ok($$select public.request_join(pg_temp.ev('main'), repeat('x', 281))$$, 'P0001', 'VALIDATION_FAILED', 'a message over 280 characters');
select throws_ok($$select public.request_join(pg_temp.ev('wl'), null,
    (select p.id from public.sport_positions p join public.sports s on s.id = p.sport_id where s.slug = 'football' limit 1))$$,
  'P0001', 'VALIDATION_FAILED', 'a position that belongs to another sport');

-- ---- request_join: the happy paths --------------------------------------------------------------------------------------
select is(public.request_join(pg_temp.ev('main'), '  Orta saha oynarım  '), 'REQUESTED', 'a request on an open event is REQUESTED');
select is(public.request_join(pg_temp.ev('main')), 'REQUESTED', 'asking again is idempotent');
reset role;
select is((select count(*)::int from public.event_participations where event_id = pg_temp.ev('main') and user_id = pg_temp.u(2)), 1,
  '... and does not create a second row');
select is((select request_message from public.event_participations where id = pg_temp.part('main', 2)), 'Orta saha oynarım',
  'the message is trimmed and stored');
select is(pg_temp.notes(1, 'JOIN_REQUESTED'), 1, 'the organizer is told once');

-- ---- the organizer's queue ----------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(3));
select public.request_join(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(4));
select throws_ok($$select public.list_event_requests(pg_temp.ev('main'))$$, 'P0001', 'NOT_FOUND', 'a player cannot read the queue');
select pg_temp.act_as_anon();
select throws_ok($$select public.list_event_requests(pg_temp.ev('main'))$$, '42501', null, 'nor can a guest');
select pg_temp.act_as(pg_temp.u(1));
select is((select jsonb_array_length(public.list_event_requests(pg_temp.ev('main')) -> 'items')), 2, 'the organizer sees both requests');
select is(public.list_event_requests(pg_temp.ev('main')) -> 'items' -> 0 ->> 'display_name', 'Kişi 02', 'oldest request first, with the name');
select is((public.list_event_requests(pg_temp.ev('main')) -> 'items' -> 0 ->> 'level')::numeric, 3.5, '... and the self-assessed level');
select is((select array_agg(k order by k) from (select distinct jsonb_object_keys(i) k
    from jsonb_array_elements(public.list_event_requests(pg_temp.ev('main')) -> 'items') i) s),
  array['avatar_key', 'avatar_path', 'display_name', 'id', 'level', 'message', 'position_id', 'rating', 'reliability', 'request_count', 'requested_at', 'status', 'user_id'],
  'the queue exposes only these fields (no email)');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.list_event_requests(pg_temp.ev('main'))$$, 'P0001', 'NOT_FOUND', 'another organizer cannot read it either');

-- ---- approve / reject / waitlist / remove ------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.approve_participation(pg_temp.part('main', 3))$$, 'P0001', 'NOT_FOUND', 'a player cannot approve (even their own request)');
select pg_temp.act_as_anon();
select throws_ok($$select public.approve_participation(pg_temp.part('main', 3))$$, '42501', null, 'a guest cannot approve');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.approve_participation(pg_temp.part('main', 3))$$, 'P0001', 'NOT_FOUND', 'another organizer cannot approve');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.approve_participation(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'an unknown request');
select lives_ok($$select public.approve_participation(pg_temp.part('main', 2))$$, 'the organizer approves');
select lives_ok($$select public.approve_participation(pg_temp.part('main', 2))$$, '... and approving again is a no-op');
reset role;
select is(pg_temp.pstatus('main', 2), 'APPROVED', 'status APPROVED');
select is(pg_temp.approved('main'), 2, 'approved_count counts the organizer and the player');
select is(pg_temp.notes(2, 'REQUEST_APPROVED'), 1, 'the player is told once');

select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.reject_participation(pg_temp.part('main', 3))$$, 'the organizer rejects');
reset role;
select is(pg_temp.pstatus('main', 3), 'REJECTED', 'status REJECTED');
select is(pg_temp.notes(4, 'REQUEST_REJECTED') + pg_temp.notes(3, 'REQUEST_REJECTED'), 1, 'the rejected player is told, without a reason in the payload');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.approve_participation(pg_temp.part('main', 3))$$, 'P0001', 'INVALID_TRANSITION', 'a rejected request cannot be approved later');
select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, 'P0001', 'NOT_ALLOWED', 'a rejected player cannot ask again');

select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.remove_participant(pg_temp.part('main', 3))$$, 'P0001', 'INVALID_TRANSITION', 'only approved players can be removed');
select throws_ok($$select public.remove_participant(pg_temp.part('main', 2), repeat('x', 281))$$, 'P0001', 'VALIDATION_FAILED', 'removal reason over 280 characters');
select lives_ok($$select public.remove_participant(pg_temp.part('main', 2), 'Kural ihlali')$$, 'the organizer removes an approved player');
reset role;
select is(pg_temp.pstatus('main', 2), 'REMOVED', 'status REMOVED');
select is(pg_temp.approved('main'), 1, 'the spot is free again');
select is((select status_reason from public.event_participations where id = pg_temp.part('main', 2)), 'Kural ihlali', 'the reason is kept for moderation');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, 'P0001', 'NOT_ALLOWED', 'a removed player cannot ask again');

-- ---- cancel_participation --------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(5));
select public.request_join(pg_temp.ev('main'));
select lives_ok($$select public.cancel_participation(pg_temp.ev('main'))$$, 'a player withdraws a pending request');
select lives_ok($$select public.cancel_participation(pg_temp.ev('main'))$$, '... and withdrawing twice is a no-op');
reset role;
select is(pg_temp.pstatus('main', 5), 'CANCELED', 'status CANCELED');
select is(pg_temp.notes(1, 'PARTICIPANT_CANCELED'), 0, 'withdrawing a pending request does not bother the organizer');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok($$select public.cancel_participation(pg_temp.ev('main'))$$, 'P0001', 'NOT_FOUND', 'someone with no request has nothing to cancel');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.cancel_participation(pg_temp.ev('main'))$$, 'P0001', 'NOT_ALLOWED', 'the organizer cannot withdraw from their own event (I-7)');

-- Three requests per event: request, cancel, request, cancel, request, cancel -> no more.
select pg_temp.act_as(pg_temp.u(5));
select public.request_join(pg_temp.ev('main'));
select public.cancel_participation(pg_temp.ev('main'));
select public.request_join(pg_temp.ev('main'));
select public.cancel_participation(pg_temp.ev('main'));
select throws_ok($$select public.request_join(pg_temp.ev('main'))$$, 'P0001', 'REQUEST_LIMIT_REACHED', 'at most three requests per event');

-- ---- full events, waitlist, auto-approve -------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(public.request_join(pg_temp.ev('wl')), 'REQUESTED', 'a tennis event with a free spot: REQUESTED');
select pg_temp.act_as(pg_temp.u(1));
select public.approve_participation(pg_temp.part('wl', 2));
select pg_temp.act_as(pg_temp.u(3));
select is(public.request_join(pg_temp.ev('wl')), 'WAITLISTED', 'a full event with a waitlist: WAITLISTED');
reset role;
select isnt((select waitlisted_at from public.event_participations where id = pg_temp.part('wl', 3)), null, 'the waitlist time is kept (FIFO)');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.approve_participation(pg_temp.part('wl', 3))$$, 'P0001', 'EVENT_FULL', 'the organizer cannot approve beyond the capacity');
-- Without a waitlist a full event is simply full.
select pg_temp.act_as(pg_temp.u(2));
select is(public.request_join(pg_temp.ev('nowl')), 'REQUESTED', 'no-waitlist event: the free spot is requested');
select pg_temp.act_as(pg_temp.u(9));
select public.approve_participation(pg_temp.part('nowl', 2));
select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$select public.request_join(pg_temp.ev('nowl'))$$, 'P0001', 'EVENT_FULL', 'a full event without a waitlist refuses requests');

-- The organizer can put a pending request on the waitlist; promotion is always their explicit decision.
select pg_temp.act_as(pg_temp.u(4));
select public.request_join(pg_temp.ev('main'));
select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.waitlist_participation(pg_temp.part('main', 4))$$, 'the organizer waitlists a request');
select lives_ok($$select public.waitlist_participation(pg_temp.part('main', 4))$$, '... idempotently');
reset role;
select is(pg_temp.pstatus('main', 4), 'WAITLISTED', 'status WAITLISTED');
select is(pg_temp.notes(4, 'REQUEST_WAITLISTED'), 1, 'the player is told');
select pg_temp.act_as(pg_temp.u(9));
select throws_ok($$select public.waitlist_participation(pg_temp.part('nowl', 2))$$, 'P0001', 'INVALID_TRANSITION',
  'only a pending request can be waitlisted');

-- Withdrawing an approved spot tells the organizer; with people waiting that is the prompt to promote.
select pg_temp.act_as(pg_temp.u(2));
select public.cancel_participation(pg_temp.ev('wl'));
reset role;
select is(pg_temp.approved('wl'), 1, 'the spot is free again');
select is(pg_temp.notes(1, 'PARTICIPANT_CANCELED'), 1, 'the organizer is told about the withdrawal');
select is(pg_temp.notes(1, 'SPOT_OPENED'), 1, '... and that a spot opened, because someone is waiting');
select is(pg_temp.pstatus('wl', 3), 'WAITLISTED', 'nobody was promoted automatically');
select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.approve_participation(pg_temp.part('wl', 3))$$, 'the organizer promotes the first in line');
reset role;
select is(pg_temp.pstatus('wl', 3), 'APPROVED', 'promoted by decision');

-- Auto-approve: a free spot and nobody waiting means approved at once; the queue is never jumped.
select pg_temp.act_as(pg_temp.u(2));
select is(public.request_join(pg_temp.ev('auto')), 'APPROVED', 'auto-approve with a free spot: APPROVED at once');
select pg_temp.act_as(pg_temp.u(3));
select is(public.request_join(pg_temp.ev('auto')), 'WAITLISTED', 'the event is now full: WAITLISTED, not approved');
select pg_temp.act_as(pg_temp.u(2));
select public.cancel_participation(pg_temp.ev('auto'));
select pg_temp.act_as(pg_temp.u(4));
select is(public.request_join(pg_temp.ev('auto')), 'REQUESTED', 'a spot is free but someone waits: a newcomer is not auto-approved');
reset role;
select is(pg_temp.approved('auto'), 1, 'only the organizer holds a spot');

-- Open-request quota (per player, app_config).
update public.app_config set value = '1'::jsonb where key = 'quota.max_open_requests';
select pg_temp.act_as(pg_temp.u(6));
select is(public.request_join(pg_temp.ev('main')), 'REQUESTED', 'quota 1: the first open request is fine');
select throws_ok($$select public.request_join(pg_temp.ev('auto'))$$, 'P0001', 'QUOTA_EXCEEDED', '... the second is not');
reset role;
update public.app_config set value = '20'::jsonb where key = 'quota.max_open_requests';

-- An event that has started accepts no more decisions or withdrawals.
insert into public.event_participations (event_id, user_id, status) values (pg_temp.ev('past'), pg_temp.u(6), 'REQUESTED');
select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.approve_participation(pg_temp.part('past', 6))$$, 'P0001', 'INVALID_TRANSITION', 'no approving once the event started');
select pg_temp.act_as(pg_temp.u(6));
select throws_ok($$select public.cancel_participation(pg_temp.ev('past'))$$, 'P0001', 'INVALID_TRANSITION', 'no withdrawing once the event started');

-- A withdrawal within 24 h of a time/place change is excused (PRD §4.3).
reset role;
update public.events set last_material_change_at = now() where id = pg_temp.ev('main');
select pg_temp.act_as(pg_temp.u(6));
select public.cancel_participation(pg_temp.ev('main'));
reset role;
select is((select cancellation_excused from public.event_participations where id = pg_temp.part('main', 6)), true,
  'a withdrawal soon after a material change is excused');

-- The option can be switched on later through the same partial update.
select pg_temp.act_as(pg_temp.u(1));
select lives_ok($$select public.update_event(pg_temp.ev('main'), '{"auto_approve": true}')$$, 'auto-approve can be enabled on a published event');
reset role;
select is((select auto_approve from public.events where id = pg_temp.ev('main')), true, '... and sticks');

select * from finish();
rollback;
