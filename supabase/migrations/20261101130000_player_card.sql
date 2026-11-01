-- Phase 6 / M3: what the player card reads (docs/PHASE6_PLAN.md). The roster and the request queue gain the user id so a name
-- can open the card; the id already reaches fellow players through get_event_reviews. get_player_card is what finally gives
-- profile_visibility, show_reliability and show_badges an effect. Additive: older apps ignore the new keys.

-- Have these two met through an event: organizer and anyone who asked, or both approved in the same one.
create function private.is_event_peer(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e
                   join public.event_participations p on p.event_id = e.id
                  where (e.organizer_id = p_a and p.user_id = p_b) or (e.organizer_id = p_b and p.user_id = p_a))
      or exists (select 1 from public.event_participations mine
                   join public.event_participations theirs on theirs.event_id = mine.event_id
                  where mine.user_id = p_a and theirs.user_id = p_b
                    and mine.status = 'APPROVED' and theirs.status = 'APPROVED');
$$;
revoke all on function private.is_event_peer(uuid, uuid) from public, anon, authenticated;

-- NOT_FOUND unless the profile is public or the viewer has met this person, and always when blocked either way: indistinguishable
-- from someone who does not exist. Reliability from three signals (RATING_SYSTEM §4.2) and only if the player shows it; the same
-- for badges. XP is not a setting of its own: it is shown as a level, and only with badges.
create function public.get_player_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  pr    public.profiles;
  s     public.user_settings;
  up    public.user_progress;
begin
  select * into pr from public.profiles p where p.id = p_user_id and p.account_status = 'ACTIVE';
  if not found or private.is_blocked_pair(v_uid, p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into s from public.user_settings x where x.user_id = p_user_id;
  if p_user_id <> v_uid and not private.is_admin() and s.profile_visibility is distinct from 'EVERYONE'
     and not private.is_event_peer(v_uid, p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into up from public.user_progress x where x.user_id = p_user_id;
  return pg_catalog.jsonb_build_object(
    'user_id', pr.id,
    'display_name', pr.display_name,
    'bio', pr.bio,
    'is_me', p_user_id = v_uid,
    'sports', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'sport_id', u.sport_id, 'level', u.self_assessed_level, 'rating', r.rating)
             order by u.sport_id)
        from public.user_sport_profiles u
        left join public.user_sport_ratings r on r.user_id = u.user_id and r.sport_id = u.sport_id
       where u.user_id = p_user_id), '[]'::jsonb),
    'reliability', case when s.show_reliability
                         and up.reliability_samples >= private.rating_const('reliability.min_signals_to_show')
                        then up.reliability_score end,
    'xp_total', case when s.show_badges then coalesce(up.xp_total, 0) end,
    'badges', case when s.show_badges then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'code', a.code, 'sport_id', a.sport_id, 'names', d.names, 'descriptions', d.descriptions)
             order by a.awarded_at desc, a.code)
        from public.user_achievements a
        join public.achievement_definitions d on d.code = a.code
       where a.user_id = p_user_id and a.revoked_at is null), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;
revoke all on function public.get_player_card(uuid) from public, anon, authenticated;
grant execute on function public.get_player_card(uuid) to authenticated;

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
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', pr.id, 'display_name', pr.display_name)
                                    order by p.approved_at, p.id)
          from (select x.id, x.user_id, x.approved_at from public.event_participations x
                 where x.event_id = e.id and x.status = 'APPROVED' and not x.is_organizer
                   and (v_organizer or not private.is_blocked_pair(v_uid, x.user_id))
                 order by x.approved_at, x.id limit 100) p
          join public.profiles pr on pr.id = p.user_id), '[]'::jsonb) end
  );
end;
$$;

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
                 'user_id', p.user_id,
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
