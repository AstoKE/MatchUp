-- Phase 3 / M1: event core. Events, their private details, participations (one row per user per event)
-- and the in-app notification inbox; organizer RPCs (create/update/publish/cancel/complete/delete draft);
-- lifecycle + transition guards and the capacity safety net as triggers (DATABASE §3.4, §6, §7, §8).
-- Location has no coordinates in Phase 3 (ADR-0019): district is public, the place label is public only
-- for location_visibility = PUBLIC, label + address always live in event_private_details.
-- Participation RPCs (request/approve/…) are M4; discovery RPCs are M3.

-- ---- enums ------------------------------------------------------------------------------------------------
create type public.event_type as enum ('COMMUNITY', 'PARTNER');
create type public.event_status as enum ('DRAFT', 'PUBLISHED', 'CANCELED', 'COMPLETED');
create type public.event_visibility as enum ('PUBLIC', 'INVITE_ONLY');
create type public.location_visibility as enum ('PUBLIC', 'APPROVED_ONLY');
create type public.booking_status as enum ('NOT_REQUIRED', 'NOT_YET_BOOKED', 'BOOKED_EXTERNALLY', 'TO_BE_CONFIRMED');
create type public.event_cancel_reason as enum (
  'WEATHER', 'VENUE_UNAVAILABLE', 'NOT_ENOUGH_PLAYERS', 'ORGANIZER_UNAVAILABLE', 'OTHER');
create type public.participation_status as enum (
  'REQUESTED', 'APPROVED', 'REJECTED', 'WAITLISTED', 'CANCELED', 'REMOVED');
create type public.attendance_status as enum ('NOT_CONFIRMED', 'PRESENT', 'ABSENT', 'DISPUTED');

-- A format must belong to the event's sport: composite FK target.
alter table public.sport_formats add constraint sport_formats_id_sport_key unique (id, sport_id);

-- ---- config (ADR-0019) ----------------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('event.min_lead_minutes',              '60'::jsonb),
  ('quota.max_upcoming_published_events', '5'::jsonb),
  ('quota.max_events_created_per_day',    '10'::jsonb),
  ('quota.max_open_requests',             '20'::jsonb)
on conflict (key) do nothing;

create function private.config_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value #>> '{}')::integer from public.app_config c where c.key = p_key), p_default);
$$;
revoke all on function private.config_int(text, integer) from public, anon, authenticated;

