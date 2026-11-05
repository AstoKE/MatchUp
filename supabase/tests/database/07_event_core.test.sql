-- Phase 3 / M1: event core. Organizer RPCs, validation, lifecycle guards, capacity safety net (I-1),
-- RLS (guests see only published public events; private details only organizer/approved), notifications.
begin;
select plan(73);

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

-- A valid football 5v5 event in Ankara/Çankaya, 2 days ahead; p_over replaces fields.
create function pg_temp.input(p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', 'Akşam halı saha',
    'starts_at', (now() + interval '2 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'ODTÜ Halı Saha 2',
    'capacity', 12) || p_over;
$$;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

-- O organizer · P participant · Q other · X not onboarded · E1..E12 extra players
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid, 'u7-' || n || '@test.invalid',
       now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 16) n;
-- 01 = O, 02 = P, 03 = Q, 04 = X (not onboarded), 05..16 = E1..E12
update public.profiles set display_name = 'Oyuncu', adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000007%' and id <> '00000000-0000-4000-8000-000000000704';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000007%' and p.onboarded_at is not null;

-- ---- grants -----------------------------------------------------------------------------------------------
select function_privs_are('public', 'create_event', array['uuid', 'jsonb', 'boolean'], 'anon', array[]::text[],
  'guests cannot create events');
select function_privs_are('public', 'create_event', array['uuid', 'jsonb', 'boolean'], 'authenticated', array['EXECUTE'],
  'signed-in users may call create_event (the onboarding gate decides)');
select function_privs_are('public', 'mark_notifications_read', array['uuid[]'], 'anon', array[]::text[],
  'guests cannot touch notifications');
select function_privs_are('private', 'parse_event_input', array['jsonb'], 'authenticated', array[]::text[],
  'the validator is internal');
select table_privs_are('public', 'events', 'anon', array['SELECT'], 'guests may only read events (RLS limits rows)');
select table_privs_are('public', 'event_private_details', 'anon', array[]::text[], 'guests cannot read private details at all');

-- ---- create ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
insert into ids values ('draft', public.create_event('11111111-1111-4111-8111-111111111111', pg_temp.input(), false));
select isnt((select v from ids where k = 'draft'), null, 'create_event returns the new id');
select is(public.create_event('11111111-1111-4111-8111-111111111111', pg_temp.input('{"title": "Başka"}'), false),
  (select v from ids where k = 'draft'), 'a retried create (same client_request_id) returns the same event');
select is((select status::text || '/' || approved_count from public.events where id = (select v from ids where k = 'draft')),
  'DRAFT/0', 'a new event is a draft with no approved players');
select is((select location_label from public.event_private_details where event_id = (select v from ids where k = 'draft')),
  'ODTÜ Halı Saha 2', 'the place is stored in the private details');
select is((select public_location_label from public.events where id = (select v from ids where k = 'draft')),
  'ODTÜ Halı Saha 2', 'a PUBLIC location is also shown publicly');

select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"title": "ab"}'))$$,
  'P0001', 'VALIDATION_FAILED', 'title shorter than 3 is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"capacity": 20}'))$$,
  'P0001', 'VALIDATION_FAILED', 'capacity outside the format bounds is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input(jsonb_build_object('sport_format_id',
    (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id where s.slug = 'tennis' and f.slug = 'singles'))))$$,
  'P0001', 'VALIDATION_FAILED', 'a format of another sport is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input(jsonb_build_object('district_id', gen_random_uuid())))$$,
  'P0001', 'VALIDATION_FAILED', 'a district outside the city is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"duration_minutes": 10}'))$$,
  'P0001', 'VALIDATION_FAILED', 'duration under 15 minutes is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"skill_min": 4, "skill_max": 2}'))$$,
  'P0001', 'VALIDATION_FAILED', 'an inverted skill range is rejected');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"starts_at": "not a date"}'))$$,
  'P0001', 'VALIDATION_FAILED', 'a malformed value is a validation error, not a crash');
