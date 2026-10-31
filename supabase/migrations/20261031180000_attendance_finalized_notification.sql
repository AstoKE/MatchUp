-- Phase 5: tells approved players that attendance is final, by the organizer or by the 48 h job: they can see their mark, dispute
-- it and review (PHASE5_PLAN decision 2). The payload is the event id only (no PII). Older apps show an unknown type generically.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED'));

create or replace function private.apply_finalization(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e      public.events;
  v_user uuid;
  v_part uuid;
begin
  select * into e from public.events x where x.id = p_event;
  -- All involved users are locked first, in id order, so two finalizations with common players cannot deadlock.
  for v_user in
    select u from (select p.user_id as u from public.event_participations p where p.event_id = e.id
                   union select e.organizer_id) q order by u
  loop
    perform private.lock_rating_user(v_user);
  end loop;
  for v_part in select p.id from public.event_participations p where p.event_id = e.id order by p.user_id loop
    perform private.apply_attendance_outcome(v_part);
  end loop;
  for v_user in
    select p.user_id from public.event_participations p
     where p.event_id = e.id and p.status = 'APPROVED' and p.attendance = 'PRESENT' order by p.user_id
  loop
    perform private.award_attendance_xp(e.id, v_user);
  end loop;
  perform private.award_organizer_xp(e.id);
  for v_user in
    select u from (select p.user_id as u from public.event_participations p where p.event_id = e.id
                   union select e.organizer_id) q order by u
  loop
    perform private.recompute_user_progress(v_user);
    perform private.evaluate_achievements(v_user, e.id);
  end loop;
  for v_part, v_user in
    select p.id, p.user_id from public.event_participations p
     where p.event_id = e.id and p.status = 'APPROVED' and not p.is_organizer
  loop
    perform private.notify(v_user, 'ATTENDANCE_FINALIZED', pg_catalog.jsonb_build_object('event_id', e.id),
                           'ATTENDANCE_FINALIZED:' || v_part);
  end loop;
end;
$$;
