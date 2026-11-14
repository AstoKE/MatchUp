-- Phase 11 / M2 (ADR-0032): what the app shows of a series. Additive only, so installed apps keep working:
-- list_my_events marks the rows that belong to a series, and get_event_series says on which weekday and at what
-- time the series repeats (Turkey's local time, the series' own schedule, so an event moved by hand does not change it).

-- Unchanged from 20261030100000_event_setting.sql except for 'in_series'.
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
               'organizer_name', pr.display_name,
               'in_series', e.series_id is not null
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

-- As in 20261128100000_event_series.sql, plus the weekday (ISO, 1 = Monday) and local time of an active series. They
-- come from the next start not yet opened, which every start of the series shares.
create or replace function public.get_event_series(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'id', s.id, 'interval_weeks', s.interval_weeks, 'status', s.status,
           'is_mine', s.organizer_id = (select auth.uid()),
           'stopped_reason', case when s.organizer_id = (select auth.uid()) then s.stopped_reason end,
           'next_at', case when s.organizer_id = (select auth.uid()) and s.status = 'ACTIVE' then s.next_at end,
           'weekday', case when s.status = 'ACTIVE'
                        then pg_catalog.date_part('isodow', s.next_at at time zone 'Europe/Istanbul')::integer end,
           'local_time', case when s.status = 'ACTIVE'
                           then pg_catalog.to_char(s.next_at at time zone 'Europe/Istanbul', 'HH24:MI') end)
    from public.events e
    join public.event_series s on s.id = e.series_id
   where e.id = p_event_id
     and ((e.visibility = 'PUBLIC' and e.status in ('PUBLISHED', 'COMPLETED'))
          or e.organizer_id = (select auth.uid())
          or exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = (select auth.uid())));
$$;
