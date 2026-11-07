-- Phase 8 / M3: avatars and profile photos (docs/PHASE8_PLAN.md M3, ADR-0027).
--
-- * profiles.gender: private. Only the person reads it (get_my_avatar); it chooses which avatar set is offered first.
--   Never granted as a column, never in another person's view, never in analytics.
-- * profiles.avatar_key: the chosen drawing ('f-tennis', 'm-general', 'letters'), readable like the display name.
-- * profiles.avatar_path: an own photo in the private bucket `avatars`, at '<user id>/<uuid>.jpg'. It outranks the key.
--   Whether a photo's bytes can be read is the storage policy's decision, with the same rule as get_player_card:
--   the owner, an administrator with a second factor, or a signed-in person who is not blocked and may see the profile
--   (visibility EVERYONE, or an event peer). Only the photo the profile points at is readable.
-- * Bytes cannot be deleted from SQL (storage.protect_delete): the app deletes them through the Storage API, the
--   owner (replace, remove, account deletion) or an administrator (moderation). The purge clears the reference.

-- ---- columns --------------------------------------------------------------------------------------------------------
create type public.profile_gender as enum ('FEMALE', 'MALE', 'UNDISCLOSED');

alter table public.profiles
  add column gender public.profile_gender,
  add column avatar_key text check (avatar_key is null or avatar_key ~ '^(letters|[fm]-(general|football|futsal|basketball|volleyball|tennis|padel|badminton|table-tennis|running|walking))$');

-- Readable like the display name (the existing column grants list every readable column; gender is not one of them).
grant select (avatar_key) on public.profiles to authenticated;

-- ---- photo changes per day (private: not reachable through the Data API) ---------------------------------------------
create table private.avatar_uploads (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index avatar_uploads_user_time on private.avatar_uploads (user_id, created_at);
alter table private.avatar_uploads enable row level security;
-- No policies: only SECURITY DEFINER functions touch it.
revoke all on private.avatar_uploads from public, anon, authenticated;

insert into public.app_config (key, value) values ('quota.max_avatar_photos_per_day', '10'::jsonb)
on conflict (key) do nothing;

-- ---- the bucket -----------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- '<uuid>/<uuid>.jpg' → the owner's id, or null for any other name.
create function private.avatar_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
              then pg_catalog.split_part(p_name, '/', 1)::uuid end;
$$;

-- Upload: into one's own folder, as an active onboarded person, at most three objects at a time (replace = upload, point,
-- then delete the old one).
create function private.can_upload_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and private.avatar_owner(p_name) = (select auth.uid())
     and exists (select 1 from public.profiles p
                  where p.id = (select auth.uid()) and p.account_status = 'ACTIVE' and p.onboarded_at is not null)
     and (select pg_catalog.count(*) from storage.objects o
           where o.bucket_id = 'avatars' and private.avatar_owner(o.name) = (select auth.uid())) < 3;
$$;

-- Read (and sign a URL): the owner sees their folder; others see only the photo a profile points at, with the
-- get_player_card rule.
create function private.can_read_avatar(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid := private.avatar_owner(p_name);
begin
  if v_uid is null or v_owner is null then
    return false;
  end if;
  if v_owner = v_uid then
    return true;
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = v_owner and p.account_status = 'ACTIVE' and p.avatar_path = p_name) then
    return false;
  end if;
  if private.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2' then
    return true;
  end if;
  if private.is_blocked_pair(v_uid, v_owner) then
    return false;
  end if;
  return exists (select 1 from public.user_settings s where s.user_id = v_owner and s.profile_visibility = 'EVERYONE')
      or private.is_event_peer(v_uid, v_owner);
end;
$$;

-- Delete: the owner, or an administrator with a second factor (moderation).
create function private.can_delete_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (private.avatar_owner(p_name) = (select auth.uid())
          or (private.is_admin() and (select auth.jwt() ->> 'aal') = 'aal2'));
$$;

