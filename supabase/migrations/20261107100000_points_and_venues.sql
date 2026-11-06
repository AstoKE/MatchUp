-- Phase 4 / M3 and M4: a pin per event, distance in search, and the venue directory (docs/PHASE4_PLAN.md, ADR-0024).
--
-- Where an event is, and who may know it:
--   event_private_details.exact_point  the organizer's pin. Read only by the organizer, approved players and admins
--                                      (the table's RLS, and get_event's "inside" rule).
--   event_private_details.venue_id     the chosen venue. A venue is a place, so it is as private as the pin.
--   events.public_point                what everybody may see: the pin itself for PUBLIC locations, the centre of its
--                                      ~500 m grid cell for APPROVED_ONLY ones, the district's centre when there is no
--                                      pin. events.public_point_precision says which (EXACT / APPROXIMATE / DISTRICT).
-- Distances in search are measured from public_point, so they reveal nothing public_point does not.
--
-- Venues are read through search_venues only (the table is closed to the API roles: submitted_by stays private). A
-- suggestion is usable at once and shown as unverified; administrators at aal2 verify, hide or restore it.
create extension if not exists pg_trgm with schema extensions;

-- ---- helpers ------------------------------------------------------------------------------------------------------------
-- Turkish-folded, lower-case, single-spaced: the key for name search and duplicate detection. "İ" is replaced before
-- lower(), which would otherwise give "i" plus a combining dot.
create function private.fold_tr(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
           pg_catalog.translate(pg_catalog.lower(pg_catalog.translate(p, 'İI', 'iı')), 'çğıöşüâîû', 'cgiosuaiu'),
           '\s+', ' ', 'g'));
$$;

-- The centre of the grid cell holding the point: 0.0045° of latitude (500 m) by 0.006° of longitude (480–540 m across
-- Turkey). Whoever sees it learns the cell, never where in the cell the pin is.
create function private.snap_point(p extensions.geography)
returns extensions.geography
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.st_setsrid(extensions.st_makepoint(
           (pg_catalog.floor(extensions.st_x(g) / 0.006) + 0.5) * 0.006,
           (pg_catalog.floor(extensions.st_y(g) / 0.0045) + 0.5) * 0.0045), 4326)::extensions.geography
    from (select p::extensions.geometry as g) x;
$$;

-- {"lat": .., "lon": ..} -> a point inside Turkey's bounding box, or VALIDATION_FAILED. Null in, null out.
create function private.parse_point(p jsonb)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lon double precision;
begin
  if p is null or p = 'null'::jsonb then
    return null;
  end if;
  begin
    v_lat := (p ->> 'lat')::double precision;
    v_lon := (p ->> 'lon')::double precision;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  if jsonb_typeof(p) <> 'object' or v_lat is null or v_lon is null
     or v_lat not between 35.5 and 42.5 or v_lon not between 25.5 and 45.0 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326)::extensions.geography;
end;
$$;

-- A pin or a venue must be near its district: the seat is not the district's middle, and the largest districts are
-- about 70 km across, so 75 km from the seat. This is a guard against mistakes, not a boundary.
create function private.point_in_district(p extensions.geography, p_district uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.districts d
                  where d.id = p_district and extensions.st_dwithin(d.centroid, p, 75000));
$$;

create function private.point_json(p extensions.geography)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else pg_catalog.jsonb_build_object(
    'lat', pg_catalog.round(extensions.st_y(p::extensions.geometry)::numeric, 6),
    'lon', pg_catalog.round(extensions.st_x(p::extensions.geometry)::numeric, 6)) end;
$$;

revoke all on function private.fold_tr(text), private.snap_point(extensions.geography), private.parse_point(jsonb),
  private.point_in_district(extensions.geography, uuid), private.point_json(extensions.geography) from public, anon, authenticated;

-- ---- venues -------------------------------------------------------------------------------------------------------------
create table public.venues (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('PUBLIC_SPACE', 'COMMERCIAL_FACILITY')),
  name                text not null check (char_length(name) between 3 and 80),
  name_search         text not null generated always as (private.fold_tr(name)) stored,
  city_id             uuid not null,
  district_id         uuid not null,
  location            extensions.geography(Point, 4326) not null,
  address_text        text check (address_text is null or char_length(address_text) between 3 and 300),
  provenance          text not null check (provenance in
                        ('ADMIN_CURATED', 'USER_SUBMITTED', 'OSM_IMPORT', 'PARTNER_SUBMITTED', 'LICENSED_DATASET')),
  source_ref          text check (source_ref is null or char_length(source_ref) between 1 and 200),
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED')),
  listing_status      text not null default 'ACTIVE' check (listing_status in ('ACTIVE', 'HIDDEN')),
  submitted_by        uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  verified_at         timestamptz,
  constraint venues_district_in_city foreign key (district_id, city_id) references public.districts (id, city_id),
  constraint venues_verified_at check ((verification_status = 'VERIFIED') = (verified_at is not null))
);
create index venues_district_idx on public.venues (district_id) where listing_status = 'ACTIVE';
create index venues_city_idx on public.venues (city_id) where listing_status = 'ACTIVE';
create index venues_name_trgm_idx on public.venues using gin (name_search extensions.gin_trgm_ops);
create index venues_submitted_by_idx on public.venues (submitted_by, created_at);
create index venues_location_idx on public.venues using gist (location);