-- ---- events ---------------------------------------------------------------------------------------------
-- Everything on this table is readable by guests for PUBLISHED + PUBLIC rows: no private column here.
create table public.events (
  id                      uuid primary key default gen_random_uuid(),
  organizer_id            uuid not null references public.profiles (id),
  client_request_id       uuid not null,
  event_type              public.event_type not null default 'COMMUNITY' check (event_type = 'COMMUNITY'),
  sport_id                uuid not null references public.sports (id),
  sport_format_id         uuid not null,
  title                   text not null check (char_length(title) between 3 and 80),
  description             text check (description is null or char_length(description) between 1 and 2000),
  status                  public.event_status not null default 'DRAFT',
  visibility              public.event_visibility not null default 'PUBLIC',
  invite_token            text unique check (invite_token is null or invite_token ~ '^[A-Za-z0-9_-]{22,64}$'),
  starts_at               timestamptz not null,
  duration_minutes        smallint not null check (duration_minutes between 15 and 480),
  ends_at                 timestamptz not null,
  registration_closes_at  timestamptz,
  city_id                 uuid not null,
  district_id             uuid not null,
  location_visibility     public.location_visibility not null default 'PUBLIC',
  public_location_label   text check (public_location_label is null or char_length(public_location_label) between 3 and 120),
  capacity                smallint not null check (capacity between 2 and 500),
  approved_count          smallint not null default 0,
  waitlist_enabled        boolean not null default true,
  organizer_plays         boolean not null default true,
  skill_min               numeric(2, 1),
  skill_max               numeric(2, 1),
  booking_status          public.booking_status not null default 'NOT_REQUIRED',
  cost_amount_minor       integer check (cost_amount_minor is null or cost_amount_minor between 0 and 10000000),
  cost_currency           char(3) not null default 'TRY' check (cost_currency = 'TRY'),
  cost_note               text check (cost_note is null or char_length(cost_note) between 1 and 200),
  equipment_note          text check (equipment_note is null or char_length(equipment_note) between 1 and 500),
  published_at            timestamptz,
  canceled_at             timestamptz,
  cancel_reason           public.event_cancel_reason,
  cancel_message          text check (cancel_message is null or char_length(cancel_message) between 1 and 500),
  completed_at            timestamptz,
  last_material_change_at timestamptz,
  created_at              timestamptz not null default pg_catalog.now(),
  updated_at              timestamptz not null default pg_catalog.now(),
  unique (organizer_id, client_request_id),
  foreign key (sport_format_id, sport_id) references public.sport_formats (id, sport_id),
  foreign key (district_id, city_id) references public.districts (id, city_id),
  constraint events_approved_within_capacity check (approved_count between 0 and capacity),
  constraint events_invite_token check ((visibility = 'INVITE_ONLY') = (invite_token is not null)),
  constraint events_public_label check ((location_visibility = 'PUBLIC') = (public_location_label is not null)),
  constraint events_registration_close check (registration_closes_at is null or registration_closes_at <= starts_at),
  constraint events_ends_at check (ends_at = starts_at + pg_catalog.make_interval(mins => duration_minutes)),
  constraint events_skill_range check (
    (skill_min is null or (skill_min between 1.0 and 5.0 and skill_min * 2 = trunc(skill_min * 2)))
    and (skill_max is null or (skill_max between 1.0 and 5.0 and skill_max * 2 = trunc(skill_max * 2)))
    and (skill_min is null or skill_max is null or skill_min <= skill_max)),
  constraint events_published_at check ((status = 'DRAFT') = (published_at is null)),
  constraint events_canceled check ((status = 'CANCELED') = (canceled_at is not null and cancel_reason is not null)),
  constraint events_completed check ((status = 'COMPLETED') = (completed_at is not null))
);
comment on table public.events is 'Events (lifecycle DRAFT/PUBLISHED/CANCELED/COMPLETED only). Public columns only; private data in event_private_details.';

create index events_discovery_idx on public.events (city_id, starts_at, id)
  where status = 'PUBLISHED' and visibility = 'PUBLIC';
create index events_sport_idx on public.events (sport_id, starts_at) where status = 'PUBLISHED';
create index events_organizer_idx on public.events (organizer_id, starts_at desc);
create index events_status_ends_idx on public.events (status, ends_at);
create index events_district_idx on public.events (district_id);
create index events_format_idx on public.events (sport_format_id);

-- Readable only by the organizer, APPROVED participants and admins (RLS cannot mask columns per row).
create table public.event_private_details (
  event_id          uuid primary key references public.events (id) on delete cascade,
  location_label    text not null check (char_length(location_label) between 3 and 120),
  address_text      text check (address_text is null or char_length(address_text) between 1 and 300),
  participant_notes text check (participant_notes is null or char_length(participant_notes) between 1 and 1000),
  updated_at        timestamptz not null default pg_catalog.now()
);

-- One row per user per event: request, waitlist, approval and (Phase 5) attendance live here.
create table public.event_participations (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events (id) on delete cascade,
  user_id               uuid not null references public.profiles (id),
  status                public.participation_status not null,
  attendance            public.attendance_status not null default 'NOT_CONFIRMED',
  is_organizer          boolean not null default false,
  request_message       text check (request_message is null or char_length(request_message) between 1 and 280),
  preferred_position_id uuid references public.sport_positions (id),
  request_count         smallint not null default 1 check (request_count between 1 and 3),
  requested_at          timestamptz not null default pg_catalog.now(),
  waitlisted_at         timestamptz,
  decided_at            timestamptz,
  decided_by            uuid,
  approved_at           timestamptz,
  canceled_at           timestamptz,
  cancellation_excused  boolean not null default false,
  status_reason         text check (status_reason is null or char_length(status_reason) between 1 and 280),
  created_at            timestamptz not null default pg_catalog.now(),
  updated_at            timestamptz not null default pg_catalog.now(),
  unique (event_id, user_id),
  constraint participation_attendance_needs_approved check (attendance = 'NOT_CONFIRMED' or status = 'APPROVED'),
  constraint participation_waitlisted_at check (status <> 'WAITLISTED' or waitlisted_at is not null),
  constraint participation_approved_at check (status <> 'APPROVED' or approved_at is not null)
);
create index event_participations_user_idx on public.event_participations (user_id, status, event_id);
create index event_participations_queue_idx on public.event_participations (event_id, status, waitlisted_at);