select throws_ok($$select public.create_event(gen_random_uuid(), '[]'::jsonb)$$,
  'P0001', 'VALIDATION_FAILED', 'a non-object input is rejected');

select pg_temp.act_as('00000000-0000-4000-8000-000000000704');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input())$$,
  'P0001', 'ONBOARDING_REQUIRED', 'users who have not onboarded cannot create events');
select pg_temp.act_as_anon();
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input())$$, '42501', null,
  'guests cannot call create_event');

-- ---- publish ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
insert into ids values ('soon', public.create_event(gen_random_uuid(),
  pg_temp.input(jsonb_build_object('starts_at', (now() + interval '30 minutes')::text))));
select throws_ok($$select public.publish_event((select v from ids where k = 'soon'))$$,
  'P0001', 'START_TOO_SOON', 'an event starting in 30 minutes cannot be published (60 min lead time)');
select lives_ok($$select public.publish_event((select v from ids where k = 'draft'))$$, 'a valid draft publishes');
select is((select status::text || '/' || approved_count from public.events where id = (select v from ids where k = 'draft')),
  'PUBLISHED/1', 'published, and the playing organizer holds one slot');
select ok(exists (select 1 from public.event_participations
                   where event_id = (select v from ids where k = 'draft')
                     and user_id = '00000000-0000-4000-8000-000000000701' and status = 'APPROVED' and is_organizer),
  'the organizer has an approved organizer row');
select lives_ok($$select public.publish_event((select v from ids where k = 'draft'))$$, 'publishing again is a no-op');

insert into ids values ('hidden', public.create_event(gen_random_uuid(),
  pg_temp.input('{"location_visibility": "APPROVED_ONLY", "title": "Gizli konum"}'), true));
insert into ids values ('invite', public.create_event(gen_random_uuid(),
  pg_temp.input('{"visibility": "INVITE_ONLY", "title": "Davetli maç"}'), true));
select is((select public_location_label from public.events where id = (select v from ids where k = 'hidden')), null,
  'an APPROVED_ONLY location is not shown publicly');
select ok((select invite_token ~ '^[0-9a-f]{64}$' from public.events where id = (select v from ids where k = 'invite')),
  'an invite-only event gets a long random token');

-- ---- who sees what -------------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select is((select count(*)::int from public.events where id = (select v from ids where k = 'draft')), 1,
  'guests see a published public event');
select is((select count(*)::int from public.events where id in ((select v from ids where k = 'soon'), (select v from ids where k = 'invite'))), 0,
  'guests see neither drafts nor invite-only events');
select throws_ok($$select * from public.event_private_details$$, '42501', null, 'guests cannot query private details');
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select is((select count(*)::int from public.event_private_details where event_id = (select v from ids where k = 'draft')), 0,
  'a non-participant cannot read the private details');
select is((select count(*)::int from public.event_participations where event_id = (select v from ids where k = 'draft')), 0,
  'a non-participant cannot list participations');
select is((select count(*)::int from public.events where id = (select v from ids where k = 'soon')), 0,
  'another user cannot see someone else''s draft');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select is((select count(*)::int from public.event_private_details where event_id in ((select v from ids where k = 'draft'), (select v from ids where k = 'hidden'))), 2,
  'the organizer reads the private details of own events');

-- ---- update ------------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select throws_ok($$select public.update_event((select v from ids where k = 'draft'), '{"title": "Ele geçirildi"}')$$,
  'P0001', 'NOT_FOUND', 'only the organizer can update (others get NOT_FOUND, no existence leak)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$select public.update_event((select v from ids where k = 'draft'), '{"title": "Perşembe maçı"}')$$,
  'the organizer can edit a published event');
select is((select title from public.events where id = (select v from ids where k = 'draft')), 'Perşembe maçı',
  'the partial update changed only the title');
