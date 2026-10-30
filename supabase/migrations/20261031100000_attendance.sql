-- Phase 5 / M1: attendance and finalization (F-23). DATABASE §6.3, RATING_SYSTEM §2, docs/PHASE5_PLAN.md.
-- Marks, finalization, disputes and the two pg_cron sweeps. Reliability events, XP and reviews come in M2/M3 and
-- hook into private.finalize_event_row(). No notifications yet (the inbox needs matching types; M2).

-- ---- events: finalization state ------------------------------------------------------------------------
alter table public.events
  add column attendance_finalized_at timestamptz,
  add column review_window_closes_at timestamptz,
  add constraint events_finalized check (attendance_finalized_at is null or status = 'COMPLETED'),
  add constraint events_review_window check ((review_window_closes_at is null) = (attendance_finalized_at is null));

-- ---- participations: who marked, when -----------------------------------------------------------------
alter table public.event_participations
  add column attendance_marked_at timestamptz,
  add column attendance_marked_by uuid;

-- The organizer's own row is PRESENT by default (self-attested, never disputable; RATING_SYSTEM §2).
update public.event_participations
   set attendance = 'PRESENT', attendance_marked_at = created_at, attendance_marked_by = user_id
 where is_organizer and status = 'APPROVED' and attendance = 'NOT_CONFIRMED';

-- ---- triggers ------------------------------------------------------------------------------------------
-- I-7 stays: COMPLETED and CANCELED events are frozen, with one exception: the one-time finalization of a
-- completed event may set exactly attendance_finalized_at and review_window_closes_at.
create or replace function private.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ends_at := new.starts_at + pg_catalog.make_interval(mins => new.duration_minutes::integer);
  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
    if old.status in ('CANCELED', 'COMPLETED') then
      if not (old.status = 'COMPLETED' and new.status = 'COMPLETED'
              and old.attendance_finalized_at is null and new.attendance_finalized_at is not null
              and (pg_catalog.to_jsonb(new) - 'attendance_finalized_at' - 'review_window_closes_at' - 'updated_at')
                = (pg_catalog.to_jsonb(old) - 'attendance_finalized_at' - 'review_window_closes_at' - 'updated_at')) then
        raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- terminal and frozen (I-7)
      end if;
      return new;
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

-- Adds the attendance transitions of DATABASE §6.3 (I-3) and the organizer's default PRESENT.
create or replace function private.participations_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not (new.status in ('REQUESTED', 'WAITLISTED') or (new.status = 'APPROVED' and new.is_organizer)) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;
    if new.is_organizer then
      new.attendance := 'PRESENT';
      new.attendance_marked_at := pg_catalog.now();
      new.attendance_marked_by := new.user_id;
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
  if new.attendance is distinct from old.attendance then
    if old.is_organizer or not (
         (old.attendance = 'NOT_CONFIRMED' and new.attendance in ('PRESENT', 'ABSENT'))
      or (old.attendance = 'PRESENT'       and new.attendance = 'ABSENT')
      or (old.attendance = 'ABSENT'        and new.attendance in ('PRESENT', 'DISPUTED'))
      or (old.attendance = 'DISPUTED'      and new.attendance in ('PRESENT', 'ABSENT'))) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-3, §6.3
    end if;
  end if;
  return new;
end;
$$;

-- ---- disputes ------------------------------------------------------------------------------------------
create table public.attendance_disputes (
  participation_id uuid primary key references public.event_participations (id) on delete cascade,
  reason           text check (reason is null or char_length(reason) between 1 and 500),  -- nulled on account purge
  status           text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolution       public.attendance_status check (resolution in ('PRESENT', 'ABSENT')),
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz not null default pg_catalog.now(),
  constraint attendance_disputes_resolved check (
    (status = 'RESOLVED') = (resolution is not null and resolved_by is not null and resolved_at is not null))
);
comment on table public.attendance_disputes is
  'A player disputes an ABSENT mark within 72 h of finalization; resolved by a platform admin (PHASE5_PLAN M1).';
alter table public.attendance_disputes enable row level security;
grant select on public.attendance_disputes to authenticated;
create policy attendance_disputes_select on public.attendance_disputes for select to authenticated
  using (
    exists (select 1 from public.event_participations p
             where p.id = participation_id
               and (p.user_id = (select auth.uid()) or private.is_event_organizer(p.event_id)))
    or private.is_admin());