-- In-app inbox. Payload carries ids and template keys only, never names or free text (SECURITY §6).
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in (
               'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
               'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
               'EVENT_CANCELED', 'EVENT_CHANGED')),
  payload    jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  read_at    timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---- helper predicates for RLS (STABLE SECURITY DEFINER: no policy recursion) ------------------------
create function private.is_event_organizer(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event and e.organizer_id = (select auth.uid()));
$$;

create function private.is_event_participant(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.event_participations p
                  where p.event_id = p_event and p.user_id = (select auth.uid()));
$$;

create function private.is_approved_participant(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.event_participations p
                  where p.event_id = p_event and p.user_id = (select auth.uid()) and p.status = 'APPROVED');
$$;

revoke all on function private.is_event_organizer(uuid) from public, anon, authenticated;
revoke all on function private.is_event_participant(uuid) from public, anon, authenticated;
revoke all on function private.is_approved_participant(uuid) from public, anon, authenticated;
grant execute on function private.is_event_organizer(uuid) to authenticated;
grant execute on function private.is_event_participant(uuid) to authenticated;
grant execute on function private.is_approved_participant(uuid) to authenticated;

-- ---- RLS ----------------------------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_private_details enable row level security;
alter table public.event_participations enable row level security;
alter table public.notifications enable row level security;

grant select on public.events to anon, authenticated;
grant select on public.event_private_details, public.event_participations, public.notifications to authenticated;

create policy events_select_public on public.events for select to anon, authenticated
  using (status = 'PUBLISHED' and visibility = 'PUBLIC');
create policy events_select_involved on public.events for select to authenticated
  using (organizer_id = (select auth.uid()) or private.is_event_participant(id) or private.is_admin());

create policy event_private_details_select on public.event_private_details for select to authenticated
  using (private.is_event_organizer(event_id) or private.is_approved_participant(event_id) or private.is_admin());

create policy event_participations_select on public.event_participations for select to authenticated
  using (user_id = (select auth.uid()) or private.is_event_organizer(event_id) or private.is_admin());

create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- ---- triggers: lifecycle, immutability, transitions, capacity ----------------------------------------
create function private.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ends_at := new.starts_at + pg_catalog.make_interval(mins => new.duration_minutes::integer);
  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
    if old.status in ('CANCELED', 'COMPLETED') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- terminal and frozen (I-7)
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'DRAFT' and new.status = 'PUBLISHED')
      or (old.status = 'PUBLISHED' and new.status in ('CANCELED', 'COMPLETED'))) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-3
    end if;
    if new.organizer_id <> old.organizer_id or new.client_request_id <> old.client_request_id
       or new.event_type <> old.event_type or new.created_at <> old.created_at then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
    if old.status <> 'DRAFT' and (new.sport_id <> old.sport_id or new.sport_format_id <> old.sport_format_id
                                  or new.organizer_plays <> old.organizer_plays) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-7
    end if;
  end if;
  return new;
end;
$$;
create trigger events_before_write before insert or update on public.events
  for each row execute function private.events_before_write();

create function private.participations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not (new.status in ('REQUESTED', 'WAITLISTED') or (new.status = 'APPROVED' and new.is_organizer)) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.updated_at := pg_catalog.now();
  if new.event_id <> old.event_id or new.user_id <> old.user_id or new.is_organizer <> old.is_organizer then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    -- The organizer's own row cannot be canceled/removed through participant paths (I-7).
    if old.is_organizer or not (
         (old.status = 'REQUESTED'  and new.status in ('APPROVED', 'REJECTED', 'WAITLISTED', 'CANCELED'))
      or (old.status = 'WAITLISTED' and new.status in ('APPROVED', 'REJECTED', 'CANCELED'))
      or (old.status = 'APPROVED'   and new.status in ('CANCELED', 'REMOVED'))
      or (old.status = 'CANCELED'   and new.status in ('REQUESTED', 'WAITLISTED'))) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-3
    end if;
  end if;
  return new;
