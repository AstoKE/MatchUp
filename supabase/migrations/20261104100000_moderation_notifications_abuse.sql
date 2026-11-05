-- Phase 6 / M6: the notifications that were left, and abuse controls for new accounts (F-30). Generated from the live
-- definitions of the functions it changes; every change is one added statement or one replaced quota.

-- ---- notifications ------------------------------------------------------------------------------------------------------
-- REPORT_OUTCOME     the reporter, when a report is closed: generic, never the decision (FL-9, PHASE6_PLAN M2)
-- ACCOUNT_REINSTATED the person, after a suspension (a suspended person is shown a page, not a notification)
-- EVENT_CANCELED_BY_ADMIN the organizer, when an administrator canceled their event
-- ATTENDANCE_REMINDER the organizer, when the event has ended and attendance is not final (RATING_SYSTEM §9)
-- Payloads carry ids only. Older apps show an unknown type generically.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER'));

CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_outcome text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := private.assert_admin_aal2();
  v_note  text := private.admin_note(p_note, false);
  r       public.reports;
  v_count integer;
begin
  if p_outcome is null or p_outcome not in ('ACTIONED', 'DISMISSED') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into r from public.reports x where x.id = p_report_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status <> 'OPEN' then
    if r.status = p_outcome then
      return 0;  -- idempotent
    end if;
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.reports
     set status = p_outcome, handled_by = v_uid, handled_at = pg_catalog.now()
   where target_type = r.target_type and target_id = r.target_id and status = 'OPEN';
  get diagnostics v_count = row_count;
  -- Everybody whose report was just closed is thanked, and told nothing else: not what was decided, not about whom.
  perform private.notify(x.reporter_id, 'REPORT_OUTCOME', '{}'::jsonb, 'REPORT_OUTCOME:' || x.id)
     from public.reports x
    where x.target_type = r.target_type and x.target_id = r.target_id
      and x.handled_by = v_uid and x.handled_at = pg_catalog.now() and x.status = p_outcome;
  perform private.record_moderation(v_uid, 'REPORT_RESOLVED', r.target_type, r.target_id, r.id, p_outcome, v_note);
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reinstate_user(p_user_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_note   text := private.admin_note(p_note, true);
  v_status public.account_status;
begin
  select p.account_status into v_status from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status = 'ACTIVE' then
    return;  -- idempotent
  end if;
  if v_status <> 'SUSPENDED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.profiles set account_status = 'ACTIVE' where id = p_user_id;
  perform private.notify(p_user_id, 'ACCOUNT_REINSTATED', '{}'::jsonb,
                         'ACCOUNT_REINSTATED:' || p_user_id || ':' || extract(epoch from pg_catalog.now()));
  perform private.record_moderation(v_uid, 'USER_REINSTATED', 'USER', p_user_id, null, null, v_note);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_event(p_event_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, true);
  e      public.events;
begin
  select * into e from public.events x where x.id = p_event_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status = 'CANCELED' then
    return;  -- idempotent
  end if;
  if e.status <> 'PUBLISHED' or pg_catalog.now() >= e.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.events
     set status = 'CANCELED', canceled_at = pg_catalog.now(), cancel_reason = 'MODERATION', cancel_message = null
   where id = e.id;
  perform private.notify(p.user_id, 'EVENT_CANCELED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'EVENT_CANCELED:' || e.id || ':' || p.user_id)
     from public.event_participations p
    where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED');
  -- The organizer is told too, which the organizer's own cancel never needs to do.
  perform private.notify(e.organizer_id, 'EVENT_CANCELED_BY_ADMIN', pg_catalog.jsonb_build_object('event_id', e.id),
                         'EVENT_CANCELED_BY_ADMIN:' || e.id);
  perform private.record_moderation(v_uid, 'EVENT_CANCELED_BY_ADMIN', 'EVENT', e.id, null, null, v_note);
end;
$function$;

-- At the end of the event, and a day later; the 48 h job finalizes what is still open, so these come first. Only events of
-- the last three days, so switching this on does not wake up old history. `p_at` is "now" (tests move it).
create function private.send_attendance_reminders(p_at timestamptz default pg_catalog.now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_count integer := 0;
  v_stage text;
begin
  for r in
    select e.id, e.organizer_id, e.ends_at
      from public.events e
     where e.status in ('PUBLISHED', 'COMPLETED') and e.attendance_finalized_at is null
       and e.ends_at <= p_at and e.ends_at > p_at - interval '3 days'
       and exists (select 1 from public.event_participations q
                    where q.event_id = e.id and q.status = 'APPROVED' and not q.is_organizer)
     order by e.ends_at limit 500
  loop
    foreach v_stage in array array['DUE', 'LATE'] loop
      continue when v_stage = 'LATE' and r.ends_at + interval '24 hours' > p_at;
      if not exists (select 1 from public.notifications n where n.dedupe_key = 'ATTENDANCE_REMINDER:' || r.id || ':' || v_stage) then
        perform private.notify(r.organizer_id, 'ATTENDANCE_REMINDER',
                               pg_catalog.jsonb_build_object('event_id', r.id, 'stage', v_stage),
                               'ATTENDANCE_REMINDER:' || r.id || ':' || v_stage);
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.send_attendance_reminders(timestamptz) from public, anon, authenticated;
select cron.schedule('attendance-reminders', '*/15 * * * *', 'select private.send_attendance_reminders()');

-- ---- accounts younger than seven days (SECURITY: tighter quotas, not a ban) ------------------------------------------------
insert into public.app_config (key, value) values
  ('quota.new_account_days', '7'::jsonb),
  ('quota.new_account_max_events_per_day', '2'::jsonb),
  ('quota.new_account_max_open_requests', '10'::jsonb)
on conflict (key) do nothing;

-- The limit that applies to this person: the usual one, or the tighter one while the account is new.
create function private.account_quota(p_uid uuid, p_key text, p_default integer, p_new_key text, p_new_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when exists (select 1 from public.profiles p
                         where p.id = p_uid
                           and p.created_at > pg_catalog.now() - pg_catalog.make_interval(days => private.config_int('quota.new_account_days', 7)))
           then least(private.config_int(p_key, p_default), private.config_int(p_new_key, p_new_default))
           else private.config_int(p_key, p_default)
         end;
$$;
revoke all on function private.account_quota(uuid, text, integer, text, integer) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_event(p_client_request_id uuid, p_input jsonb, p_publish boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     >= private.account_quota(v_uid, 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2) then
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
$function$;

CREATE OR REPLACE FUNCTION public.request_join(p_event_id uuid, p_message text DEFAULT NULL::text, p_position_id uuid DEFAULT NULL::uuid, p_invite_token text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     >= private.account_quota(v_uid, 'quota.max_open_requests', 20, 'quota.new_account_max_open_requests', 10) then
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
$function$;

-- ---- display names: no links, addresses or phone numbers (SECURITY §content) ----------------------------------------------
-- Profanity is not checked: it needs a list somebody owns (docs/PHASE6_PLAN.md M6).
create or replace function private.clean_display_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_name);
begin
  if v is null or pg_catalog.char_length(v) not between 2 and 40 or v ~ '[[:cntrl:]]'
     or v ~* '(https?:|www\.|@|\.(com|net|org|ru|xyz|io|me|info|tr)\M)'
     or pg_catalog.regexp_replace(v, '[ ().-]', '', 'g') ~ '[0-9]{7,}' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
