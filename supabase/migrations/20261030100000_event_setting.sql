-- Phase 3 / UI review: indoor or outdoor (docs/PRD.md section 4.3). An optional, public label of the place:
-- `events.setting` (INDOOR / OUTDOOR / not stated), set through the same optional jsonb key `setting`, shown on
-- the card and the event page, and usable as a Discover filter. Additive: installed apps that do not send it
-- keep working. create_event, update_event, parse_event_input, search_events and list_my_events are
-- redefined with exactly that addition and nothing else.

create type public.event_setting as enum ('INDOOR', 'OUTDOOR');
alter table public.events add column setting public.event_setting;
comment on column public.events.setting is 'Indoor or outdoor, as stated by the organizer; null when not stated. Public.';
alter type private.event_input add attribute setting public.event_setting;

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
    r.setting                := (p ->> 'setting')::public.event_setting;
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
    public_location_label, capacity, waitlist_enabled, auto_approve, setting, organizer_plays, skill_min, skill_max, booking_status,
    cost_amount_minor, cost_note, equipment_note)
  values (
    v_uid, p_client_request_id, r.sport_id, r.sport_format_id, r.title, r.description, r.visibility,
    case when r.visibility = 'INVITE_ONLY' then private.new_invite_token() end,
    r.starts_at, r.duration_minutes, r.starts_at, r.registration_closes_at, r.city_id, r.district_id,
    r.location_visibility, case when r.location_visibility = 'PUBLIC' then r.location_label end,
    r.capacity, r.waitlist_enabled, r.auto_approve, r.setting, r.organizer_plays, r.skill_min, r.skill_max, r.booking_status,
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
    capacity = r.capacity, waitlist_enabled = r.waitlist_enabled, auto_approve = r.auto_approve, setting = r.setting,
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

create or replace function public.search_events(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
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
  v_cur_at    timestamptz;
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
    select pg_catalog.array_agg(x::uuid) into v_districts
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'district_ids') x;
    select pg_catalog.array_agg(x::uuid) into v_sports
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'sport_ids') x;
    select pg_catalog.array_agg(x) into v_tod
      from pg_catalog.jsonb_array_elements_text(p_filters -> 'time_of_day') x;
    v_cur_at := (p_cursor ->> 'starts_at')::timestamptz;
    v_cur_id := (p_cursor ->> 'id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;

  if v_limit < 1
     or coalesce(pg_catalog.cardinality(v_districts), 0) > 10
     or coalesce(pg_catalog.cardinality(v_sports), 0) > 10
     or (v_tod is not null and not v_tod <@ array['MORNING', 'AFTERNOON', 'EVENING'])
     or (v_level is not null and (v_level < 1.0 or v_level > 5.0))
     or (v_from is not null and v_to is not null and v_to <= v_from)
     or (p_cursor is not null and (v_cur_at is null or v_cur_id is null)) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_limit := least(v_limit, 50);

  select coalesce(pg_catalog.jsonb_agg(p.item order by p.starts_at, p.id), '[]'::jsonb), pg_catalog.count(*)
    into v_items, v_count
    from (
      select e.starts_at, e.id,
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
               'organizer_name', pr.display_name
             ) as item
        from public.events e
        join public.cities c on c.id = e.city_id
        join public.profiles pr on pr.id = e.organizer_id and pr.account_status = 'ACTIVE'
       where e.status = 'PUBLISHED'
         and e.visibility = 'PUBLIC'
         and e.starts_at > greatest(pg_catalog.now(), coalesce(v_from, pg_catalog.now()))
         and (v_to is null or e.starts_at < v_to)
         and (v_city is null or e.city_id = v_city)
         and (v_districts is null or e.district_id = any (v_districts))
         and (v_sports is null or e.sport_id = any (v_sports))
         and (v_format is null or e.sport_format_id = v_format)
         and (v_setting is null or e.setting = v_setting)
         and (not v_open or e.approved_count < e.capacity)
         and (v_level is null
              or ((e.skill_min is null or e.skill_min <= v_level) and (e.skill_max is null or e.skill_max >= v_level)))
         and (v_tod is null
              or (case
                    when extract(hour from e.starts_at at time zone c.timezone) between 5 and 11 then 'MORNING'
                    when extract(hour from e.starts_at at time zone c.timezone) between 12 and 16 then 'AFTERNOON'
                    else 'EVENING'
                  end) = any (v_tod))
         and (p_cursor is null or (e.starts_at, e.id) > (v_cur_at, v_cur_id))
       order by e.starts_at, e.id
       limit v_limit + 1
    ) p;

  if v_count > v_limit then
    v_next := pg_catalog.jsonb_build_object(
      'starts_at', v_items -> (v_limit - 1) ->> 'starts_at',
      'id', v_items -> (v_limit - 1) ->> 'id');
    select coalesce(pg_catalog.jsonb_agg(t.x order by t.n), '[]'::jsonb) into v_items
      from pg_catalog.jsonb_array_elements(v_items) with ordinality t(x, n)
     where t.n <= v_limit;
  end if;

  return pg_catalog.jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