select throws_ok($$select public.update_event((select v from ids where k = 'draft'), jsonb_build_object('sport_id',
    (select id from public.sports where slug = 'tennis'), 'sport_format_id',
    (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id where s.slug = 'tennis' and f.slug = 'doubles'),
    'capacity', 4))$$,
  'P0001', 'INVALID_TRANSITION', 'the sport cannot change after publishing (I-7)');
reset role;

-- ---- capacity: fill the event with extra players (direct writes as the owner role) ---------------------------
insert into public.event_participations (event_id, user_id, status)
select (select v from ids where k = 'draft'), ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid, 'REQUESTED'
  from generate_series(5, 16) n;
update public.event_participations set status = 'APPROVED', approved_at = now()
 where event_id = (select v from ids where k = 'draft')
   and user_id in (select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid from generate_series(5, 14) n);

select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select throws_ok($$select public.update_event((select v from ids where k = 'draft'), '{"capacity": 10}')$$,
  'P0001', 'VALIDATION_FAILED', 'capacity cannot drop below the approved count (I-6)');
reset role;
select lives_ok($$update public.event_participations set status = 'APPROVED', approved_at = now()
                   where event_id = (select v from ids where k = 'draft') and user_id = '00000000-0000-4000-8000-000000000715'$$,
  'the last free slot can be filled');
select throws_ok($$update public.event_participations set status = 'APPROVED', approved_at = now()
                    where event_id = (select v from ids where k = 'draft') and user_id = '00000000-0000-4000-8000-000000000716'$$,
  'P0001', 'EVENT_FULL', 'the safety net refuses a 13th approval even for a direct write (I-1)');
select is((select approved_count::int from public.events where id = (select v from ids where k = 'draft')),
  (select count(*)::int from public.event_participations where event_id = (select v from ids where k = 'draft') and status = 'APPROVED'),
  'approved_count equals the approved rows');
select is((select approved_count::int from public.events where id = (select v from ids where k = 'draft')), 12,
  'and the event is exactly full');

-- ---- material change ------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$select public.update_event((select v from ids where k = 'draft'),
                  jsonb_build_object('starts_at', (now() + interval '3 days')::text))$$, 'the organizer moves the event');
reset role;
select is((select count(*)::int from public.notifications
            where type = 'EVENT_CHANGED' and payload ->> 'event_id' = (select v from ids where k = 'draft')::text), 12,
  'every active non-organizer participant is notified of the material change');
select isnt((select last_material_change_at from public.events where id = (select v from ids where k = 'draft')), null,
  'the material change time is recorded (cancellations in the next 24 h will be excused)');
select is((select count(*)::int from public.notifications
            where payload ->> 'event_id' = (select v from ids where k = 'draft')::text
              and payload - 'event_id' <> '{}'::jsonb), 0,
  'notification payloads carry the event id only');

-- ---- guards against direct writes ---------------------------------------------------------------------------
select throws_ok($$update public.events set status = 'DRAFT' where id = (select v from ids where k = 'draft')$$,
  'P0001', 'INVALID_TRANSITION', 'a published event cannot go back to draft, even for the owner role (I-3)');
select throws_ok($$update public.event_participations set status = 'REMOVED'
                    where event_id = (select v from ids where k = 'draft') and user_id = '00000000-0000-4000-8000-000000000716'$$,
  'P0001', 'INVALID_TRANSITION', 'REQUESTED cannot jump to REMOVED (I-3)');
select throws_ok($$update public.event_participations set status = 'CANCELED'
                    where event_id = (select v from ids where k = 'draft') and is_organizer$$,
  'P0001', 'INVALID_TRANSITION', 'the organizer''s own row cannot be canceled (I-7)');