end;
$$;
create trigger participations_before_write before insert or update on public.event_participations
  for each row execute function private.participations_before_write();

-- Safety net (DATABASE §8): whatever code path changes participations, approved_count is recomputed
-- under the event row lock and can never exceed capacity (I-1).
create function private.participations_sync_approved_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    uuid := coalesce(new.event_id, old.event_id);
  v_capacity smallint;
  v_count    integer;
begin
  select e.capacity into v_capacity from public.events e where e.id = v_event for update;
  if not found then
    return null;  -- the event itself is being deleted (draft cascade)
  end if;
  select count(*) into v_count from public.event_participations p
   where p.event_id = v_event and p.status = 'APPROVED';
  if v_count > v_capacity then
    raise exception 'EVENT_FULL' using errcode = 'P0001';
  end if;
  update public.events set approved_count = v_count where id = v_event and approved_count <> v_count;
  return null;
end;
$$;
revoke all on function private.participations_sync_approved_count() from public, anon, authenticated;
create trigger participations_sync_approved_count
  after insert or delete or update of status on public.event_participations
  for each row execute function private.participations_sync_approved_count();

revoke all on function private.events_before_write() from public, anon, authenticated;
revoke all on function private.participations_before_write() from public, anon, authenticated;

-- ---- notifications ---------------------------------------------------------------------------------------
create function private.notify(p_user uuid, p_type text, p_payload jsonb, p_dedupe text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload, dedupe_key)
  values (p_user, p_type, p_payload, p_dedupe)
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function private.notify(uuid, text, jsonb, text) from public, anon, authenticated;

-- Marks the caller's notifications read: the given ids, or all of them when p_ids is null.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  update public.notifications n
     set read_at = pg_catalog.now()
   where n.user_id = v_uid and n.read_at is null and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---- input validation (ADR-0019: one jsonb input, one validator) ------------------------------------------
create type private.event_input as (
  sport_id               uuid,
  sport_format_id        uuid,
  title                  text,
  description            text,
  visibility             public.event_visibility,
  starts_at              timestamptz,
  duration_minutes       smallint,
  registration_closes_at timestamptz,
  city_id                uuid,
  district_id            uuid,
  location_visibility    public.location_visibility,
  location_label         text,
  address_text           text,
  participant_notes      text,
  capacity               smallint,
  waitlist_enabled       boolean,
  organizer_plays        boolean,
  skill_min              numeric,
  skill_max              numeric,
  booking_status         public.booking_status,
  cost_amount_minor      integer,
  cost_note              text,
  equipment_note         text
);

-- Unknown keys are ignored (forward compatible); anything malformed or out of bounds is VALIDATION_FAILED.
create function private.parse_event_input(p jsonb)
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
revoke all on function private.parse_event_input(jsonb) from public, anon, authenticated;

create function private.new_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
      || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
$$;
revoke all on function private.new_invite_token() from public, anon, authenticated;