revoke all on function private.avatar_owner(text) from public, anon, authenticated;
revoke all on function private.can_upload_avatar(text) from public, anon, authenticated;
revoke all on function private.can_read_avatar(text) from public, anon, authenticated;
revoke all on function private.can_delete_avatar(text) from public, anon, authenticated;
grant execute on function private.avatar_owner(text) to authenticated;
grant execute on function private.can_upload_avatar(text) to authenticated;
grant execute on function private.can_read_avatar(text) to authenticated;
grant execute on function private.can_delete_avatar(text) to authenticated;

-- No update policy: an object is never overwritten (no upsert), only replaced by a new name.
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_upload_avatar(name));
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and private.can_read_avatar(name));
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and private.can_delete_avatar(name));

-- ---- RPCs -----------------------------------------------------------------------------------------------------------
-- The caller's own avatar settings, gender included (it is never readable any other way).
create function public.get_my_avatar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
  p     public.profiles;
begin
  select * into p from public.profiles x where x.id = v_uid;
  return pg_catalog.jsonb_build_object('gender', p.gender, 'avatar_key', p.avatar_key, 'avatar_path', p.avatar_path,
                                       'display_name', p.display_name);
end;
$$;

-- Asked while onboarding (the app calls it right after complete_onboarding) and changeable from the profile.
create function public.set_my_gender(p_gender public.profile_gender)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  if p_gender is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.profiles set gender = p_gender where id = v_uid;
end;
$$;

-- A drawing (or 'letters'). It replaces a photo: the app deletes the photo's bytes first.
create function public.set_my_avatar(p_avatar_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  if p_avatar_key is null
     or p_avatar_key !~ '^(letters|[fm]-(general|football|futsal|basketball|volleyball|tennis|padel|badminton|table-tennis|running|walking))$' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.profiles set avatar_key = p_avatar_key, avatar_path = null where id = v_uid;
end;
$$;

-- Points the profile at a photo the caller has just uploaded. Returns the photo it replaces (for the app to delete).
create function public.set_my_avatar_photo(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  v_old text;
begin
  if p_path is null or private.avatar_owner(p_path) is distinct from v_uid
     or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from private.avatar_uploads a
       where a.user_id = v_uid and a.created_at > pg_catalog.now() - interval '1 day')
     >= private.config_int('quota.max_avatar_photos_per_day', 10) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  select p.avatar_path into v_old from public.profiles p where p.id = v_uid for update;
  update public.profiles set avatar_path = p_path where id = v_uid;
  insert into private.avatar_uploads (user_id) values (v_uid);
  return case when v_old is distinct from p_path then v_old end;
end;
$$;

-- Removes the reference to the caller's photo (after the app deleted the bytes, or before an account deletion).
create function public.clear_my_avatar_photo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  update public.profiles set avatar_path = null where id = v_uid;
end;
$$;

-- ---- moderation: an administrator removes a photo ---------------------------------------------------------------------
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
  'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED'));
alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED'));

-- Clears the photo (the person keeps their drawing) and returns its path, for the console to delete the bytes.
create function public.admin_remove_avatar_photo(p_user_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, true);
  v_path text;
begin
  select p.avatar_path into v_path from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_path is null then
    return null;  -- idempotent
  end if;
  update public.profiles set avatar_path = null where id = p_user_id;
  perform private.record_moderation(v_uid, 'AVATAR_REMOVED', 'USER', p_user_id, null, null, v_note);
  return v_path;
end;
$$;

revoke all on function public.get_my_avatar() from public, anon, authenticated;
revoke all on function public.set_my_gender(public.profile_gender) from public, anon, authenticated;
revoke all on function public.set_my_avatar(text) from public, anon, authenticated;
revoke all on function public.set_my_avatar_photo(text) from public, anon, authenticated;
revoke all on function public.clear_my_avatar_photo() from public, anon, authenticated;
revoke all on function public.admin_remove_avatar_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.get_my_avatar() to authenticated;
grant execute on function public.set_my_gender(public.profile_gender) to authenticated;
grant execute on function public.set_my_avatar(text) to authenticated;
grant execute on function public.set_my_avatar_photo(text) to authenticated;
grant execute on function public.clear_my_avatar_photo() to authenticated;
grant execute on function public.admin_remove_avatar_photo(uuid, text) to authenticated;