select throws_ok($$insert into public.event_participations (event_id, user_id, status)
                   values ((select v from ids where k = 'hidden'), '00000000-0000-4000-8000-000000000702', 'APPROVED')$$,
  'P0001', 'INVALID_TRANSITION', 'nobody can be inserted directly as approved');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select throws_ok($$update public.events set title = 'Doğrudan' where id = (select v from ids where k = 'draft')$$,
  '42501', null, 'clients cannot write the events table directly (I-13)');

-- ---- cancel -----------------------------------------------------------------------------------------------
select throws_ok($$select public.cancel_event((select v from ids where k = 'draft'), 'BECAUSE')$$,
  'P0001', 'VALIDATION_FAILED', 'an unknown cancel reason is rejected');
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select throws_ok($$select public.cancel_event((select v from ids where k = 'draft'), 'WEATHER')$$,
  'P0001', 'NOT_FOUND', 'only the organizer can cancel');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$select public.cancel_event((select v from ids where k = 'draft'), 'WEATHER', 'Yağmur bekleniyor')$$,
  'the organizer cancels before the start');
select lives_ok($$select public.cancel_event((select v from ids where k = 'draft'), 'WEATHER')$$, 'cancelling again is a no-op');
select throws_ok($$select public.update_event((select v from ids where k = 'draft'), '{"title": "Yeniden"}')$$,
  'P0001', 'INVALID_TRANSITION', 'a canceled event is frozen');
reset role;
select is((select status::text from public.events where id = (select v from ids where k = 'draft')), 'CANCELED',
  'the event is canceled');
select is((select count(*)::int from public.notifications
            where type = 'EVENT_CANCELED' and payload ->> 'event_id' = (select v from ids where k = 'draft')::text), 12,
  'every active non-organizer participant is notified once');

-- ---- complete / delete draft --------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select throws_ok($$select public.complete_event((select v from ids where k = 'hidden'))$$,
  'P0001', 'INVALID_TRANSITION', 'an event cannot be completed before it starts');
reset role;
update public.events set starts_at = now() - interval '2 hours' where id = (select v from ids where k = 'hidden');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$select public.complete_event((select v from ids where k = 'hidden'))$$, 'after the start it can be completed');
select is((select status::text from public.events where id = (select v from ids where k = 'hidden')), 'COMPLETED',
  'the event is completed');
select throws_ok($$select public.delete_draft((select v from ids where k = 'invite'))$$,
  'P0001', 'INVALID_TRANSITION', 'only drafts can be deleted');
select lives_ok($$select public.delete_draft((select v from ids where k = 'soon'))$$, 'a draft can be deleted');
select is((select count(*)::int from public.events where id = (select v from ids where k = 'soon')), 0, 'the draft is gone');

-- ---- quotas (ADR-0019) ----------------------------------------------------------------------------------------
reset role;
update public.app_config set value = '1'::jsonb where key = 'quota.max_upcoming_published_events';
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"title": "Bir tane daha"}'), true)$$,
  'P0001', 'QUOTA_EXCEEDED', 'no more upcoming published events than the quota');
reset role;
-- Three events exist from today (the deleted draft no longer counts: drafts are invisible to others).
update public.app_config set value = '3'::jsonb where key = 'quota.max_events_created_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select throws_ok($$select public.create_event(gen_random_uuid(), pg_temp.input('{"title": "Taslak daha"}'))$$,
  'P0001', 'QUOTA_EXCEEDED', 'no more events created per 24 hours than the quota');

-- ---- notifications --------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000705');
select is((select count(*)::int from public.notifications), 2, 'a player sees exactly their own two notifications');
select is(public.mark_notifications_read(null), 2, 'marking all read updates both');
select is(public.mark_notifications_read(null), 0, 'and is idempotent');
select pg_temp.act_as_anon();
select throws_ok($$select public.mark_notifications_read(null)$$, '42501', null, 'guests cannot mark notifications');

-- ---- export covers the new tables -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select is((select jsonb_array_length(public.export_my_data() -> 'organized_events')), 3,
  'the organizer''s export lists the organized events');

select * from finish();
rollback;
