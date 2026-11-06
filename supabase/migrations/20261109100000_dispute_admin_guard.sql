-- Phase 7 / M2 (security review, finding S7-1): the dispute resolution of Phase 5 checked "admin and aal2" itself and
-- answered NOT_ALLOWED to an administrator without the second factor, where every other admin_* function (Phase 6 M4)
-- answers MFA_REQUIRED through private.assert_admin_aal2, which the console uses to ask for the code. Same guard now; the
-- rest of the function is the live definition, unchanged. An administrator no longer has to be onboarded as a player.
create or replace function public.admin_resolve_attendance_dispute(p_participation_id uuid, p_resolution attendance_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := private.assert_admin_aal2();
  v_event uuid;
  p       public.event_participations;
begin
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
  perform private.lock_rating_user(p.user_id);
  update public.attendance_disputes
     set status = 'RESOLVED', resolution = p_resolution, resolved_by = v_uid, resolved_at = pg_catalog.now()
   where participation_id = p.id;
  update public.event_participations
     set attendance = p_resolution, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_uid
   where id = p.id;
  perform private.apply_attendance_outcome(p.id);
  if p_resolution = 'PRESENT' then
    perform private.award_attendance_xp(v_event, p.user_id);
  end if;
  perform private.recompute_user_progress(p.user_id);
  perform private.evaluate_achievements(p.user_id, v_event);
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'ATTENDANCE_DISPUTE_RESOLVED', p.id, pg_catalog.jsonb_build_object('resolution', p_resolution));
end;
$function$;