-- ---- additive: avatars in the reads that show a person (same signatures; new keys only) -------------------------------
CREATE OR REPLACE FUNCTION public.get_player_card(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'avatar_key', pr.avatar_key,
    'avatar_path', pr.avatar_path,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_event(p_event_id uuid, p_invite_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare
  v_uid       uuid := (select auth.uid());
  e           public.events;
  d           public.event_private_details;
  v_my        public.participation_status;
  v_organizer boolean;
  v_involved  boolean;
  v_inside    boolean;
  v_name      text;
  v_avatar    text;
  v_photo     text;
  v_venue     uuid;
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
  -- Place, address, pin, notes and the roster: the organizer and approved players (the same rule as the RLS policy).
  v_inside := v_organizer or coalesce(v_my = 'APPROVED', false);
  if v_inside then
    select * into d from public.event_private_details x where x.event_id = e.id;
    v_venue := d.venue_id;
  elsif e.location_visibility = 'PUBLIC' then
    select x.venue_id into v_venue from public.event_private_details x where x.event_id = e.id;
  end if;
  select o.display_name, o.avatar_key, o.avatar_path into v_name, v_avatar, v_photo
    from public.profiles o where o.id = e.organizer_id;

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
    'public_point', private.point_json(e.public_point),
    'public_point_precision', e.public_point_precision,
    'venue', private.venue_brief(v_venue),
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
    -- Phase 8 / M3: the organizer's avatar. The photo's path goes only to signed-in people; whether its bytes can be
    -- read is decided by the storage policy (private.can_read_avatar).
    'organizer_avatar_key', v_avatar,
    'organizer_avatar_path', case when v_uid is not null then v_photo end,
    'invite_token', case when v_organizer and e.visibility = 'INVITE_ONLY' then e.invite_token end,
    'private', case when v_inside and d.event_id is not null then pg_catalog.jsonb_build_object(
                 'location_label', d.location_label,
                 'address_text', d.address_text,
                 'participant_notes', d.participant_notes,
                 'point', private.point_json(d.exact_point)) end,
    'participants_visible', v_inside,
    'participants', case when v_inside then coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', pr.id, 'display_name', pr.display_name,
                                                              'avatar_key', pr.avatar_key, 'avatar_path', pr.avatar_path)
                                    order by p.approved_at, p.id)
          from (select x.id, x.user_id, x.approved_at from public.event_participations x
                 where x.event_id = e.id and x.status = 'APPROVED' and not x.is_organizer
                   and (v_organizer or not private.is_blocked_pair(v_uid, x.user_id))
                 order by x.approved_at, x.id limit 100) p
          join public.profiles pr on pr.id = p.user_id), '[]'::jsonb) end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.profiles;