create table public.venue_sports (
  venue_id uuid not null references public.venues (id) on delete cascade,
  sport_id uuid not null references public.sports (id),
  primary key (venue_id, sport_id)
);
create index venue_sports_sport_idx on public.venue_sports (sport_id);

-- Read and written through the functions below only.
alter table public.venues enable row level security;
alter table public.venue_sports enable row level security;
revoke all on public.venues, public.venue_sports from anon, authenticated;

-- ---- event points ---------------------------------------------------------------------------------------------------
alter table public.event_private_details
  add column exact_point extensions.geography(Point, 4326),
  add column venue_id uuid references public.venues (id);
create index event_private_details_venue_idx on public.event_private_details (venue_id) where venue_id is not null;

alter table public.events
  add column public_point extensions.geography(Point, 4326),
  add column public_point_precision text not null default 'DISTRICT'
    check (public_point_precision in ('EXACT', 'APPROXIMATE', 'DISTRICT'));
update public.events e set public_point = d.centroid from public.districts d where d.id = e.district_id;
create index events_public_point_idx on public.events using gist (public_point) where status = 'PUBLISHED';

alter type private.event_input add attribute point extensions.geography;
alter type private.event_input add attribute venue_id uuid;

-- ---- moderation and reports learn about venues --------------------------------------------------------------------------
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
  'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED'));
alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
  check (target_type in ('USER', 'EVENT', 'REVIEW', 'VENUE'));
alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED'));
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('USER', 'EVENT', 'VENUE'));

insert into public.app_config (key, value) values
  ('quota.max_venue_suggestions_per_day', '5'::jsonb),
  ('quota.new_account_max_venue_suggestions_per_day', '1'::jsonb)
on conflict (key) do nothing;

