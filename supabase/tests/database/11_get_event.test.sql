-- Phase 3 completion: get_event (the event page read, open to guests) and invite-only events.
-- What each kind of viewer may and may not see; the invite token is the only way into an invite-only event.
begin;
select plan(59);

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
  select ('00000000-0000-4000-8000-0000000011' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.input(p_title text, p_over jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'sport_id', (select id from public.sports where slug = 'football'),
    'sport_format_id', (select f.id from public.sport_formats f join public.sports s on s.id = f.sport_id
                         where s.slug = 'football' and f.slug = '5v5'),
    'title', p_title,
    'starts_at', (now() + interval '240 days')::text,
    'duration_minutes', 90,
    'city_id', (select id from public.cities where slug = 'ankara'),
    'district_id', (select id from public.districts where slug = 'cankaya'),
    'location_label', 'Gizli Halı Saha',
    'address_text', 'Gizli sokak 7',
    'participant_notes', 'Kapıda bekleyin',
    'capacity', 10) || p_over;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
create function pg_temp.ev(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;
-- Read with the owner's rights: the whole point is that a guest cannot read this column.
create function pg_temp.token(k text) returns text language sql security definer as $$
  select invite_token from public.events where id = pg_temp.ev(k);
$$;
create function pg_temp.part(k text, n int) returns uuid language sql as $$
  select id from public.event_participations where event_id = pg_temp.ev(k) and user_id = pg_temp.u(n);
$$;

-- 01 organizer · 02 approved P1 · 03 requested P2 · 04 stranger · 05 invited player · 06 organizer being deleted
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u11-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 6) n;
update public.profiles set display_name = case right(id::text, 2)
    when '01' then 'Düzenleyen D' when '02' then 'Onaylı O' when '03' then 'İstekçi İ'
    when '04' then 'Yabancı Y' when '05' then 'Davetli D' else 'Silinen S' end,
  adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000011%';
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id::text like '00000000-0000-4000-8000-0000000011%';

select function_privs_are('public', 'get_event', array['uuid', 'text'], 'anon', array['EXECUTE'], 'guests may read an event page');
select function_privs_are('public', 'request_join', array['uuid', 'text', 'uuid', 'text'], 'anon', array[]::text[], 'guests still cannot request');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.get_event(uuid, text)'::regprocedure),
  'get_event is SECURITY DEFINER with an empty search_path and a statement timeout');

-- ---- fixtures ---------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('pub', public.create_event(gen_random_uuid(), pg_temp.input('S11 Açık maç'), true));
insert into ids values ('hidden', public.create_event(gen_random_uuid(),
  pg_temp.input('S11 Gizli yer', '{"location_visibility": "APPROVED_ONLY"}'), true));
insert into ids values ('invite', public.create_event(gen_random_uuid(),
  pg_temp.input('S11 Davetli', '{"visibility": "INVITE_ONLY"}'), true));
insert into ids values ('draft', public.create_event(gen_random_uuid(), pg_temp.input('S11 Taslak'), false));
insert into ids values ('canc', public.create_event(gen_random_uuid(), pg_temp.input('S11 İptal'), true));
select pg_temp.act_as(pg_temp.u(6));
insert into ids values ('gone', public.create_event(gen_random_uuid(), pg_temp.input('S11 Silinen hesap'), true));

reset role;
insert into public.event_participations (event_id, user_id, status)
select pg_temp.ev(k), pg_temp.u(n), 'REQUESTED' from (values ('pub', 2), ('pub', 3), ('hidden', 2), ('canc', 2)) v(k, n);
update public.event_participations set status = 'APPROVED', approved_at = now()
 where user_id = pg_temp.u(2) and event_id in (pg_temp.ev('pub'), pg_temp.ev('hidden'), pg_temp.ev('canc'));
-- A canceled event is frozen, so the roster is settled first and the event canceled afterwards.
select pg_temp.act_as(pg_temp.u(1));
select public.cancel_event(pg_temp.ev('canc'), 'WEATHER', null);
reset role;
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() where id = pg_temp.u(6);

