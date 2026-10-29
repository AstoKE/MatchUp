-- Phase 3 / M4: participation. request_join, cancel_participation, approve / reject / waitlist /
-- remove_participant and list_event_requests, plus the organizer's auto-approve option (events.auto_approve,
-- default off; PRD §4.3, ADR-0020). The event input gains one optional key, `auto_approve`, so installed
-- apps keep working (ADR-0019 decision 3): create_event, update_event and parse_event_input are redefined
-- below with exactly that addition. Nothing else about them changes.

alter table public.events add column auto_approve boolean not null default false;
comment on column public.events.auto_approve is
  'When true a join request is approved at once if a spot is free and nobody is waiting; otherwise the organizer decides.';
alter type private.event_input add attribute auto_approve boolean;

create or replace function private.parse_event_input(p jsonb)
returns private.event_input
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r     private.event_input;
  v_min smallint;
  v_max smallint;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    r.sport_id               := (p ->> 'sport_id')::uuid;
    r.sport_format_id        := (p ->> 'sport_format_id')::uuid;
    r.title                  := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(p ->> 'title'), '\s+', ' ', 'g'), '');
    r.description            := nullif(pg_catalog.btrim(p ->> 'description'), '');
    r.visibility             := coalesce(p ->> 'visibility', 'PUBLIC')::public.event_visibility;
    r.starts_at              := (p ->> 'starts_at')::timestamptz;
    r.duration_minutes       := (p ->> 'duration_minutes')::smallint;
    r.registration_closes_at := (p ->> 'registration_closes_at')::timestamptz;
    r.city_id                := (p ->> 'city_id')::uuid;
    r.district_id            := (p ->> 'district_id')::uuid;
    r.location_visibility    := coalesce(p ->> 'location_visibility', 'PUBLIC')::public.location_visibility;
    r.location_label         := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(p ->> 'location_label'), '\s+', ' ', 'g'), '');
    r.address_text           := nullif(pg_catalog.btrim(p ->> 'address_text'), '');
    r.participant_notes      := nullif(pg_catalog.btrim(p ->> 'participant_notes'), '');
    r.capacity               := (p ->> 'capacity')::smallint;
    r.waitlist_enabled       := coalesce((p ->> 'waitlist_enabled')::boolean, true);
    r.auto_approve           := coalesce((p ->> 'auto_approve')::boolean, false);
    r.organizer_plays        := coalesce((p ->> 'organizer_plays')::boolean, true);
    r.skill_min              := (p ->> 'skill_min')::numeric;
    r.skill_max              := (p ->> 'skill_max')::numeric;
    r.booking_status         := coalesce(p ->> 'booking_status', 'NOT_REQUIRED')::public.booking_status;
    r.cost_amount_minor      := (p ->> 'cost_amount_minor')::integer;
    r.cost_note              := nullif(pg_catalog.btrim(p ->> 'cost_note'), '');
    r.equipment_note         := nullif(pg_catalog.btrim(p ->> 'equipment_note'), '');
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;

  if r.sport_id is null or r.sport_format_id is null or r.title is null or r.starts_at is null
     or r.duration_minutes is null or r.city_id is null or r.district_id is null
     or r.location_label is null or r.capacity is null
     or char_length(r.title) not between 3 and 80
     or coalesce(char_length(r.description), 0) > 2000
     or r.duration_minutes not between 15 and 480
     or r.starts_at > pg_catalog.now() + interval '1 year'
     or (r.registration_closes_at is not null and r.registration_closes_at > r.starts_at)
     or char_length(r.location_label) not between 3 and 120
     or coalesce(char_length(r.address_text), 0) > 300
     or coalesce(char_length(r.participant_notes), 0) > 1000
     or coalesce(char_length(r.cost_note), 0) > 200
     or coalesce(char_length(r.equipment_note), 0) > 500
     or (r.cost_amount_minor is not null and r.cost_amount_minor not between 0 and 10000000)
     or (r.skill_min is not null and (r.skill_min not between 1.0 and 5.0 or r.skill_min * 2 <> trunc(r.skill_min * 2)))
     or (r.skill_max is not null and (r.skill_max not between 1.0 and 5.0 or r.skill_max * 2 <> trunc(r.skill_max * 2)))
     or (r.skill_min is not null and r.skill_max is not null and r.skill_min > r.skill_max) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  select f.min_participants, f.max_participants into v_min, v_max
    from public.sport_formats f join public.sports s on s.id = f.sport_id
   where f.id = r.sport_format_id and f.sport_id = r.sport_id and f.is_active and s.is_active;
  if not found or r.capacity not between v_min and v_max then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.districts d join public.cities c on c.id = d.city_id
                  where d.id = r.district_id and d.city_id = r.city_id and d.is_active and c.is_active) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return r;
