-- Redesign / organizer management (docs/design.md §5.7): what an organizer weighs a player by, beyond the self-assessed level.
-- Additive: older apps ignore the new keys. RATING_SYSTEM §9: organizers evaluating a request see this game-relevant subset
-- whatever the profile's visibility flags say, and the player is told so before asking. Reliability appears only from the
-- same number of signals the player's own profile needs, so "New player" stays the honest answer (§4.2).
create or replace function public.list_event_requests(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e     public.events;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into e from public.events x where x.id = p_event_id;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(r.item order by r.ord, r.at)
      from (
        select case p.status when 'REQUESTED' then 1 when 'WAITLISTED' then 2 else 3 end as ord,
               coalesce(p.waitlisted_at, p.approved_at, p.requested_at) as at,
               pg_catalog.jsonb_build_object(
                 'id', p.id,
                 'status', p.status,
                 'display_name', pr.display_name,
                 'level', usp.self_assessed_level,
                 'message', p.request_message,
                 'position_id', p.preferred_position_id,
                 'requested_at', p.requested_at,
                 'request_count', p.request_count,
                 'rating', sr.rating,
                 'reliability', case when up.reliability_samples >= private.rating_const('reliability.min_signals_to_show')
                                     then up.reliability_score end) as item
          from public.event_participations p
          join public.profiles pr on pr.id = p.user_id
          left join public.user_sport_profiles usp on usp.user_id = p.user_id and usp.sport_id = e.sport_id
          left join public.user_sport_ratings sr on sr.user_id = p.user_id and sr.sport_id = e.sport_id
          left join public.user_progress up on up.user_id = p.user_id
         where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED')
         order by 1, 2
         limit 200
      ) r), '[]'::jsonb));
end;
$$;