-- ---- a guest ------------------------------------------------------------------------------------------------------
select pg_temp.act_as_anon();
select is(public.get_event(pg_temp.ev('pub')) ->> 'title', 'S11 Açık maç', 'a guest reads a published public event');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_event(pg_temp.ev('pub'))) k),
  array['approved_count', 'auto_approve', 'booking_status', 'cancel_message', 'cancel_reason', 'capacity', 'city_id',
        'cost_amount_minor', 'cost_note', 'description', 'district_id', 'duration_minutes', 'ends_at', 'equipment_note',
        'id', 'invite_token', 'is_organizer', 'location_visibility', 'my_status', 'organizer_name', 'organizer_plays',
        'participants', 'participants_visible', 'private', 'public_location_label', 'setting', 'skill_max', 'skill_min',
        'sport_format_id', 'sport_id', 'starts_at', 'status', 'title', 'visibility', 'waitlist_enabled'],
  'the page has exactly this field list: no organizer id, no email');
select is(public.get_event(pg_temp.ev('pub')) ->> 'organizer_name', 'Düzenleyen D', 'the organizer''s display name is shown');
select is(public.get_event(pg_temp.ev('pub')) -> 'private', 'null'::jsonb, 'a guest gets no private details');
select is(public.get_event(pg_temp.ev('pub')) -> 'participants', 'null'::jsonb, 'nor the roster');
select is((public.get_event(pg_temp.ev('pub')) ->> 'participants_visible')::boolean, false, '... and is told it is hidden');
select is((public.get_event(pg_temp.ev('pub')) ->> 'approved_count')::int, 2, 'the count is public');
select is((public.get_event(pg_temp.ev('pub')) ->> 'is_organizer')::boolean, false, 'a guest is not the organizer');
select is(public.get_event(pg_temp.ev('pub')) -> 'my_status', 'null'::jsonb, 'a guest has no participation');
select ok(public.get_event(pg_temp.ev('pub'))::text not like '%Gizli sokak%' and public.get_event(pg_temp.ev('pub'))::text not like '%Kapıda%',
  'the street address and the notes appear nowhere in a guest''s answer');
select is(public.get_event(pg_temp.ev('hidden')) -> 'public_location_label', 'null'::jsonb, 'a hidden place has no public label');
select is(public.get_event(pg_temp.ev('draft')), null::jsonb, 'a draft does not exist for a guest');
select is(public.get_event(pg_temp.ev('canc')), null::jsonb, 'nor does a canceled event (it keeps the public listing rule)');
select is(public.get_event(gen_random_uuid()), null::jsonb, 'an unknown event');
select is(public.get_event(pg_temp.ev('gone')), null::jsonb, 'an event of an account that is being deleted');

-- ---- invite-only: the token is the only way in ---------------------------------------------------------------------------
select is(public.get_event(pg_temp.ev('invite')), null::jsonb, 'an invite-only event is invisible without its token');
select is(public.get_event(pg_temp.ev('invite'), 'wrong'), null::jsonb, '... with a wrong one');
select is(public.get_event(pg_temp.ev('invite'), repeat('0', 64)), null::jsonb, '... with a well-formed wrong one');
select is(public.get_event(pg_temp.ev('invite'), pg_temp.token('invite')) ->> 'title', 'S11 Davetli', '... visible with the right token');
select is(public.get_event(pg_temp.ev('invite'), pg_temp.token('invite')) -> 'invite_token', 'null'::jsonb,
  'the token is never echoed to someone who only holds it');
select is(public.get_event(pg_temp.ev('pub'), 'anything') ->> 'title', 'S11 Açık maç', 'a token on a public event is ignored');
select is((select count(*)::int from public.events where id = pg_temp.ev('invite')), 0, 'the table itself still hides the invite-only event from guests');

-- ---- signed-in strangers and requesters ---------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(4));
select is(public.get_event(pg_temp.ev('pub')) -> 'private', 'null'::jsonb, 'a stranger gets no private details');
select is(public.get_event(pg_temp.ev('pub')) -> 'participants', 'null'::jsonb, '... nor the roster');
select is(public.get_event(pg_temp.ev('draft')), null::jsonb, 'nor someone else''s draft');
select is(public.get_event(pg_temp.ev('invite')), null::jsonb, 'nor an invite-only event without the token');
select pg_temp.act_as(pg_temp.u(3));
select is(public.get_event(pg_temp.ev('pub')) ->> 'my_status', 'REQUESTED', 'a requester sees their own status');
select is(public.get_event(pg_temp.ev('pub')) -> 'private', 'null'::jsonb, 'but no private details until approved');
select is(public.get_event(pg_temp.ev('pub')) -> 'participants', 'null'::jsonb, '... nor the roster');