-- Serializes one organizer's create/publish calls: idempotency and quotas cannot race.
create function private.lock_organizer(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organizer:' || p_uid::text, 0));
$$;
revoke all on function private.lock_organizer(uuid) from public, anon, authenticated;

-- DRAFT → PUBLISHED with the lead-time and upcoming-events guards; seats the organizer when they play.
create function private.publish_event_row(p_uid uuid, p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if e.status <> 'DRAFT' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if e.starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => private.config_int('event.min_lead_minutes', 60)) then
    raise exception 'START_TOO_SOON' using errcode = 'P0001';
  end if;
  if (select count(*) from public.events x
       where x.organizer_id = p_uid and x.status = 'PUBLISHED' and x.starts_at > pg_catalog.now())
     >= private.config_int('quota.max_upcoming_published_events', 5) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  update public.events set status = 'PUBLISHED', published_at = pg_catalog.now() where id = p_event;
  if e.organizer_plays then
    insert into public.event_participations (event_id, user_id, status, is_organizer, approved_at, decided_at, decided_by)
    values (p_event, p_uid, 'APPROVED', true, pg_catalog.now(), pg_catalog.now(), p_uid);
  end if;
end;
$$;
revoke all on function private.publish_event_row(uuid, uuid) from public, anon, authenticated;

-- ---- organizer RPCs ----------------------------------------------------------------------------------------
-- Idempotent per (organizer, client_request_id): a retried request returns the first event's id.
create function public.create_event(p_client_request_id uuid, p_input jsonb, p_publish boolean default false)
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
    public_location_label, capacity, waitlist_enabled, organizer_plays, skill_min, skill_max, booking_status,
    cost_amount_minor, cost_note, equipment_note)
  values (
    v_uid, p_client_request_id, r.sport_id, r.sport_format_id, r.title, r.description, r.visibility,
    case when r.visibility = 'INVITE_ONLY' then private.new_invite_token() end,
    r.starts_at, r.duration_minutes, r.starts_at, r.registration_closes_at, r.city_id, r.district_id,
    r.location_visibility, case when r.location_visibility = 'PUBLIC' then r.location_label end,
    r.capacity, r.waitlist_enabled, r.organizer_plays, r.skill_min, r.skill_max, r.booking_status,
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

create function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  v_status public.event_status;
begin
  perform private.lock_organizer(v_uid);
  select e.status into v_status from public.events e where e.id = p_event_id and e.organizer_id = v_uid;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status = 'PUBLISHED' then
    return;  -- idempotent
  end if;
  perform private.publish_event_row(v_uid, p_event_id);
end;
$$;

-- Partial update: the input is merged over the stored event and the result re-validated as a whole.
-- Time/place changes on a published event are "material": participants are notified.
create function public.update_event(p_event_id uuid, p_input jsonb)
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
    capacity = r.capacity, waitlist_enabled = r.waitlist_enabled, organizer_plays = r.organizer_plays,
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

create function public.cancel_event(p_event_id uuid, p_reason text, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  e         public.events;
  v_reason  public.event_cancel_reason;
  v_message text := nullif(pg_catalog.btrim(p_message), '');
begin
  begin
    v_reason := p_reason::public.event_cancel_reason;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  if v_reason is null or coalesce(char_length(v_message), 0) > 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status = 'CANCELED' then
    return;  -- idempotent
  end if;
  if e.status <> 'PUBLISHED' or pg_catalog.now() >= e.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.events
     set status = 'CANCELED', canceled_at = pg_catalog.now(), cancel_reason = v_reason, cancel_message = v_message
   where id = e.id;
  -- Participation rows are not rewritten: their meaning follows the event status (DATABASE §6.2).
  perform private.notify(p.user_id, 'EVENT_CANCELED', jsonb_build_object('event_id', e.id),
                         'EVENT_CANCELED:' || e.id || ':' || p.user_id)
     from public.event_participations p
    where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED');
end;
$$;

create function public.complete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
begin
  select * into e from public.events where id = p_event_id for update;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status = 'COMPLETED' then
    return;  -- idempotent
  end if;
  if e.status <> 'PUBLISHED' or pg_catalog.now() < e.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.events set status = 'COMPLETED', completed_at = pg_catalog.now() where id = e.id;
end;
$$;

create function public.delete_draft(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  v_status public.event_status;
begin
  select e.status into v_status from public.events e where e.id = p_event_id and e.organizer_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  delete from public.events where id = p_event_id;
end;
$$;

revoke all on function public.create_event(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.publish_event(uuid) from public, anon, authenticated;
revoke all on function public.update_event(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_event(uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_event(uuid) from public, anon, authenticated;
revoke all on function public.delete_draft(uuid) from public, anon, authenticated;
grant execute on function public.create_event(uuid, jsonb, boolean) to authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
grant execute on function public.update_event(uuid, jsonb) to authenticated;
grant execute on function public.cancel_event(uuid, text, text) to authenticated;
grant execute on function public.complete_event(uuid) to authenticated;
grant execute on function public.delete_draft(uuid) to authenticated;

-- ---- account lifecycle hooks (ADR-0017): every per-user table is exported and purged -------------------
-- Per-phase helpers so later phases replace one small function instead of the whole export/purge.
create function private.export_event_data(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organized_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'description', e.description, 'status', e.status,
               'sport', s.slug, 'district', dt.slug, 'starts_at', e.starts_at,
               'duration_minutes', e.duration_minutes, 'capacity', e.capacity, 'visibility', e.visibility,
               'location_label', pd.location_label, 'address_text', pd.address_text,
               'participant_notes', pd.participant_notes, 'created_at', e.created_at,
               'published_at', e.published_at, 'canceled_at', e.canceled_at, 'completed_at', e.completed_at)
             order by e.created_at)
        from public.events e
        join public.sports s on s.id = e.sport_id
        join public.districts dt on dt.id = e.district_id
        left join public.event_private_details pd on pd.event_id = e.id
       where e.organizer_id = p_uid), '[]'::jsonb),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', p.event_id, 'status', p.status, 'attendance', p.attendance,
               'is_organizer', p.is_organizer, 'request_message', p.request_message,
               'requested_at', p.requested_at, 'approved_at', p.approved_at, 'canceled_at', p.canceled_at)
             order by p.requested_at)
        from public.event_participations p where p.user_id = p_uid), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;