-- =====================================================================================================================
-- Event input: an optional "point" {lat, lon} and an optional "venue_id". Old apps send neither (additive).
-- =====================================================================================================================
create or replace function private.parse_event_input(p jsonb)
returns private.event_input
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  r     private.event_input;
  v_min smallint;
  v_max smallint;
  v     public.venues;
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
    r.setting                := (p ->> 'setting')::public.event_setting;
    r.organizer_plays        := coalesce((p ->> 'organizer_plays')::boolean, true);
    r.skill_min              := (p ->> 'skill_min')::numeric;
    r.skill_max              := (p ->> 'skill_max')::numeric;
    r.booking_status         := coalesce(p ->> 'booking_status', 'NOT_REQUIRED')::public.booking_status;
    r.cost_amount_minor      := (p ->> 'cost_amount_minor')::integer;
    r.cost_note              := nullif(pg_catalog.btrim(p ->> 'cost_note'), '');
    r.equipment_note         := nullif(pg_catalog.btrim(p ->> 'equipment_note'), '');
    r.venue_id               := (p ->> 'venue_id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  r.point := private.parse_point(p -> 'point');

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
  -- A venue must be listed and in the chosen district; without a pin of its own the event takes the venue's.
  if r.venue_id is not null then
    select * into v from public.venues x where x.id = r.venue_id;
    if not found or v.listing_status <> 'ACTIVE' or v.district_id <> r.district_id then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    r.point := coalesce(r.point, v.location);
  end if;
  if r.point is not null and not private.point_in_district(r.point, r.district_id) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return r;
end;
$$;

-- What everybody may see of a location (see the header).
create function private.public_point_of(r private.event_input)
returns table (point extensions.geography, point_precision text)
language sql
stable
set search_path = ''
as $$
  select case when r.point is null then d.centroid
              when r.location_visibility = 'PUBLIC' then r.point
              else private.snap_point(r.point) end,
         case when r.point is null then 'DISTRICT'
              when r.location_visibility = 'PUBLIC' then 'EXACT'
              else 'APPROXIMATE' end
    from public.districts d where d.id = r.district_id;
$$;
revoke all on function private.public_point_of(private.event_input) from public, anon, authenticated;

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
  pp    record;
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
     >= private.account_quota(v_uid, 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  select * into pp from private.public_point_of(r);

  insert into public.events (
    organizer_id, client_request_id, sport_id, sport_format_id, title, description, visibility, invite_token,
    starts_at, duration_minutes, ends_at, registration_closes_at, city_id, district_id, location_visibility,
    public_location_label, capacity, waitlist_enabled, auto_approve, setting, organizer_plays, skill_min, skill_max, booking_status,
    cost_amount_minor, cost_note, equipment_note, public_point, public_point_precision)
  values (
    v_uid, p_client_request_id, r.sport_id, r.sport_format_id, r.title, r.description, r.visibility,
    case when r.visibility = 'INVITE_ONLY' then private.new_invite_token() end,
    r.starts_at, r.duration_minutes, r.starts_at, r.registration_closes_at, r.city_id, r.district_id,
    r.location_visibility, case when r.location_visibility = 'PUBLIC' then r.location_label end,
    r.capacity, r.waitlist_enabled, r.auto_approve, r.setting, r.organizer_plays, r.skill_min, r.skill_max, r.booking_status,
    r.cost_amount_minor, r.cost_note, r.equipment_note, pp.point, pp.point_precision)
  returning id into v_id;
  insert into public.event_private_details (event_id, location_label, address_text, participant_notes, exact_point, venue_id)
  values (v_id, r.location_label, r.address_text, r.participant_notes, r.point, r.venue_id);

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
  pp         record;
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

  -- Absent keys keep what is stored. A venue hidden since is dropped rather than refusing every later edit. Without a
  -- "point" key, a new district or another venue drops the stored pin (it belonged to the old place; a new venue then
  -- brings its own), and a new district without a "venue_id" key drops the venue too.
  r := private.parse_event_input(
         to_jsonb(e)
         || jsonb_build_object('location_label', d.location_label, 'address_text', d.address_text,
                               'participant_notes', d.participant_notes,
                               'point', private.point_json(d.exact_point),
                               'venue_id', case when exists (select 1 from public.venues v
                                                               where v.id = d.venue_id and v.listing_status = 'ACTIVE')
                                                then d.venue_id end)
         || case when not (p_input ? 'point')
                      and ((p_input ? 'district_id' and (p_input ->> 'district_id') is distinct from e.district_id::text)
                           or (p_input ? 'venue_id' and (p_input ->> 'venue_id') is distinct from d.venue_id::text))
                 then jsonb_build_object('point', null) else '{}'::jsonb end
         || case when p_input ? 'district_id' and (p_input ->> 'district_id') is distinct from e.district_id::text
                      and not (p_input ? 'venue_id')
                 then jsonb_build_object('venue_id', null) else '{}'::jsonb end
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
  select * into pp from private.public_point_of(r);

  -- Moving the pin is a material change like a new address: approved players are told.
  v_material := e.status = 'PUBLISHED' and (
       r.starts_at <> e.starts_at or r.duration_minutes <> e.duration_minutes or r.district_id <> e.district_id
    or r.location_label <> d.location_label or r.address_text is distinct from d.address_text
    or r.venue_id is distinct from d.venue_id
    or not (r.point is not distinct from d.exact_point
            or (r.point is not null and d.exact_point is not null and extensions.st_dwithin(r.point, d.exact_point, 1))));

  update public.events set
    sport_id = r.sport_id, sport_format_id = r.sport_format_id, title = r.title, description = r.description,
    visibility = r.visibility,
    invite_token = case when r.visibility = 'INVITE_ONLY' then coalesce(e.invite_token, private.new_invite_token()) end,
    starts_at = r.starts_at, duration_minutes = r.duration_minutes,
    registration_closes_at = r.registration_closes_at, city_id = r.city_id, district_id = r.district_id,
    location_visibility = r.location_visibility,
    public_location_label = case when r.location_visibility = 'PUBLIC' then r.location_label end,
    capacity = r.capacity, waitlist_enabled = r.waitlist_enabled, auto_approve = r.auto_approve, setting = r.setting,
    organizer_plays = r.organizer_plays,
    skill_min = r.skill_min, skill_max = r.skill_max, booking_status = r.booking_status,
    cost_amount_minor = r.cost_amount_minor, cost_note = r.cost_note, equipment_note = r.equipment_note,
    public_point = pp.point, public_point_precision = pp.point_precision,
    last_material_change_at = case when v_material then v_now else e.last_material_change_at end
  where id = e.id;
  update public.event_private_details set
    location_label = r.location_label, address_text = r.address_text, participant_notes = r.participant_notes,
    exact_point = r.point, venue_id = r.venue_id, updated_at = v_now
  where event_id = e.id;

  if v_material then
    perform private.notify(p.user_id, 'EVENT_CHANGED', jsonb_build_object('event_id', e.id),
                           'EVENT_CHANGED:' || e.id || ':' || p.user_id || ':' || extract(epoch from v_now))
       from public.event_participations p
      where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED');
  end if;
end;
$$;

-- A venue as an event shows it: its name and whether an administrator verified it. A hidden venue is not shown (the
-- event keeps its place label), and an edit drops it (update_event).
create function private.venue_brief(p_venue uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', v.id, 'name', v.name, 'kind', v.kind,
                                       'verified', v.verification_status = 'VERIFIED')
    from public.venues v where v.id = p_venue and v.listing_status = 'ACTIVE';
$$;
revoke all on function private.venue_brief(uuid) from public, anon, authenticated;

create or replace function public.get_event(p_event_id uuid, p_invite_token text default null)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid       uuid := (select auth.uid());
  e           public.events;
  d           public.event_private_details;
  v_my        public.participation_status;
  v_organizer boolean;
  v_involved  boolean;
  v_inside    boolean;
  v_name      text;
  v_venue     uuid;
begin
  select * into e from public.events x where x.id = p_event_id;
  if not found then
    return null;
  end if;
  v_organizer := v_uid is not null and e.organizer_id = v_uid;
  if v_uid is not null then
    select p.status into v_my from public.event_participations p where p.event_id = e.id and p.user_id = v_uid;
  end if;
  v_involved := v_organizer or v_my is not null or (v_uid is not null and private.is_admin());
  -- Blocked with the organizer: the event does not exist, unless the player was approved before the block.
  if v_uid is not null and not v_organizer and not private.is_admin() and v_my is distinct from 'APPROVED'
     and private.is_blocked_pair(v_uid, e.organizer_id) then
    return null;
  end if;
  if not v_involved then
    if e.status <> 'PUBLISHED'
       or (e.visibility = 'INVITE_ONLY' and (p_invite_token is null or e.invite_token is distinct from p_invite_token))
       or not exists (select 1 from public.profiles o where o.id = e.organizer_id and o.account_status = 'ACTIVE') then
      return null;
    end if;
  end if;
  -- Place, address, pin, notes and the roster: the organizer and approved players (the same rule as the RLS policy).
  v_inside := v_organizer or coalesce(v_my = 'APPROVED', false);
  if v_inside then
    select * into d from public.event_private_details x where x.event_id = e.id;
    v_venue := d.venue_id;
  elsif e.location_visibility = 'PUBLIC' then
    select x.venue_id into v_venue from public.event_private_details x where x.event_id = e.id;
  end if;
  select o.display_name into v_name from public.profiles o where o.id = e.organizer_id;

  return pg_catalog.jsonb_build_object(
    'id', e.id,
    'status', e.status,
    'title', e.title,
    'description', e.description,
    'sport_id', e.sport_id,
    'sport_format_id', e.sport_format_id,
    'visibility', e.visibility,
    'starts_at', e.starts_at,
    'duration_minutes', e.duration_minutes,
    'ends_at', e.ends_at,
    'city_id', e.city_id,
    'district_id', e.district_id,
    'location_visibility', e.location_visibility,
    'public_location_label', e.public_location_label,
    'public_point', private.point_json(e.public_point),
    'public_point_precision', e.public_point_precision,
    'venue', private.venue_brief(v_venue),
    'capacity', e.capacity,
    'approved_count', e.approved_count,
    'waitlist_enabled', e.waitlist_enabled,
    'auto_approve', e.auto_approve,
    'setting', e.setting,
    'organizer_plays', e.organizer_plays,
    'skill_min', e.skill_min,
    'skill_max', e.skill_max,
    'booking_status', e.booking_status,
    'cost_amount_minor', e.cost_amount_minor,
    'cost_note', e.cost_note,
    'equipment_note', e.equipment_note,
    'cancel_reason', e.cancel_reason,
    'cancel_message', e.cancel_message,
    'is_organizer', v_organizer,
    'my_status', v_my,
    'organizer_name', v_name,
    'invite_token', case when v_organizer and e.visibility = 'INVITE_ONLY' then e.invite_token end,
    'private', case when v_inside and d.event_id is not null then pg_catalog.jsonb_build_object(
                 'location_label', d.location_label,
                 'address_text', d.address_text,
                 'participant_notes', d.participant_notes,
                 'point', private.point_json(d.exact_point)) end,
    'participants_visible', v_inside,
    'participants', case when v_inside then coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', pr.id, 'display_name', pr.display_name)
                                    order by p.approved_at, p.id)
          from (select x.id, x.user_id, x.approved_at from public.event_participations x
                 where x.event_id = e.id and x.status = 'APPROVED' and not x.is_organizer
                   and (v_organizer or not private.is_blocked_pair(v_uid, x.user_id))
                 order by x.approved_at, x.id limit 100) p
          join public.profiles pr on pr.id = p.user_id), '[]'::jsonb) end
  );
