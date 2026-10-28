-- Phase 3 / M3b: My Events (PRD §4.5). `list_my_events(bucket, cursor, limit)` returns the caller's own
-- events and participations in one of five buckets, keyset-paginated by (starts_at, id):
--   ORGANIZING  events I organize that are drafts or have not ended (with the pending-request count)
--   PENDING     my join requests on upcoming events        WAITLISTED  my waitlist places on upcoming events
--   APPROVED    upcoming events I was approved for (not my own: those are ORGANIZING)
--   PAST        ended, canceled or completed events I organized, or was approved/rejected/removed for (newest first)
-- SECURITY DEFINER only to read the organizer's name and the private place of events the caller may see
-- there; every row is restricted to the caller (auth.uid()). Participation requests themselves arrive in M4,
-- until then only ORGANIZING and PAST can hold rows.

create function public.list_my_events(p_bucket text, p_cursor jsonb default null, p_limit integer default 20)
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
comment on function public.list_my_events(text, jsonb, integer) is
  'My Events buckets (ORGANIZING/PENDING/APPROVED/WAITLISTED/PAST) for the caller, keyset paginated, page cap 50.';

revoke all on function public.list_my_events(text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.list_my_events(text, jsonb, integer) to authenticated;
