-- Founder's decision (RATING_SYSTEM §12.2): an attendance counts for badges only in an event with two verified-present
-- players besides the organizer, for everyone, like attendance XP (§10.1). An organizer and one friend earn no badges.
-- Awards already made stay; none exist outside test data.
create or replace function private.verified_attendances_by_sport(p_uid uuid)
returns table (sport_id uuid, attendances integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.sport_id, pg_catalog.count(*)::integer
    from public.event_participations p
    join public.events e on e.id = p.event_id
   where p.user_id = p_uid and p.status = 'APPROVED' and p.attendance = 'PRESENT'
     and e.attendance_finalized_at is not null
     and (select pg_catalog.count(*) from public.event_participations o
           where o.event_id = e.id and not o.is_organizer and o.status = 'APPROVED' and o.attendance = 'PRESENT')
         >= private.rating_const('xp.min_present_others')
   group by e.sport_id;
$$;