end;
$$;

-- =====================================================================================================================
-- search_events: optional "near" {lat, lon} (sent by the device, never stored), "radius_km" (1–50) and "sort"
-- ("SOONEST", the default, or "NEAREST"). Items gain "point", "point_precision", "venue" (public locations only) and,
-- with "near", "distance_m" rounded to 100 m. All distances are from public_point.
-- =====================================================================================================================
create or replace function public.search_events(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_city      uuid;
  v_districts uuid[];
  v_sports    uuid[];
  v_format    uuid;
  v_setting   public.event_setting;
  v_from      timestamptz;
  v_to        timestamptz;
  v_tod       text[];
  v_level     numeric;
  v_open      boolean;
  v_limit     integer;
  v_near      extensions.geography;
  v_radius    numeric;
  v_sort      text;
  v_cur_at    timestamptz;
  v_cur_dist  double precision;
  v_cur_id    uuid;
  v_items     jsonb;
  v_count     integer;
  v_next      jsonb;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object'
     or (p_cursor is not null and jsonb_typeof(p_cursor) <> 'object') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  begin
    v_city   := (p_filters ->> 'city_id')::uuid;
    v_format := (p_filters ->> 'sport_format_id')::uuid;
    v_setting := (p_filters ->> 'setting')::public.event_setting;
    v_from   := (p_filters ->> 'from')::timestamptz;
    v_to     := (p_filters ->> 'to')::timestamptz;
    v_level  := (p_filters ->> 'skill_level')::numeric;
    v_open   := coalesce((p_filters ->> 'only_open')::boolean, false);
    v_limit  := coalesce((p_filters ->> 'limit')::integer, 20);
    v_radius := (p_filters ->> 'radius_km')::numeric;
    v_sort   := coalesce(p_filters ->> 'sort', 'SOONEST');
    select pg_catalog.array_agg(x::uuid) into v_districts
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'district_ids') x;
    select pg_catalog.array_agg(x::uuid) into v_sports
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'sport_ids') x;
    select pg_catalog.array_agg(x) into v_tod
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'time_of_day') x;
    v_cur_at := (p_cursor ->> 'starts_at')::timestamptz;
    v_cur_dist := (p_cursor ->> 'distance')::double precision;
    v_cur_id := (p_cursor ->> 'id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  v_near := private.parse_point(p_filters -> 'near');

  if v_limit < 1
     or coalesce(pg_catalog.cardinality(v_districts), 0) > 10
     or coalesce(pg_catalog.cardinality(v_sports), 0) > 10
     or (v_tod is not null and not v_tod <@ array['MORNING', 'AFTERNOON', 'EVENING'])
     or (v_level is not null and (v_level < 1.0 or v_level > 5.0))
     or (v_from is not null and v_to is not null and v_to <= v_from)
     or v_sort not in ('SOONEST', 'NEAREST')
     or (v_sort = 'NEAREST' and v_near is null)
     or (v_radius is not null and (v_near is null or v_radius < 1 or v_radius > 50))
     or (p_cursor is not null and v_cur_id is null)
     or (p_cursor is not null and v_sort = 'SOONEST' and v_cur_at is null)
     or (p_cursor is not null and v_sort = 'NEAREST' and v_cur_dist is null) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_limit := least(v_limit, 50);

  select coalesce(pg_catalog.jsonb_agg(p.item order by p.k_dist, p.starts_at, p.id), '[]'::jsonb), pg_catalog.count(*)
    into v_items, v_count
    from (
      select e.starts_at, e.id, m.dist,
             case when v_sort = 'NEAREST' then m.dist else 0 end as k_dist,
             pg_catalog.jsonb_build_object(
               'id', e.id,
               'title', e.title,
               'sport_id', e.sport_id,
               'sport_format_id', e.sport_format_id,
               'starts_at', e.starts_at,
               'ends_at', e.ends_at,
               'duration_minutes', e.duration_minutes,
               'city_id', e.city_id,
               'district_id', e.district_id,
               'place_label', e.public_location_label,
               'capacity', e.capacity,
               'approved_count', e.approved_count,
               'open_slots', e.capacity - e.approved_count,
               'registration_open', (e.registration_closes_at is null or e.registration_closes_at > pg_catalog.now()),
               'waitlist_enabled', e.waitlist_enabled,
               'skill_min', e.skill_min,
               'skill_max', e.skill_max,
               'cost_amount_minor', e.cost_amount_minor,
               'cost_note', e.cost_note,
               'booking_status', e.booking_status,
               'setting', e.setting,
               'organizer_name', pr.display_name,
               'point', private.point_json(e.public_point),
               'point_precision', e.public_point_precision,
               'venue', case when e.location_visibility = 'PUBLIC' then
                          (select private.venue_brief(x.venue_id) from public.event_private_details x
                            where x.event_id = e.id and x.venue_id is not null) end,
               'distance_m', case when v_near is not null then pg_catalog.round(m.dist / 100) * 100 end
             ) as item
        from public.events e
        join public.cities c on c.id = e.city_id
        join public.profiles pr on pr.id = e.organizer_id and pr.account_status = 'ACTIVE'
        cross join lateral (select case when v_near is null then null::double precision
                                        else extensions.st_distance(e.public_point, v_near) end as dist) m
       where e.status = 'PUBLISHED'
         and e.visibility = 'PUBLIC'
         and (v_uid is null or not exists (
               select 1 from public.user_blocks ub
                where (ub.blocker_id = v_uid and ub.blocked_id = e.organizer_id)
                   or (ub.blocker_id = e.organizer_id and ub.blocked_id = v_uid)))
         and e.starts_at > greatest(pg_catalog.now(), coalesce(v_from, pg_catalog.now()))
         and (v_to is null or e.starts_at < v_to)
         and (v_city is null or e.city_id = v_city)
         and (v_districts is null or e.district_id = any (v_districts))
         and (v_sports is null or e.sport_id = any (v_sports))
         and (v_format is null or e.sport_format_id = v_format)
         and (v_setting is null or e.setting = v_setting)
         and (not v_open or e.approved_count < e.capacity)
         and (v_radius is null or extensions.st_dwithin(e.public_point, v_near, (v_radius * 1000)::double precision))
         and (v_level is null
              or ((e.skill_min is null or e.skill_min <= v_level) and (e.skill_max is null or e.skill_max >= v_level)))
         and (v_tod is null
              or (case
                    when extract(hour from e.starts_at at time zone c.timezone) between 5 and 11 then 'MORNING'
                    when extract(hour from e.starts_at at time zone c.timezone) between 12 and 16 then 'AFTERNOON'
                    else 'EVENING'
                  end) = any (v_tod))
         and (p_cursor is null
              or (v_sort = 'SOONEST' and (e.starts_at, e.id) > (v_cur_at, v_cur_id))
              or (v_sort = 'NEAREST' and (m.dist, e.id) > (v_cur_dist, v_cur_id)))
       order by k_dist, e.starts_at, e.id
       limit v_limit + 1
    ) p;

  if v_count > v_limit then
    -- The cursor carries the exact distance from public_point, which is no more than public_point itself reveals.
    v_next := case when v_sort = 'NEAREST' then pg_catalog.jsonb_build_object(
                'distance', (select extensions.st_distance(e.public_point, v_near) from public.events e
                              where e.id = (v_items -> (v_limit - 1) ->> 'id')::uuid),
                'id', v_items -> (v_limit - 1) ->> 'id')
              else pg_catalog.jsonb_build_object(
                'starts_at', v_items -> (v_limit - 1) ->> 'starts_at',
                'id', v_items -> (v_limit - 1) ->> 'id') end;
    select coalesce(pg_catalog.jsonb_agg(t.x order by t.n), '[]'::jsonb) into v_items
      from pg_catalog.jsonb_array_elements(v_items) with ordinality t(x, n)
     where t.n <= v_limit;
  end if;

  return pg_catalog.jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

-- =====================================================================================================================
-- Venues
-- =====================================================================================================================
-- Shared validation of a venue as suggested or added: {kind, name, city_id, district_id, point, address_text?, sport_ids}.
create function private.parse_venue_input(p jsonb)
returns public.venues
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.venues;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'sport_ids') is distinct from 'array' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    v.kind         := p ->> 'kind';
    v.name         := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(p ->> 'name'), '\s+', ' ', 'g'), '');
    v.city_id      := (p ->> 'city_id')::uuid;
    v.district_id  := (p ->> 'district_id')::uuid;
    v.address_text := nullif(pg_catalog.regexp_replace(pg_catalog.btrim(p ->> 'address_text'), '\s+', ' ', 'g'), '');
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  v.location := private.parse_point(p -> 'point');
  -- A venue's name is not a place for a phone number or a link (the display-name rule, Phase 6 M6).
  if v.kind is null or v.kind not in ('PUBLIC_SPACE', 'COMMERCIAL_FACILITY')
     or v.name is null or char_length(v.name) not between 3 and 80
     or v.name ~* '(https?://|www\.|\.(com|net|org)\M)' or pg_catalog.regexp_replace(v.name, '\D', '', 'g') ~ '\d{7}'
     or (v.address_text is not null and char_length(v.address_text) not between 3 and 300)
     or v.location is null
     or jsonb_array_length(p -> 'sport_ids') not between 1 and 10
     or not exists (select 1 from public.districts d join public.cities c on c.id = d.city_id
                     where d.id = v.district_id and d.city_id = v.city_id and d.is_active and c.is_active)
     or not private.point_in_district(v.location, v.district_id) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- The sport ids of a venue input, all of them active sports, or VALIDATION_FAILED.
