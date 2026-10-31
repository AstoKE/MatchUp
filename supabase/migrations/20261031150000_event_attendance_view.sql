-- Phase 5 / M5a: what the attendance screens read. Additive: get_event stays as installed apps know it.
-- The organizer gets the roster with marks; an approved player gets only their own row; anyone else NOT_FOUND.
create function public.get_event_attendance(p_event_id uuid)
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
begin
  select * into e from public.events x where x.id = p_event_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into me from public.event_participations p
   where p.event_id = e.id and p.user_id = v_uid and p.status = 'APPROVED';
  if e.organizer_id <> v_uid and me.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'finalized_at', e.attendance_finalized_at,
    'dispute_closes_at', e.attendance_finalized_at + interval '72 hours',
    'review_window_closes_at', e.review_window_closes_at,
    'my', case when me.id is null then null else jsonb_build_object(
      'participation_id', me.id, 'attendance', me.attendance, 'is_organizer', me.is_organizer) end,
    'roster', case when e.organizer_id <> v_uid then null else coalesce((
      select jsonb_agg(jsonb_build_object(
               'participation_id', p.id, 'display_name', pr.display_name,
               'attendance', p.attendance, 'is_organizer', p.is_organizer)
             order by p.is_organizer desc, p.requested_at, p.id)
        from public.event_participations p
        join public.profiles pr on pr.id = p.user_id
       where p.event_id = e.id and p.status = 'APPROVED'), '[]'::jsonb) end);
end;
$$;
revoke all on function public.get_event_attendance(uuid) from public, anon, authenticated;
grant execute on function public.get_event_attendance(uuid) to authenticated;