create or replace function public.list_my_events(p_bucket text, p_cursor jsonb default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_desc   boolean;
  v_limit  integer;
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_items  jsonb;
  v_count  integer;
  v_next   jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_bucket is null or p_bucket not in ('ORGANIZING', 'PENDING', 'APPROVED', 'WAITLISTED', 'PAST')
     or p_limit is null or p_limit < 1
     or (p_cursor is not null and jsonb_typeof(p_cursor) <> 'object') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    v_cur_at := (p_cursor ->> 'starts_at')::timestamptz;
    v_cur_id := (p_cursor ->> 'id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  if p_cursor is not null and (v_cur_at is null or v_cur_id is null) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_limit := least(p_limit, 50);
  v_desc := p_bucket = 'PAST';

  select coalesce(pg_catalog.jsonb_agg(m.item order by m.n), '[]'::jsonb), pg_catalog.count(*)
    into v_items, v_count
    from (
      select pg_catalog.row_number() over (
               order by (case when not v_desc then e.starts_at end) asc nulls last,
                        (case when v_desc then e.starts_at end) desc nulls last,
                        (case when not v_desc then e.id end) asc nulls last,
                        (case when v_desc then e.id end) desc nulls last) as n,
             pg_catalog.jsonb_build_object(
               'id', e.id,
               'title', e.title,
               'status', e.status,
               'my_status', case when e.organizer_id = v_uid then 'ORGANIZER' else p.status::text end,
               'pending_count', case when e.organizer_id = v_uid then
                 (select pg_catalog.count(*) from public.event_participations q
                   where q.event_id = e.id and q.status = 'REQUESTED') end,
               'sport_id', e.sport_id,
               'sport_format_id', e.sport_format_id,
               'starts_at', e.starts_at,
               'ends_at', e.ends_at,
               'duration_minutes', e.duration_minutes,
               'city_id', e.city_id,
               'district_id', e.district_id,
               'place_label', coalesce(
                 case when e.organizer_id = v_uid or p.status = 'APPROVED' then d.location_label end,
                 e.public_location_label),
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
               'organizer_name', pr.display_name
             ) as item
        from public.events e
        left join public.event_participations p on p.event_id = e.id and p.user_id = v_uid
        left join public.event_private_details d on d.event_id = e.id
        left join public.profiles pr on pr.id = e.organizer_id
       where (case p_bucket
                when 'ORGANIZING' then
                  e.organizer_id = v_uid
                  and (e.status = 'DRAFT' or (e.status = 'PUBLISHED' and e.ends_at > pg_catalog.now()))
                when 'PENDING' then
                  p.status = 'REQUESTED' and e.status = 'PUBLISHED' and e.ends_at > pg_catalog.now()
                when 'WAITLISTED' then
                  p.status = 'WAITLISTED' and e.status = 'PUBLISHED' and e.ends_at > pg_catalog.now()
                when 'APPROVED' then
                  p.status = 'APPROVED' and not p.is_organizer
                  and e.status = 'PUBLISHED' and e.ends_at > pg_catalog.now()
                else
                  e.status <> 'DRAFT'
                  and (e.status in ('CANCELED', 'COMPLETED') or e.ends_at <= pg_catalog.now())
                  and (e.organizer_id = v_uid
                       or (p.status in ('APPROVED', 'REJECTED', 'REMOVED') and not p.is_organizer))
              end)
         and (p_cursor is null
              or (case when v_desc then (e.starts_at, e.id) < (v_cur_at, v_cur_id)
                       else (e.starts_at, e.id) > (v_cur_at, v_cur_id) end))
       order by (case when not v_desc then e.starts_at end) asc nulls last,
                (case when v_desc then e.starts_at end) desc nulls last,
                (case when not v_desc then e.id end) asc nulls last,
                (case when v_desc then e.id end) desc nulls last
       limit v_limit + 1
    ) m;

  if v_count > v_limit then
    v_next := pg_catalog.jsonb_build_object(
      'starts_at', v_items -> (v_limit - 1) ->> 'starts_at',
      'id', v_items -> (v_limit - 1) ->> 'id');
    select coalesce(pg_catalog.jsonb_agg(t.x order by t.n), '[]'::jsonb) into v_items
      from pg_catalog.jsonb_array_elements(v_items) with ordinality t(x, n)
     where t.n <= v_limit;
  end if;

  return pg_catalog.jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;