create function private.parse_venue_sports(p jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  begin
    select pg_catalog.array_agg(distinct x::uuid) into v_ids from pg_catalog.jsonb_array_elements_text(p -> 'sport_ids') x;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  if v_ids is null or (select pg_catalog.count(*) from public.sports s where s.id = any (v_ids) and s.is_active)
                      <> pg_catalog.cardinality(v_ids) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

create function private.venue_item(v public.venues)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', v.id, 'name', v.name, 'kind', v.kind, 'city_id', v.city_id, 'district_id', v.district_id,
    'address_text', v.address_text, 'point', private.point_json(v.location),
    'verified', v.verification_status = 'VERIFIED',
    'sport_ids', coalesce((select pg_catalog.jsonb_agg(s.sport_id order by s.sport_id)
                             from public.venue_sports s where s.venue_id = v.id), '[]'::jsonb));
$$;

revoke all on function private.parse_venue_input(jsonb), private.parse_venue_sports(jsonb),
  private.venue_item(public.venues) from public, anon, authenticated;

-- Venues of a province, for the event form and (later) the map. Guests may search too. Verified first, then by name.
create function public.search_venues(p_filters jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_city     uuid;
  v_district uuid;
  v_sport    uuid;
  v_q        text;
  v_limit    integer;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    v_city := (p_filters ->> 'city_id')::uuid;
    v_district := (p_filters ->> 'district_id')::uuid;
    v_sport := (p_filters ->> 'sport_id')::uuid;
    v_q := nullif(private.fold_tr(p_filters ->> 'q'), '');
    v_limit := coalesce((p_filters ->> 'limit')::integer, 20);
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  if v_city is null or v_limit not between 1 and 50 or coalesce(char_length(v_q), 0) > 60 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(private.venue_item(v) order by v.verification_status = 'VERIFIED' desc, v.name_search, v.id)
      from (select x.* from public.venues x
             where x.city_id = v_city and x.listing_status = 'ACTIVE'
               and (v_district is null or x.district_id = v_district)
               and (v_sport is null or exists (select 1 from public.venue_sports s where s.venue_id = x.id and s.sport_id = v_sport))
               and (v_q is null or x.name_search like '%' || v_q || '%')
             order by x.verification_status = 'VERIFIED' desc, x.name_search, x.id
             limit v_limit) v), '[]'::jsonb));
