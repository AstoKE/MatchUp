-- Phase 3 / M3: guest-readable discovery. One read RPC, `search_events(filters, cursor)`, keyset-paginated
-- by (starts_at, id). It is SECURITY DEFINER because it joins the organizer's display name (profiles has
-- no guest policy) and the city time zone; the visibility rules are therefore written out in the query:
-- only PUBLISHED + PUBLIC events that have not started, organizer account ACTIVE. Blocked pairs are not
-- excluded yet: blocking arrives in Phase 6 (DATABASE §9) and extends this function additively.
-- Filters are one jsonb object (ADR-0019 decision 3: new optional filters need no new function version);
-- unknown keys are ignored, anything malformed or out of bounds is VALIDATION_FAILED. No coordinates
-- exist in Phase 3 (ADR-0019): the result carries the district and, only for PUBLIC locations, the place
-- label. Hidden places never leave the database here.

create function public.search_events(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null)
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
comment on function public.search_events(jsonb, jsonb) is
  'Guest-readable discovery (D-09): upcoming PUBLISHED+PUBLIC events, keyset paginated, page cap 50, 5 s timeout.';

-- The only function guests may execute (docs/DATABASE.md §9); the anon whitelist test in
-- 01_security_baseline enumerates it.
revoke all on function public.search_events(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.search_events(jsonb, jsonb) to anon, authenticated;