-- ---- an approved player -------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(2));
select is(public.get_event(pg_temp.ev('pub')) ->> 'my_status', 'APPROVED', 'an approved player sees their status');
select is(public.get_event(pg_temp.ev('pub')) -> 'private' ->> 'address_text', 'Gizli sokak 7', 'and the address');
select is(public.get_event(pg_temp.ev('pub')) -> 'private' ->> 'participant_notes', 'Kapıda bekleyin', '... and the notes');
select is(public.get_event(pg_temp.ev('hidden')) -> 'private' ->> 'location_label', 'Gizli Halı Saha', 'and a hidden place once approved');
select is((select array_agg(p ->> 'display_name') from jsonb_array_elements(public.get_event(pg_temp.ev('pub')) -> 'participants') p),
  array['Onaylı O'], 'the roster lists approved players only (not the pending one, not the organizer)');
select is((public.get_event(pg_temp.ev('pub')) ->> 'participants_visible')::boolean, true, '... and says so');
select is((select array_agg(k order by k) from (select distinct jsonb_object_keys(p) k
    from jsonb_array_elements(public.get_event(pg_temp.ev('pub')) -> 'participants') p) s), array['display_name'],
  'a roster entry holds a display name and nothing else');
select is(public.get_event(pg_temp.ev('canc')) ->> 'status', 'CANCELED', 'a participant still sees a canceled event they were in');
select is(public.get_event(pg_temp.ev('draft')), null::jsonb, 'but not a draft');

-- ---- the organizer ------------------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select is((public.get_event(pg_temp.ev('pub')) ->> 'is_organizer')::boolean, true, 'the organizer knows they are');
select is(public.get_event(pg_temp.ev('draft')) ->> 'status', 'DRAFT', 'the organizer sees their draft');
select is(public.get_event(pg_temp.ev('pub')) -> 'private' ->> 'location_label', 'Gizli Halı Saha', 'and the private details');
select is(jsonb_array_length(public.get_event(pg_temp.ev('pub')) -> 'participants'), 1, 'and the roster');
select is(public.get_event(pg_temp.ev('invite')) ->> 'invite_token', pg_temp.token('invite'), 'and the invite token of an invite-only event');
select is(public.get_event(pg_temp.ev('pub')) -> 'invite_token', 'null'::jsonb, 'but there is no token on a public event');
select pg_temp.act_as(pg_temp.u(6));
select is(public.get_event(pg_temp.ev('gone')) ->> 'title', 'S11 Silinen hesap', 'an organizer being deleted still sees their own event');

-- ---- request_join with the token -------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(5));
select throws_ok($$select public.request_join(pg_temp.ev('invite'))$$, 'P0001', 'NOT_FOUND', 'no request without the token');
select throws_ok($$select public.request_join(pg_temp.ev('invite'), null, null, 'wrong')$$, 'P0001', 'NOT_FOUND', 'nor with a wrong one');
select throws_ok($$select public.request_join(pg_temp.ev('invite'), null, null, '')$$, 'P0001', 'NOT_FOUND', 'nor with an empty one');
select is(public.request_join(pg_temp.ev('invite'), null, null, pg_temp.token('invite')), 'REQUESTED', 'with the right token the request goes through');
select is(public.request_join(pg_temp.ev('invite'), null, null, pg_temp.token('invite')), 'REQUESTED', '... idempotently');
select is(public.request_join(pg_temp.ev('pub'), null, null, 'ignored'), 'REQUESTED', 'a token on a public event changes nothing');
select is(public.request_join(pg_temp.ev('hidden')), 'REQUESTED', 'the three-argument form still works (installed apps)');
select is(public.get_event(pg_temp.ev('invite')) ->> 'my_status', 'REQUESTED', 'once asked, the requester finds the event without the token');
select pg_temp.act_as_anon();
select throws_ok($$select public.request_join(pg_temp.ev('invite'), null, null, 'x')$$, '42501', null, 'a guest cannot request even with a token');
select pg_temp.act_as(pg_temp.u(4));
select is(public.get_event(pg_temp.ev('invite')), null::jsonb, 'someone else still cannot open the invite-only event without the token');

-- The old three-argument signature is gone: one function, no ambiguity for named-argument callers.
reset role;
select is((select count(*)::int from pg_proc where oid::regprocedure::text like 'request_join(%' or proname = 'request_join'), 1,
  'exactly one request_join exists');

select * from finish();
rollback;