end;
$$;

-- A signed-in player suggests a venue. It is listed at once as unverified. The same name close by in the same district
-- returns the existing venue instead of a copy. 5 a day, 1 for a new account (Phase 6 M6 quotas).
create function public.suggest_venue(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  v        public.venues := private.parse_venue_input(p_input);
  v_sports uuid[] := private.parse_venue_sports(p_input);
  v_id     uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('venue:' || v_uid::text, 0));
  select x.id into v_id from public.venues x
   where x.district_id = v.district_id and x.listing_status = 'ACTIVE'
     and x.name_search = private.fold_tr(v.name) and extensions.st_dwithin(x.location, v.location, 300)
   limit 1;
  if found then
    return v_id;
  end if;
  if (select pg_catalog.count(*) from public.venues x
       where x.submitted_by = v_uid and x.created_at > pg_catalog.now() - interval '24 hours')
     >= private.account_quota(v_uid, 'quota.max_venue_suggestions_per_day', 5,
                              'quota.new_account_max_venue_suggestions_per_day', 1) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.venues (kind, name, city_id, district_id, location, address_text, provenance, submitted_by)
  values (v.kind, v.name, v.city_id, v.district_id, v.location, v.address_text, 'USER_SUBMITTED', v_uid)
  returning id into v_id;
  insert into public.venue_sports (venue_id, sport_id) select v_id, s from pg_catalog.unnest(v_sports) s;
  return v_id;
end;
$$;