end;
$$;

create or replace function public.create_event(p_client_request_id uuid, p_input jsonb, p_publish boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  r     private.event_input;
  v_id  uuid;
begin
  if p_client_request_id is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.lock_organizer(v_uid);
  select e.id into v_id from public.events e
   where e.organizer_id = v_uid and e.client_request_id = p_client_request_id;
  if found then
    return v_id;
  end if;

  r := private.parse_event_input(p_input);
  if (select count(*) from public.events x
       where x.organizer_id = v_uid and x.created_at > pg_catalog.now() - interval '24 hours')
     >= private.config_int('quota.max_events_created_per_day', 10) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.events (
    organizer_id, client_request_id, sport_id, sport_format_id, title, description, visibility, invite_token,
    starts_at, duration_minutes, ends_at, registration_closes_at, city_id, district_id, location_visibility,
    public_location_label, capacity, waitlist_enabled, auto_approve, organizer_plays, skill_min, skill_max, booking_status,
    cost_amount_minor, cost_note, equipment_note)
  values (
    v_uid, p_client_request_id, r.sport_id, r.sport_format_id, r.title, r.description, r.visibility,
    case when r.visibility = 'INVITE_ONLY' then private.new_invite_token() end,
    r.starts_at, r.duration_minutes, r.starts_at, r.registration_closes_at, r.city_id, r.district_id,
    r.location_visibility, case when r.location_visibility = 'PUBLIC' then r.location_label end,
    r.capacity, r.waitlist_enabled, r.auto_approve, r.organizer_plays, r.skill_min, r.skill_max, r.booking_status,
    r.cost_amount_minor, r.cost_note, r.equipment_note)
  returning id into v_id;
  insert into public.event_private_details (event_id, location_label, address_text, participant_notes)
  values (v_id, r.location_label, r.address_text, r.participant_notes);

  if p_publish then
    perform private.publish_event_row(v_uid, v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.update_event(p_event_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.assert_onboarded_user();
  e          public.events;
  d          public.event_private_details;
  r          private.event_input;
  v_material boolean;
  v_now      timestamptz := pg_catalog.now();
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status not in ('DRAFT', 'PUBLISHED') or (e.status = 'PUBLISHED' and v_now >= e.starts_at) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  select * into d from public.event_private_details where event_id = e.id;

  r := private.parse_event_input(
         to_jsonb(e)
         || jsonb_build_object('location_label', d.location_label, 'address_text', d.address_text,
                               'participant_notes', d.participant_notes)
         || p_input);

  if e.status = 'PUBLISHED' then
    if r.sport_id <> e.sport_id or r.sport_format_id <> e.sport_format_id or r.organizer_plays <> e.organizer_plays then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-7
    end if;
    if r.starts_at <> e.starts_at
       and r.starts_at < v_now + pg_catalog.make_interval(mins => private.config_int('event.min_lead_minutes', 60)) then
      raise exception 'START_TOO_SOON' using errcode = 'P0001';
    end if;
  end if;
  if r.capacity < e.approved_count then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';  -- I-6
  end if;

  v_material := e.status = 'PUBLISHED' and (
       r.starts_at <> e.starts_at or r.duration_minutes <> e.duration_minutes or r.district_id <> e.district_id
    or r.location_label <> d.location_label or r.address_text is distinct from d.address_text);

  update public.events set
    sport_id = r.sport_id, sport_format_id = r.sport_format_id, title = r.title, description = r.description,
    visibility = r.visibility,
    invite_token = case when r.visibility = 'INVITE_ONLY' then coalesce(e.invite_token, private.new_invite_token()) end,
    starts_at = r.starts_at, duration_minutes = r.duration_minutes,
    registration_closes_at = r.registration_closes_at, city_id = r.city_id, district_id = r.district_id,
    location_visibility = r.location_visibility,
    public_location_label = case when r.location_visibility = 'PUBLIC' then r.location_label end,
    capacity = r.capacity, waitlist_enabled = r.waitlist_enabled, auto_approve = r.auto_approve,
    organizer_plays = r.organizer_plays,
    skill_min = r.skill_min, skill_max = r.skill_max, booking_status = r.booking_status,
    cost_amount_minor = r.cost_amount_minor, cost_note = r.cost_note, equipment_note = r.equipment_note,
    last_material_change_at = case when v_material then v_now else e.last_material_change_at end
  where id = e.id;
  update public.event_private_details set
    location_label = r.location_label, address_text = r.address_text, participant_notes = r.participant_notes,
    updated_at = v_now
  where event_id = e.id;

  if v_material then
    perform private.notify(p.user_id, 'EVENT_CHANGED', jsonb_build_object('event_id', e.id),
                           'EVENT_CHANGED:' || e.id || ':' || p.user_id || ':' || extract(epoch from v_now))
       from public.event_participations p
      where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED');
  end if;
end;
$$;

-- ---- participation (M4) --------------------------------------------------------------------------------
-- Every capacity-changing path takes the event row lock first (DATABASE §8); the trigger from M1 stays the
-- safety net. Results never reveal why someone was refused beyond the stable error code.

-- Serializes one player's requests so the open-request quota cannot be raced.
create function private.lock_requester(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('requester:' || p_uid::text, 0));
$$;
revoke all on function private.lock_requester(uuid) from public, anon, authenticated;

-- Loads and locks the event of a participation for an organizer action; the participation is re-read
-- under that lock, so two organizer actions on the same event serialize.
create function private.lock_participation_for_organizer(p_uid uuid, p_participation uuid)
returns table (event_row public.events, part_row public.event_participations)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  select p.event_id into v_event from public.event_participations p where p.id = p_participation;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into event_row from public.events e where e.id = v_event for update;
  if event_row.organizer_id <> p_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';  -- not theirs: indistinguishable from missing
  end if;
  select * into part_row from public.event_participations p where p.id = p_participation for update;
  if part_row.is_organizer then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-7
  end if;
  if event_row.status <> 'PUBLISHED' or pg_catalog.now() >= event_row.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  return next;
end;
$$;
revoke all on function private.lock_participation_for_organizer(uuid, uuid) from public, anon, authenticated;

-- The player asks to join. Returns the resulting status: REQUESTED, APPROVED (auto-approve events with a
-- free spot and nobody waiting) or WAITLISTED (full event with a waitlist). Idempotent for open requests.
create function public.request_join(p_event_id uuid, p_message text default null, p_position_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  e         public.events;
  p         public.event_participations;
  v_message text := nullif(pg_catalog.btrim(p_message), '');
  v_count   smallint := 1;
  v_status  public.participation_status;
  v_now     timestamptz := pg_catalog.now();
begin
  if coalesce(char_length(v_message), 0) > 280 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.lock_requester(v_uid);
  select * into e from public.events x where x.id = p_event_id for update;
  -- Drafts do not exist for players; invite-only events need the invite flow (not built yet).
  if not found or e.status = 'DRAFT' or e.visibility <> 'PUBLIC' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.organizer_id = v_uid then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';  -- I-5
  end if;
  if e.status <> 'PUBLISHED' or v_now >= e.starts_at
     or (e.registration_closes_at is not null and v_now >= e.registration_closes_at) then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;
  if p_position_id is not null and not exists (
       select 1 from public.sport_positions sp where sp.id = p_position_id and sp.sport_id = e.sport_id) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  select * into p from public.event_participations x where x.event_id = e.id and x.user_id = v_uid for update;
  if found then
    if p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED') then
      return p.status::text;  -- idempotent
    end if;
    if p.status in ('REJECTED', 'REMOVED') then
      raise exception 'NOT_ALLOWED' using errcode = 'P0001';  -- terminal for this event
    end if;
    if p.request_count >= 3 then
      raise exception 'REQUEST_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    v_count := p.request_count + 1;
  end if;

  if (select pg_catalog.count(*) from public.event_participations q
        join public.events qe on qe.id = q.event_id
       where q.user_id = v_uid and q.status in ('REQUESTED', 'WAITLISTED')
         and qe.status = 'PUBLISHED' and qe.starts_at > v_now)
     >= private.config_int('quota.max_open_requests', 20) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  if e.approved_count >= e.capacity then
    if not e.waitlist_enabled then
      raise exception 'EVENT_FULL' using errcode = 'P0001';
    end if;
    v_status := 'WAITLISTED';
  else
    v_status := 'REQUESTED';
  end if;

  if p.id is null then
    insert into public.event_participations (event_id, user_id, status, request_message, preferred_position_id,
                                             request_count, waitlisted_at)
    values (e.id, v_uid, v_status, v_message, p_position_id, v_count,
            case when v_status = 'WAITLISTED' then v_now end)
    returning * into p;
  else
    update public.event_participations set
      status = v_status, request_message = v_message, preferred_position_id = p_position_id,
      request_count = v_count, requested_at = v_now, canceled_at = null, decided_at = null, decided_by = null,
      approved_at = null, status_reason = null, cancellation_excused = false,
      waitlisted_at = case when v_status = 'WAITLISTED' then v_now end
    where id = p.id
    returning * into p;
  end if;

  -- Auto-approve: only with a free spot and nobody waiting (the waitlist is served by the organizer).
  if v_status = 'REQUESTED' and e.auto_approve and not exists (
       select 1 from public.event_participations w where w.event_id = e.id and w.status = 'WAITLISTED') then
    update public.event_participations
       set status = 'APPROVED', approved_at = v_now, decided_at = v_now
     where id = p.id
     returning * into p;
    v_status := 'APPROVED';
  end if;

  perform private.notify(e.organizer_id, 'JOIN_REQUESTED',
                         pg_catalog.jsonb_build_object('event_id', e.id, 'participation_id', p.id, 'status', v_status),
                         'JOIN_REQUESTED:' || p.id || ':' || v_count);
  return v_status::text;
end;
$$;

-- The player withdraws (any time before the start). Freeing an approved spot tells the organizer; when
-- people are waiting that is the prompt to promote someone: promotion itself is never automatic.
create function public.cancel_participation(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
  p     public.event_participations;
  v_now timestamptz := pg_catalog.now();
begin
  select * into e from public.events x where x.id = p_event_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into p from public.event_participations x where x.event_id = e.id and x.user_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p.is_organizer then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';  -- I-7
  end if;
  if p.status = 'CANCELED' then
    return;  -- idempotent
  end if;
  if p.status not in ('REQUESTED', 'WAITLISTED', 'APPROVED') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if e.status <> 'PUBLISHED' or v_now >= e.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update public.event_participations set
    status = 'CANCELED', canceled_at = v_now, waitlisted_at = null,
    -- A withdrawal within 24 h of a time/place change carries no reliability consequence (PRD §4.3).
    cancellation_excused = (e.last_material_change_at is not null
                            and v_now < e.last_material_change_at + interval '24 hours')
  where id = p.id;

  if p.status = 'APPROVED' then
    perform private.notify(e.organizer_id, 'PARTICIPANT_CANCELED',
                           pg_catalog.jsonb_build_object('event_id', e.id, 'participation_id', p.id),
                           'PARTICIPANT_CANCELED:' || p.id || ':' || p.request_count);
    if exists (select 1 from public.event_participations w where w.event_id = e.id and w.status = 'WAITLISTED') then
      perform private.notify(e.organizer_id, 'SPOT_OPENED', pg_catalog.jsonb_build_object('event_id', e.id),
                             'SPOT_OPENED:' || e.id || ':' || p.id || ':' || p.request_count);
    end if;
  end if;
end;
$$;

create function public.approve_participation(p_participation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
  p     public.event_participations;
  v_lock record;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_lock from private.lock_participation_for_organizer(v_uid, p_participation_id);
  e := v_lock.event_row;
  p := v_lock.part_row;
  if p.status = 'APPROVED' then
    return;  -- idempotent
  end if;
  if p.status not in ('REQUESTED', 'WAITLISTED') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if e.approved_count >= e.capacity then
    raise exception 'EVENT_FULL' using errcode = 'P0001';
  end if;
  update public.event_participations
     set status = 'APPROVED', approved_at = v_now, decided_at = v_now, decided_by = v_uid, waitlisted_at = null
   where id = p.id;
  perform private.notify(p.user_id, 'REQUEST_APPROVED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'REQUEST_APPROVED:' || p.id || ':' || p.request_count);
end;
$$;

create function public.reject_participation(p_participation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
  p     public.event_participations;
  v_lock record;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_lock from private.lock_participation_for_organizer(v_uid, p_participation_id);
  e := v_lock.event_row;
  p := v_lock.part_row;
  if p.status = 'REJECTED' then
    return;  -- idempotent
  end if;
  if p.status not in ('REQUESTED', 'WAITLISTED') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.event_participations
     set status = 'REJECTED', decided_at = v_now, decided_by = v_uid, waitlisted_at = null
   where id = p.id;
  perform private.notify(p.user_id, 'REQUEST_REJECTED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'REQUEST_REJECTED:' || p.id || ':' || p.request_count);
end;
$$;

create function public.waitlist_participation(p_participation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
  p     public.event_participations;
  v_lock record;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_lock from private.lock_participation_for_organizer(v_uid, p_participation_id);
  e := v_lock.event_row;
  p := v_lock.part_row;
  if p.status = 'WAITLISTED' then
    return;  -- idempotent
  end if;
  if p.status <> 'REQUESTED' or not e.waitlist_enabled then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.event_participations
     set status = 'WAITLISTED', waitlisted_at = v_now, decided_at = v_now, decided_by = v_uid
   where id = p.id;
  perform private.notify(p.user_id, 'REQUEST_WAITLISTED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'REQUEST_WAITLISTED:' || p.id || ':' || p.request_count);
end;
$$;

-- Removing an approved player is final for that event (REMOVED is terminal) and only possible before the start.
create function public.remove_participant(p_participation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  e        public.events;
  p        public.event_participations;
  v_lock   record;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_now    timestamptz := pg_catalog.now();
begin
  if coalesce(char_length(v_reason), 0) > 280 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into v_lock from private.lock_participation_for_organizer(v_uid, p_participation_id);
  e := v_lock.event_row;
  p := v_lock.part_row;
  if p.status = 'REMOVED' then
    return;  -- idempotent
  end if;
  if p.status <> 'APPROVED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.event_participations
     set status = 'REMOVED', decided_at = v_now, decided_by = v_uid, status_reason = v_reason
   where id = p.id;
  perform private.notify(p.user_id, 'PARTICIPANT_REMOVED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'PARTICIPANT_REMOVED:' || p.id || ':' || p.request_count);
end;
$$;

-- The organizer's queue: open requests first (oldest first), then the waitlist (FIFO), then approved players.
-- What the organizer is told to expect (USER_FLOWS FL-2): display name and self-assessed level. Capped at 200.
create function public.list_event_requests(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e     public.events;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into e from public.events x where x.id = p_event_id;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(r.item order by r.ord, r.at)
      from (
        select case p.status when 'REQUESTED' then 1 when 'WAITLISTED' then 2 else 3 end as ord,
               coalesce(p.waitlisted_at, p.approved_at, p.requested_at) as at,
               pg_catalog.jsonb_build_object(
                 'id', p.id,
                 'status', p.status,
                 'display_name', pr.display_name,
                 'level', usp.self_assessed_level,
                 'message', p.request_message,
                 'position_id', p.preferred_position_id,
                 'requested_at', p.requested_at,
                 'request_count', p.request_count) as item
          from public.event_participations p
          join public.profiles pr on pr.id = p.user_id
          left join public.user_sport_profiles usp on usp.user_id = p.user_id and usp.sport_id = e.sport_id
         where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED')
         order by 1, 2
         limit 200
      ) r), '[]'::jsonb));
end;
$$;

revoke all on function public.request_join(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_participation(uuid) from public, anon, authenticated;
revoke all on function public.approve_participation(uuid) from public, anon, authenticated;
revoke all on function public.reject_participation(uuid) from public, anon, authenticated;
revoke all on function public.waitlist_participation(uuid) from public, anon, authenticated;
revoke all on function public.remove_participant(uuid, text) from public, anon, authenticated;
revoke all on function public.list_event_requests(uuid) from public, anon, authenticated;
grant execute on function public.request_join(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_participation(uuid) to authenticated;
grant execute on function public.approve_participation(uuid) to authenticated;
grant execute on function public.reject_participation(uuid) to authenticated;
grant execute on function public.waitlist_participation(uuid) to authenticated;
grant execute on function public.remove_participant(uuid, text) to authenticated;
grant execute on function public.list_event_requests(uuid) to authenticated;