revoke all on function private.export_event_data(uuid) from public, anon, authenticated;

-- Event history stays (other users' history and, from Phase 5, their ratings depend on it), linked to the
-- anonymous tombstone; the deleted user's own free text and private event details are removed.
create function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  update public.event_participations set request_message = null, status_reason = null
   where user_id = p_uid and (request_message is not null or status_reason is not null);
  delete from public.event_private_details d
   using public.events e
   where e.id = d.event_id and e.organizer_id = p_uid;
$$;
revoke all on function private.purge_event_data(uuid) from public, anon, authenticated;

create or replace function private.purge_account(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    public.account_status;
  v_requested timestamptz;
begin
  select p.account_status, p.deletion_requested_at into v_status, v_requested
    from public.profiles p where p.id = p_uid for update;
  if v_status is distinct from 'PENDING_DELETION'::public.account_status
     or v_requested > pg_catalog.now() - interval '30 days' then
    return false;
  end if;

  delete from public.user_sport_profiles where user_id = p_uid;  -- positions cascade
  delete from public.user_settings where user_id = p_uid;
  delete from public.platform_admins where user_id = p_uid;
  perform private.purge_event_data(p_uid);
  update public.profiles
     set display_name = null, avatar_path = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$$;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('export:' || v_uid::text, 0));
  if exists (
    select 1 from private.audit_logs a
     where a.actor_id = v_uid and a.action = 'DATA_EXPORTED'
       and a.created_at > pg_catalog.now() - interval '24 hours'
  ) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'format', 'account-export',
    'format_version', 2,
    'generated_at', pg_catalog.now(),
    'account', (
      select jsonb_build_object(
        'user_id', p.id, 'email', u.email, 'created_at', p.created_at,
        'account_status', p.account_status, 'deletion_requested_at', p.deletion_requested_at,
        'adult_confirmed_at', p.adult_confirmed_at, 'onboarded_at', p.onboarded_at)
      from public.profiles p left join auth.users u on u.id = p.id
      where p.id = v_uid),
    'profile', (
      select jsonb_build_object(
        'display_name', p.display_name, 'bio', p.bio, 'avatar_path', p.avatar_path,
        'city', c.slug, 'district', d.slug)
      from public.profiles p
      left join public.cities c on c.id = p.city_id
      left join public.districts d on d.id = p.district_id
      where p.id = v_uid),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = v_uid),
    'sport_profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', sp.slug,
               'self_assessed_level', usp.self_assessed_level,
               'self_assessed_at', usp.self_assessed_at,
               'positions', coalesce((
                 select jsonb_agg(pos.slug order by pos.slug)
                   from public.user_sport_positions x
                   join public.sport_positions pos on pos.id = x.position_id
                  where x.user_id = usp.user_id and x.sport_id = usp.sport_id), '[]'::jsonb))
             order by sp.slug)
        from public.user_sport_profiles usp
        join public.sports sp on sp.id = usp.sport_id
       where usp.user_id = v_uid), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', uc.kind, 'version', uc.version,
               'granted_at', uc.granted_at, 'revoked_at', uc.revoked_at)
             order by uc.granted_at, uc.kind)
        from public.user_consents uc where uc.user_id = v_uid), '[]'::jsonb),
    'admin', (select jsonb_build_object('granted_at', a.granted_at, 'revoked_at', a.revoked_at)
                from public.platform_admins a where a.user_id = v_uid)
  ) || private.export_event_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$$;