-- An administrator adds a venue: verified from the start.
create function public.admin_add_venue(p_input jsonb, p_source_ref text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v        public.venues := private.parse_venue_input(p_input);
  v_sports uuid[] := private.parse_venue_sports(p_input);
  v_ref    text := nullif(pg_catalog.btrim(p_source_ref), '');
  v_id     uuid;
begin
  if coalesce(char_length(v_ref), 0) > 200 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  insert into public.venues (kind, name, city_id, district_id, location, address_text, provenance, source_ref,
                             verification_status, verified_at)
  values (v.kind, v.name, v.city_id, v.district_id, v.location, v.address_text, 'ADMIN_CURATED', v_ref,
          'VERIFIED', pg_catalog.now())
  returning id into v_id;
  insert into public.venue_sports (venue_id, sport_id) select v_id, s from pg_catalog.unnest(v_sports) s;
  perform private.record_moderation(v_uid, 'VENUE_ADDED', 'VENUE', v_id);
  return v_id;
end;
$$;

-- VERIFY, HIDE or RESTORE. Repeating the current state changes nothing and returns false. Verification survives hiding.
create function public.admin_set_venue_status(p_venue_id uuid, p_action text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, false);
  v      public.venues;
begin
  if p_action is null or p_action not in ('VERIFY', 'HIDE', 'RESTORE') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into v from public.venues x where x.id = p_venue_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if (p_action = 'VERIFY' and v.verification_status = 'VERIFIED')
     or (p_action = 'HIDE' and v.listing_status = 'HIDDEN')
     or (p_action = 'RESTORE' and v.listing_status = 'ACTIVE') then
    return false;
  end if;
  if p_action = 'VERIFY' then
    update public.venues set verification_status = 'VERIFIED', verified_at = pg_catalog.now() where id = v.id;
  else
    update public.venues set listing_status = case p_action when 'HIDE' then 'HIDDEN' else 'ACTIVE' end where id = v.id;
  end if;
  perform private.record_moderation(v_uid,
    case p_action when 'VERIFY' then 'VENUE_VERIFIED' when 'HIDE' then 'VENUE_HIDDEN' else 'VENUE_RESTORED' end,
    'VENUE', v.id, null, null, v_note);
  return true;
end;
$$;

-- The administrators' venue lists: UNVERIFIED (the queue, oldest first), VERIFIED and HIDDEN (newest first).
create function public.admin_list_venues(p_status text default 'UNVERIFIED', p_cursor jsonb default null,
                                         p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_after timestamptz;
  v_id    uuid;
  v_rows  public.venues[];
  v_next  jsonb;
begin
  perform private.assert_admin_aal2();
  if p_status is null or p_status not in ('UNVERIFIED', 'VERIFIED', 'HIDDEN') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    v_after := (p_cursor ->> 'created_at')::timestamptz;
    v_id := (p_cursor ->> 'id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  select pg_catalog.array_agg(q.v) into v_rows from (
    select x as v from public.venues x
     where case p_status
             when 'UNVERIFIED' then x.verification_status = 'UNVERIFIED' and x.listing_status = 'ACTIVE'
             when 'VERIFIED' then x.verification_status = 'VERIFIED' and x.listing_status = 'ACTIVE'
             else x.listing_status = 'HIDDEN' end
       and (v_after is null
            or (p_status = 'UNVERIFIED' and (x.created_at, x.id) > (v_after, v_id))
            or (p_status <> 'UNVERIFIED' and (x.created_at, x.id) < (v_after, v_id)))
     order by (case when p_status = 'UNVERIFIED' then x.created_at end) asc,
              (case when p_status = 'UNVERIFIED' then x.id end) asc, x.created_at desc, x.id desc
     limit v_limit + 1) q;
  if coalesce(pg_catalog.array_length(v_rows, 1), 0) > v_limit then
    v_next := pg_catalog.jsonb_build_object('created_at', (v_rows[v_limit]).created_at, 'id', (v_rows[v_limit]).id);
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(
                         private.venue_item(v_rows[i]) || pg_catalog.jsonb_build_object(
                           'provenance', (v_rows[i]).provenance,
                           'hidden', (v_rows[i]).listing_status = 'HIDDEN',
                           'created_at', (v_rows[i]).created_at,
                           'submitted_by', (v_rows[i]).submitted_by,
                           'submitter_name', (select p.display_name from public.profiles p where p.id = (v_rows[i]).submitted_by),
                           'open_reports', (select pg_catalog.count(*) from public.reports r
                                             where r.target_type = 'VENUE' and r.target_id = (v_rows[i]).id and r.status = 'OPEN'),
                           'events', (select pg_catalog.count(*) from public.event_private_details d where d.venue_id = (v_rows[i]).id))
                         order by i)
                         from pg_catalog.generate_series(1, least(coalesce(pg_catalog.array_length(v_rows, 1), 0), v_limit)) i),
                      '[]'::jsonb),
    'next_cursor', v_next);
end;
$$;

