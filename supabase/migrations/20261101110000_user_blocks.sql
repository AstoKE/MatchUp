-- Phase 6 / M1: blocking (F-27). PRD §4.9, USER_FLOWS FL-9, SECURITY S-8 and S-12, docs/PHASE6_PLAN.md decision 1.
-- Mutual and silent: neither side can find, join or review the other, and neither is told why (the answers are the ones
-- for anything else that does not exist). Pending requests between them are rejected without a notification. Someone
-- already approved stays approved: removing them would give the block away, the organizer can do it by hand.
-- Function bodies are the latest applied ones with the block checks added.

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);
comment on table public.user_blocks is 'Who blocked whom. Readable only by the blocker: being blocked is never revealed.';

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
create policy user_blocks_select_own on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create function private.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_blocks b
                  where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;
revoke all on function private.is_blocked_pair(uuid, uuid) from public, anon, authenticated;

-- For RLS. Only ever about the caller, so it cannot be used to ask whether two other people blocked each other.
create function private.is_blocked_with_me(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_blocked_pair((select auth.uid()), p_other);
$$;
revoke all on function private.is_blocked_with_me(uuid) from public, anon;
grant execute on function private.is_blocked_with_me(uuid) to authenticated;

-- ---- direct table reads: the same rule, on top of the existing policies (restrictive: all must pass) ----------------
create policy events_select_not_blocked on public.events as restrictive for select to authenticated
  using (organizer_id = (select auth.uid()) or private.is_event_participant(id) or private.is_admin()
         or not private.is_blocked_with_me(organizer_id));
create policy profiles_select_not_blocked on public.profiles as restrictive for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()) or not private.is_blocked_with_me(id));
create policy user_sport_profiles_select_not_blocked on public.user_sport_profiles as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not private.is_blocked_with_me(user_id));
create policy user_sport_positions_select_not_blocked on public.user_sport_positions as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not private.is_blocked_with_me(user_id));

-- ---- a second line behind the RPCs: nobody enters an event of someone they are blocked with ------------------------
create function private.event_participations_block_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_organizer and new.status in ('REQUESTED', 'WAITLISTED', 'APPROVED')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and private.is_blocked_pair(new.user_id, (select e.organizer_id from public.events e where e.id = new.event_id)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.event_participations_block_guard() from public, anon, authenticated;
create trigger event_participations_block_guard before insert or update on public.event_participations
  for each row execute function private.event_participations_block_guard();

-- ---- the RPCs --------------------------------------------------------------------------------------------------------
create function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  r     record;
begin
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.account_status <> 'DELETED') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
  -- FL-9: open requests between them are rejected, silently. In event order, like everything that locks events.
  for r in
    select p.id as participation_id, e.id as event_id
      from public.event_participations p
      join public.events e on e.id = p.event_id
     where p.status in ('REQUESTED', 'WAITLISTED') and not p.is_organizer
       and ((p.user_id = v_uid and e.organizer_id = p_user_id) or (p.user_id = p_user_id and e.organizer_id = v_uid))
     order by e.id
  loop
    perform 1 from public.events e where e.id = r.event_id for update;
    update public.event_participations
       set status = 'REJECTED', decided_at = pg_catalog.now(), waitlisted_at = null
     where id = r.participation_id and status in ('REQUESTED', 'WAITLISTED');
  end loop;
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  delete from public.user_blocks where blocker_id = v_uid and blocked_id = p_user_id;
end;
$$;

-- The caller's own blocks, newest first. Display names only.
create function public.list_my_blocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'user_id', b.blocked_id, 'display_name', p.display_name, 'blocked_at', b.created_at)
           order by b.created_at desc, b.blocked_id)
      from public.user_blocks b
      join public.profiles p on p.id = b.blocked_id
     where b.blocker_id = v_uid), '[]'::jsonb);
end;
$$;

revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.list_my_blocks() from public, anon, authenticated;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.list_my_blocks() to authenticated;

create or replace function public.get_event(p_event_id uuid, p_invite_token text default null)
returns jsonb
language plpgsql
stable
security definer
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
  -- Place, address, notes and the roster: the organizer and approved players (the same rule as the RLS policy).
  v_inside := v_organizer or coalesce(v_my = 'APPROVED', false);
  if v_inside then
    select * into d from public.event_private_details x where x.event_id = e.id;
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
                 'participant_notes', d.participant_notes) end,
    'participants_visible', v_inside,
    'participants', case when v_inside then coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('display_name', pr.display_name)
                                    order by p.approved_at, p.id)
          from (select x.id, x.user_id, x.approved_at from public.event_participations x
                 where x.event_id = e.id and x.status = 'APPROVED' and not x.is_organizer
                   and (v_organizer or not private.is_blocked_pair(v_uid, x.user_id))
                 order by x.approved_at, x.id limit 100) p
          join public.profiles pr on pr.id = p.user_id), '[]'::jsonb) end
  );
end;
$$;

