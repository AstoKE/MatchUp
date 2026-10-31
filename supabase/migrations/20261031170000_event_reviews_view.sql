-- Phase 5 / M5b: what the review screen reads. Who I may review and whether I already did, never anyone's score: reviews stay
-- double-blind (RATING_SYSTEM §3.3). Mirrors submit_reviews' rules, which stay the authority.
-- Organizer without a row (not playing): can_review false. Anyone else who is not an approved participant: NOT_FOUND.
create function public.get_event_reviews(p_event_id uuid)
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
       where p.event_id = e.id and p.user_id <> v_uid and p.status = 'APPROVED' and p.attendance = 'PRESENT'), '[]'::jsonb) end);
end;
$$;
revoke all on function public.get_event_reviews(uuid) from public, anon, authenticated;
grant execute on function public.get_event_reviews(uuid) to authenticated;
