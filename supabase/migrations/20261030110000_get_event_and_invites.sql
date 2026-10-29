-- Phase 3 completion: get_event and the invite flow.
--
-- get_event(event, invite token): the one participant-facing read of an event page, open to guests (D-09).
-- Visibility is exactly what the RLS policies gave (a PUBLISHED public event, or an invite-only one with its
-- token, for everybody; any status for the organizer and anyone with a participation row; admins), plus the
-- organizer's account being ACTIVE for people who are not involved (as in search_events). It returns:
--   * the public fields (no organizer id, no invite token),
--   * `is_organizer`, the viewer's own participation status and the organizer's display name,
--   * the private details (place, address, notes) only for the organizer and APPROVED players,
--   * the approved players' display names only for the organizer and APPROVED players (everyone else gets the
--     count, which is already public) and `participants_visible` saying which case it is,
--   * the invite token only for the organizer of an invite-only event (to build the link to share).
-- Anything the viewer may not see is SQL null (indistinguishable from "does not exist").
--
-- request_join gains an optional invite token: an INVITE_ONLY event answers NOT_FOUND without the right
-- one (docs/SECURITY.md S-18). The old three-argument function is dropped and replaced by the four-argument
-- one with a default, so installed apps that call it with three named arguments keep working.

create function public.get_event(p_event_id uuid, p_invite_token text default null)
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
                 order by x.approved_at, x.id limit 100) p
          join public.profiles pr on pr.id = p.user_id), '[]'::jsonb) end
  );
end;
$$;
comment on function public.get_event(uuid, text) is
  'Event page read for guests and users (D-09): public fields, private details and the roster only for the organizer and approved players.';

drop function public.request_join(uuid, text, uuid);

create function public.request_join(
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

revoke all on function public.get_event(uuid, text) from public, anon, authenticated;
grant execute on function public.get_event(uuid, text) to anon, authenticated;
revoke all on function public.request_join(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.request_join(uuid, text, uuid, text) to authenticated;