create or replace function public.request_join(
  p_event_id uuid,
  p_message text default null,
  p_position_id uuid default null,
  p_invite_token text default null
)
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
  -- Drafts do not exist for players; an invite-only event does not exist without its secret token (S-18).
  if not found or e.status = 'DRAFT'
     or (e.visibility = 'INVITE_ONLY' and (p_invite_token is null or e.invite_token is distinct from p_invite_token)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if private.is_blocked_pair(v_uid, e.organizer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';  -- S-12: indistinguishable from missing
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

create or replace function public.search_events(p_filters jsonb default '{}'::jsonb, p_cursor jsonb default null)
returns jsonb
language plpgsql
stable
security definer
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

create or replace function public.get_event_reviews(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
  me    public.event_participations;
  v_can boolean;
begin
  select * into e from public.events x where x.id = p_event_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into me from public.event_participations p
   where p.event_id = e.id and p.user_id = v_uid and p.status = 'APPROVED';
  if me.id is null and e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  v_can := me.id is not null and me.attendance = 'PRESENT' and e.status = 'COMPLETED'
           and e.attendance_finalized_at is not null
           and (not me.is_organizer
                or (select pg_catalog.count(*) from public.event_participations o
                     where o.event_id = e.id and not o.is_organizer and o.status = 'APPROVED' and o.attendance = 'PRESENT') >= 2);
  return jsonb_build_object(
    'can_review', v_can,
    'window_open', v_can and pg_catalog.now() <= e.review_window_closes_at
                   and not exists (select 1 from private.closed_review_windows c where c.event_id = e.id),
    'window_closes_at', e.review_window_closes_at,
    'targets', case when not v_can then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'display_name', pr.display_name,
               'reviewed', exists (select 1 from public.skill_reviews r
                                    where r.event_id = e.id and r.reviewer_id = v_uid and r.reviewee_id = p.user_id))
             order by p.requested_at, p.id)
        from public.event_participations p
        join public.profiles pr on pr.id = p.user_id
       where p.event_id = e.id and p.user_id <> v_uid and p.status = 'APPROVED' and p.attendance = 'PRESENT'
         and not private.is_blocked_pair(v_uid, p.user_id)), '[]'::jsonb) end);
end;
$$;

create or replace function private.skill_reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.events e
                  where e.id = new.event_id and e.status = 'COMPLETED' and e.attendance_finalized_at is not null
                    and e.sport_id = new.sport_id)
     or (select pg_catalog.count(*) from public.event_participations p
          where p.event_id = new.event_id and p.user_id in (new.reviewer_id, new.reviewee_id)
            and p.status = 'APPROVED' and p.attendance = 'PRESENT') <> 2 then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  if private.is_blocked_pair(new.reviewer_id, new.reviewee_id) then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.closed_review_windows c where c.event_id = new.event_id) then
    raise exception 'WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- account export and purge (ADR-0017) ------------------------------------------------------------------------
create or replace function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  delete from public.user_sport_ratings where user_id = p_uid;
  delete from public.user_achievements where user_id = p_uid;
  delete from public.user_blocks where blocker_id = p_uid or blocked_id = p_uid;
  update public.event_participations set request_message = null, status_reason = null
   where user_id = p_uid and (request_message is not null or status_reason is not null);
  update public.attendance_disputes d set reason = null
    from public.event_participations p
   where p.id = d.participation_id and p.user_id = p_uid and d.reason is not null;
  delete from public.event_private_details d
   using public.events e
   where e.id = d.event_id and e.organizer_id = p_uid;
$$;

create or replace function private.export_event_data(p_uid uuid)
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
               'published_at', e.published_at, 'canceled_at', e.canceled_at, 'completed_at', e.completed_at,
               'attendance_finalized_at', e.attendance_finalized_at)
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
               'requested_at', p.requested_at, 'approved_at', p.approved_at, 'canceled_at', p.canceled_at,
               'attendance_marked_at', p.attendance_marked_at)
             order by p.requested_at)
        from public.event_participations p where p.user_id = p_uid), '[]'::jsonb),
    'attendance_disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', p.event_id, 'reason', d.reason, 'status', d.status,
               'resolution', d.resolution, 'created_at', d.created_at, 'resolved_at', d.resolved_at)
             order by d.created_at)
        from public.attendance_disputes d
        join public.event_participations p on p.id = d.participation_id
       where p.user_id = p_uid), '[]'::jsonb),
    'reviews_written', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', r.event_id, 'reviewee_id', r.reviewee_id, 'skill_score', r.skill_score,
               'fair_play', r.fair_play, 'created_at', r.created_at)
             order by r.created_at)
        from public.skill_reviews r where r.reviewer_id = p_uid), '[]'::jsonb),
    'reliability_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', r.event_id, 'kind', r.kind, 'weight', r.weight, 'occurred_at', r.occurred_at,
               'voided_at', r.voided_at, 'void_reason', r.void_reason)
             order by r.occurred_at, r.id)
        from public.reliability_events r where r.user_id = p_uid), '[]'::jsonb),
    'xp_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', x.amount, 'reason_code', x.reason_code, 'source_type', x.source_type,
               'source_id', x.source_id, 'created_at', x.created_at)
             order by x.created_at, x.id)
        from public.xp_transactions x where x.user_id = p_uid), '[]'::jsonb),
    'progress', (
      select jsonb_build_object(
               'reliability_score', up.reliability_score, 'reliability_samples', up.reliability_samples,
               'reliability_confidence', up.reliability_confidence, 'xp_total', up.xp_total,
               'computed_at', up.computed_at)
        from public.user_progress up where up.user_id = p_uid),
    'sport_ratings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', s.slug, 'rating', sr.rating, 'confidence', sr.confidence,
               'sample_events', sr.sample_events, 'computed_at', sr.computed_at)
             order by s.slug)
        from public.user_sport_ratings sr
        join public.sports s on s.id = sr.sport_id
       where sr.user_id = p_uid), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', a.code, 'sport', s.slug, 'awarded_at', a.awarded_at, 'revoked_at', a.revoked_at)
             order by a.awarded_at, a.code)
        from public.user_achievements a
        left join public.sports s on s.id = a.sport_id
       where a.user_id = p_uid), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.blocked_id, 'created_at', ub.created_at)
             order by ub.created_at, ub.blocked_id)
        from public.user_blocks ub where ub.blocker_id = p_uid), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;