-- ---- finalization --------------------------------------------------------------------------------------
-- The single place that finalizes an event: M3 adds reliability events, XP and badge evaluation here.
-- The caller holds the event row lock and has checked the event is COMPLETED and not finalized yet.
create function private.finalize_event_row(p_event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.events
     set attendance_finalized_at = pg_catalog.now(),
         review_window_closes_at = pg_catalog.now() + interval '72 hours'
   where id = p_event and status = 'COMPLETED' and attendance_finalized_at is null;
$$;
revoke all on function private.finalize_event_row(uuid) from public, anon, authenticated;

-- Locks the event and one participation for an attendance write by the organizer.
create function private.lock_participation_for_attendance(p_uid uuid, p_participation uuid)
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
  if part_row.is_organizer or part_row.status <> 'APPROVED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- the organizer's own row is self-attested (I-7)
  end if;
  if event_row.status not in ('PUBLISHED', 'COMPLETED')
     or (event_row.status = 'PUBLISHED' and pg_catalog.now() < event_row.starts_at)
     or event_row.attendance_finalized_at is not null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- not started, canceled, or frozen
  end if;
  return next;
end;
$$;
revoke all on function private.lock_participation_for_attendance(uuid, uuid) from public, anon, authenticated;

-- ---- RPCs ----------------------------------------------------------------------------------------------
create function public.mark_attendance(p_participation_id uuid, p_value public.attendance_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_onboarded_user();
  p      public.event_participations;
  v_lock record;
begin
  if p_value not in ('PRESENT', 'ABSENT') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into v_lock from private.lock_participation_for_attendance(v_uid, p_participation_id);
  p := v_lock.part_row;
  if p.attendance = p_value then
    return;  -- idempotent
  end if;
  if p.attendance = 'DISPUTED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- only an admin resolves it
  end if;
  update public.event_participations
     set attendance = p_value, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_uid
   where id = p.id;
end;
$$;

-- The organizer freezes the marks. A started event that is still PUBLISHED is completed first.
create function public.finalize_attendance(p_event_id uuid)
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
  if e.attendance_finalized_at is not null then
    return;  -- idempotent
  end if;
  if e.status not in ('PUBLISHED', 'COMPLETED')
     or (e.status = 'PUBLISHED' and pg_catalog.now() < e.starts_at) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if e.status = 'PUBLISHED' then
    update public.events set status = 'COMPLETED', completed_at = pg_catalog.now() where id = e.id;
  end if;
  perform private.finalize_event_row(e.id);
end;
$$;

-- A player disputes their own ABSENT mark within 72 h after finalization.
create function public.dispute_attendance(p_participation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_onboarded_user();
  v_event uuid;
  e       public.events;
  p       public.event_participations;
begin
  select ep.event_id into v_event from public.event_participations ep where ep.id = p_participation_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into e from public.events x where x.id = v_event for update;
  select * into p from public.event_participations ep where ep.id = p_participation_id for update;
  if p.user_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';  -- not theirs: indistinguishable from missing
  end if;
  if p.attendance = 'DISPUTED' then
    return;  -- idempotent
  end if;
  if p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p.is_organizer or p.attendance <> 'ABSENT' or e.attendance_finalized_at is null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if pg_catalog.now() > e.attendance_finalized_at + interval '72 hours' then
    raise exception 'WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  insert into public.attendance_disputes (participation_id, reason) values (p.id, pg_catalog.btrim(p_reason));
  update public.event_participations set attendance = 'DISPUTED' where id = p.id;
end;
$$;

-- Platform admins only, with MFA (aal2), audited. No screen yet: the admin console is Phase 6.
create function public.admin_resolve_attendance_dispute(p_participation_id uuid, p_resolution public.attendance_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_onboarded_user();
  v_event uuid;
  p       public.event_participations;
begin
  if not private.is_admin() or (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_resolution not in ('PRESENT', 'ABSENT') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select ep.event_id into v_event from public.event_participations ep where ep.id = p_participation_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform 1 from public.events x where x.id = v_event for update;
  select * into p from public.event_participations ep where ep.id = p_participation_id for update;
  if p.attendance <> 'DISPUTED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.attendance_disputes
     set status = 'RESOLVED', resolution = p_resolution, resolved_by = v_uid, resolved_at = pg_catalog.now()
   where participation_id = p.id;
  update public.event_participations
     set attendance = p_resolution, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_uid
   where id = p.id;
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'ATTENDANCE_DISPUTE_RESOLVED', p.id, pg_catalog.jsonb_build_object('resolution', p_resolution));
end;
$$;

revoke all on function public.mark_attendance(uuid, public.attendance_status) from public, anon, authenticated;
revoke all on function public.finalize_attendance(uuid) from public, anon, authenticated;
revoke all on function public.dispute_attendance(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_resolve_attendance_dispute(uuid, public.attendance_status) from public, anon, authenticated;
grant execute on function public.mark_attendance(uuid, public.attendance_status) to authenticated;
grant execute on function public.finalize_attendance(uuid) to authenticated;
grant execute on function public.dispute_attendance(uuid, text) to authenticated;
grant execute on function public.admin_resolve_attendance_dispute(uuid, public.attendance_status) to authenticated;

-- ---- scheduled sweeps (pg_cron, run as the owner role; idempotent, skip rows another session holds) -------
-- Completes published events whose end has passed.
create function private.complete_due_events()
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    select id from public.events
     where status = 'PUBLISHED' and ends_at <= pg_catalog.now()
     order by ends_at limit 500 for update skip locked),
  done as (
    update public.events e
       set status = 'COMPLETED', completed_at = pg_catalog.now()
      from due where e.id = due.id
    returning e.id)
  select pg_catalog.count(*)::integer from done;
$$;
revoke all on function private.complete_due_events() from public, anon, authenticated;

-- Finalizes completed events 48 h after completion. NOT_CONFIRMED rows stay untouched: neutral (§6.3).
create function private.auto_finalize_attendance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_count integer := 0;
begin
  for v_event in
    select id from public.events
     where status = 'COMPLETED' and attendance_finalized_at is null
       and completed_at <= pg_catalog.now() - interval '48 hours'
     order by completed_at limit 500 for update skip locked
  loop
    perform private.finalize_event_row(v_event);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.auto_finalize_attendance() from public, anon, authenticated;

select cron.schedule('complete-due-events', '*/10 * * * *', 'select private.complete_due_events()');
select cron.schedule('auto-finalize-attendance', '*/15 * * * *', 'select private.auto_finalize_attendance()');

-- ---- account export and purge (ADR-0017: every per-user table takes part) ------------------------------
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
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;

create or replace function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  update public.event_participations set request_message = null, status_reason = null
   where user_id = p_uid and (request_message is not null or status_reason is not null);
  update public.attendance_disputes d set reason = null
    from public.event_participations p
   where p.id = d.participation_id and p.user_id = p_uid and d.reason is not null;
  delete from public.event_private_details d
   using public.events e
   where e.id = d.event_id and e.organizer_id = p_uid;
$$;