begin
  perform private.assert_admin_aal2();
  select * into p from public.profiles x where x.id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'bio', p.bio, 'avatar_key', p.avatar_key, 'avatar_path', p.avatar_path,
    'account_status', p.account_status, 'created_at', p.created_at,
    'is_admin', exists (select 1 from public.platform_admins a where a.user_id = p.id and a.revoked_at is null),
    'events_organized', (select pg_catalog.count(*) from public.events e where e.organizer_id = p.id and e.status <> 'DRAFT'),
    'events_joined', (select pg_catalog.count(*) from public.event_participations q
                       where q.user_id = p.id and q.status = 'APPROVED' and not q.is_organizer),
    'reports_open', (select pg_catalog.count(*) from public.reports r
                      where r.target_type = 'USER' and r.target_id = p.id and r.status = 'OPEN'),
    'reports_total', (select pg_catalog.count(*) from public.reports r where r.target_type = 'USER' and r.target_id = p.id),
    'no_shows_30d', (select pg_catalog.count(*) from public.reliability_events z
                      where z.user_id = p.id and z.kind = 'NO_SHOW' and z.voided_at is null
                        and z.occurred_at > pg_catalog.now() - interval '30 days'),
    'blocked_by', (select pg_catalog.count(*) from public.user_blocks b where b.blocked_id = p.id),
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'action', h.action, 'outcome', h.outcome, 'note', h.note, 'created_at', h.created_at)
             order by h.id desc)
        from (select * from public.moderation_actions m
               where m.target_type = 'USER' and m.target_id = p.id order by m.id desc limit 20) h), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('export:' || v_uid::text, 0));
  if exists (
    select 1 from private.audit_logs a
     where a.actor_id = v_uid and a.action = 'DATA_EXPORTED'
       and a.created_at > pg_catalog.now() - interval '24 hours'
  ) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'format', 'account-export',
    'format_version', 2,
    'generated_at', pg_catalog.now(),
    'account', (
      select jsonb_build_object(
        'user_id', p.id, 'email', u.email, 'created_at', p.created_at,
        'account_status', p.account_status, 'deletion_requested_at', p.deletion_requested_at,
        'adult_confirmed_at', p.adult_confirmed_at, 'onboarded_at', p.onboarded_at)
      from public.profiles p left join auth.users u on u.id = p.id
      where p.id = v_uid),
    'profile', (
      select jsonb_build_object(
        'display_name', p.display_name, 'bio', p.bio, 'avatar_path', p.avatar_path,
        'gender', p.gender, 'avatar_key', p.avatar_key,
        'city', c.slug, 'district', d.slug)
      from public.profiles p
      left join public.cities c on c.id = p.city_id
      left join public.districts d on d.id = p.district_id
      where p.id = v_uid),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = v_uid),
    'sport_profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', sp.slug,
               'self_assessed_level', usp.self_assessed_level,
               'self_assessed_at', usp.self_assessed_at,
               'positions', coalesce((
                 select jsonb_agg(pos.slug order by pos.slug)
                   from public.user_sport_positions x
                   join public.sport_positions pos on pos.id = x.position_id
                  where x.user_id = usp.user_id and x.sport_id = usp.sport_id), '[]'::jsonb))
             order by sp.slug)
        from public.user_sport_profiles usp
        join public.sports sp on sp.id = usp.sport_id
       where usp.user_id = v_uid), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', uc.kind, 'version', uc.version,
               'granted_at', uc.granted_at, 'revoked_at', uc.revoked_at)
             order by uc.granted_at, uc.kind)
        from public.user_consents uc where uc.user_id = v_uid), '[]'::jsonb),
    'admin', (select jsonb_build_object('granted_at', a.granted_at, 'revoked_at', a.revoked_at)
                from public.platform_admins a where a.user_id = v_uid)
  ) || private.export_event_data(v_uid) || private.export_place_data(v_uid) || private.export_analytics_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.purge_account(p_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status    public.account_status;
  v_requested timestamptz;
begin
  select p.account_status, p.deletion_requested_at into v_status, v_requested
    from public.profiles p where p.id = p_uid for update;
  if v_status is distinct from 'PENDING_DELETION'::public.account_status
     or v_requested > pg_catalog.now() - interval '30 days' then
    return false;
  end if;

  delete from public.user_sport_profiles where user_id = p_uid;  -- positions cascade
  delete from public.user_settings where user_id = p_uid;
  delete from public.platform_admins where user_id = p_uid;
  perform private.purge_event_data(p_uid);
  update public.venues set submitted_by = null where submitted_by = p_uid;
  delete from public.analytics_events where user_id = p_uid;
  delete from private.avatar_uploads where user_id = p_uid;
  update public.profiles
     set display_name = null, avatar_path = null, avatar_key = null, gender = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$function$;