revoke all on function public.search_venues(jsonb), public.suggest_venue(jsonb), public.admin_add_venue(jsonb, text),
  public.admin_set_venue_status(uuid, text, text), public.admin_list_venues(text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.search_venues(jsonb) to anon, authenticated;
grant execute on function public.suggest_venue(jsonb), public.admin_add_venue(jsonb, text),
  public.admin_set_venue_status(uuid, text, text), public.admin_list_venues(text, jsonb, integer) to authenticated;

-- =====================================================================================================================
-- Reports about a venue (anyone signed in who can find it: it is listed), and how the queue names it.
-- =====================================================================================================================
create or replace function public.report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null,
                                         p_invite_token text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  v_details text := nullif(pg_catalog.btrim(p_details), '');
  v_id      uuid;
  e         public.events;
begin
  if p_target_type is null or p_target_type not in ('USER', 'EVENT', 'VENUE') or p_target_id is null
     or p_reason is null or p_reason not in ('SPAM', 'HARASSMENT', 'UNSAFE', 'FAKE_EVENT', 'INAPPROPRIATE', 'OTHER')
     or coalesce(char_length(v_details), 0) > 1000 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if p_target_type = 'USER' then
    if p_target_id = v_uid then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_target_id and p.account_status <> 'DELETED')
       or not private.can_report_user(v_uid, p_target_id) then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  elsif p_target_type = 'VENUE' then
    if not exists (select 1 from public.venues v where v.id = p_target_id and v.listing_status = 'ACTIVE') then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  else
    select * into e from public.events x where x.id = p_target_id;
    if found and e.organizer_id = v_uid then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';  -- one's own event
    end if;
    if not found or e.status = 'DRAFT'
       or not ((e.visibility = 'PUBLIC' and e.status = 'PUBLISHED')
               or e.invite_token is not distinct from p_invite_token and p_invite_token is not null
               or exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = v_uid)) then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- The daily count reads what other calls just wrote: one reporter at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report:' || v_uid::text, 0));

  select r.id into v_id from public.reports r
   where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'OPEN';
  if found then
    return v_id;
  end if;
  if (select pg_catalog.count(*) from public.reports r
       where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '24 hours')
     >= private.config_int('quota.max_reports_per_day', 20) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, p_target_type, p_target_id, p_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.report_item(r public.reports)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'target_label', case r.target_type
      when 'USER' then (select p.display_name from public.profiles p where p.id = r.target_id)
      when 'VENUE' then (select v.name from public.venues v where v.id = r.target_id)
      else (select e.title from public.events e where e.id = r.target_id) end,
    'reason', r.reason,
    'status', r.status,
    'created_at', r.created_at,
    'handled_at', r.handled_at,
    'reporter_id', r.reporter_id,
    'reporter_name', (select p.display_name from public.profiles p where p.id = r.reporter_id),
    'open_for_target', (select pg_catalog.count(*) from public.reports o
                         where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'OPEN'));
$$;

-- =====================================================================================================================
-- Export and purge: a person's pins and suggestions are theirs; after purge a suggestion stays, without its author.
-- =====================================================================================================================
create function private.export_place_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'event_pins', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('event_id', e.id, 'point', private.point_json(d.exact_point))
                                  order by e.created_at, e.id)
        from public.events e join public.event_private_details d on d.event_id = e.id
       where e.organizer_id = p_uid and d.exact_point is not null), '[]'::jsonb),
    'venue_suggestions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'name', v.name, 'kind', v.kind, 'point', private.point_json(v.location), 'address_text', v.address_text,
               'created_at', v.created_at, 'verified', v.verification_status = 'VERIFIED',
               'listed', v.listing_status = 'ACTIVE') order by v.created_at, v.id)
        from public.venues v where v.submitted_by = p_uid), '[]'::jsonb));
$$;
revoke all on function private.export_place_data(uuid) from public, anon, authenticated;

-- Live definitions (Phase 6 M6 / Phase 3) with one line each added: the place data in the export, the author removed on purge.
create or replace function public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ) || private.export_event_data(v_uid) || private.export_place_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

create or replace function private.purge_account(p_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  update public.venues set submitted_by = null where submitted_by = p_uid;
  update public.profiles
     set display_name = null, avatar_path = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$function$;

-- The report page names a reported venue (live definition from Phase 6 M4, one branch added).
create or replace function public.admin_get_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r        public.reports;
  v_target jsonb;
begin
  perform private.assert_admin_aal2();
  select * into r from public.reports x where x.id = p_report_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.target_type = 'USER' then
    select pg_catalog.jsonb_build_object(
             'id', p.id, 'name', p.display_name, 'account_status', p.account_status, 'created_at', p.created_at,
             'is_admin', exists (select 1 from public.platform_admins a where a.user_id = p.id and a.revoked_at is null))
      into v_target from public.profiles p where p.id = r.target_id;
  elsif r.target_type = 'VENUE' then
    select pg_catalog.jsonb_build_object(
             'id', v.id, 'name', v.name, 'listing_status', v.listing_status,
             'verified', v.verification_status = 'VERIFIED')
      into v_target from public.venues v where v.id = r.target_id;
  else
    select pg_catalog.jsonb_build_object(
             'id', e.id, 'name', e.title, 'status', e.status, 'starts_at', e.starts_at,
             'organizer_id', e.organizer_id,
             'organizer_name', (select o.display_name from public.profiles o where o.id = e.organizer_id),
             'approved_count', e.approved_count, 'capacity', e.capacity)
      into v_target from public.events e where e.id = r.target_id;
  end if;
  return private.report_item(r) || pg_catalog.jsonb_build_object(
    'details', r.details,
    'target', v_target,
    'others', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', o.id, 'reason', o.reason, 'details', o.details, 'created_at', o.created_at,
               'reporter_name', (select p.display_name from public.profiles p where p.id = o.reporter_id))
             order by o.created_at, o.id)
        from public.reports o
       where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'OPEN' and o.id <> r.id), '[]'::jsonb),
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'action', h.action, 'outcome', h.outcome, 'note', h.note, 'created_at', h.created_at)
             order by h.id desc)
        from (select * from public.moderation_actions m
               where m.target_type = r.target_type and m.target_id = r.target_id
               order by m.id desc limit 20) h), '[]'::jsonb));
end;
$function$;
