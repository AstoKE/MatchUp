-- =====================================================================================
-- Phase 2 / P2-M3–M4: onboarding gate (18+ confirmation, versioned consents), profile and
-- sport-profile RPCs, profile visibility policies.
-- PRD §4.1, DATABASE §3.1/§9, SECURITY §3/§8, ADR-0013, ADR-0014.
--
-- SERVER-SIDE GATE: every future write RPC must start with private.assert_onboarded_user().
-- A user who signs up through the raw Auth API (bypassing the app) therefore still cannot create,
-- join or rate anything until the 18+ confirmation and the current consent versions are recorded.
-- The legal TEXT is a DRAFT until reviewed by qualified counsel (app_config legal.draft = true).
-- =====================================================================================

-- ---- profile columns --------------------------------------------------------------------
alter table public.profiles
  add column city_id      uuid references public.cities (id),
  add column district_id  uuid,
  add column onboarded_at timestamptz;

alter table public.profiles
  add constraint profiles_district_matches_city
    foreign key (district_id, city_id) references public.districts (id, city_id),
  add constraint profiles_district_needs_city check (district_id is null or city_id is not null),
  add constraint profiles_onboarded_needs_adult check (onboarded_at is null or adult_confirmed_at is not null);

-- ---- sport profiles ---------------------------------------------------------------------
create table public.user_sport_profiles (
  user_id             uuid not null references public.profiles (id) on delete cascade,
  sport_id            uuid not null references public.sports (id),
  self_assessed_level numeric(2, 1) not null
    check (self_assessed_level between 1.0 and 5.0 and self_assessed_level * 2 = trunc(self_assessed_level * 2)),
  self_assessed_at    timestamptz not null default pg_catalog.now(),
  created_at          timestamptz not null default pg_catalog.now(),
  primary key (user_id, sport_id)
);
comment on table public.user_sport_profiles is 'Self-assessed level per sport (the PRIOR for peer-rated skill, RATING_SYSTEM §3.2).';

create table public.user_sport_positions (
  user_id     uuid not null,
  sport_id    uuid not null,
  position_id uuid not null,
  primary key (user_id, sport_id, position_id),
  foreign key (user_id, sport_id) references public.user_sport_profiles (user_id, sport_id) on delete cascade,
  -- composite FK: the position must belong to the SAME sport
  foreign key (position_id, sport_id) references public.sport_positions (id, sport_id)
);

create index user_sport_profiles_sport_idx on public.user_sport_profiles (sport_id);

alter table public.user_sport_profiles enable row level security;
alter table public.user_sport_positions enable row level security;

-- ---- who may read whose profile -----------------------------------------------------------------
-- Reading the profiles TABLE directly is limited to non-sensitive columns for everyone; the owner's
-- full state (account_status, onboarding, deletion) is available only via get_my_account().
revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_path, bio, city_id, district_id, created_at) on public.profiles to authenticated;

-- Others may see a profile only when its owner chose EVERYONE (the EVENT_PEERS rule arrives with the
-- Event Engine in Phase 3). Suspended/deleted accounts are never visible to others.
-- The visibility lookup must be SECURITY DEFINER: user_settings is owner-only under RLS, so an inline
-- subquery would see no rows for other people's settings and "public" profiles would never be visible.
create function private.profile_is_public(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_settings s on s.user_id = p.id
    where p.id = p_user
      and p.account_status = 'ACTIVE'
      and p.onboarded_at is not null
      and s.profile_visibility = 'EVERYONE'
  );
$$;
revoke all on function private.profile_is_public(uuid) from public, anon, authenticated;
grant execute on function private.profile_is_public(uuid) to authenticated;

create policy profiles_select_public on public.profiles
  for select to authenticated
  using (private.profile_is_public(id));

grant select on public.user_sport_profiles, public.user_sport_positions to authenticated;

create policy user_sport_profiles_select_own on public.user_sport_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_sport_profiles_select_public on public.user_sport_profiles
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = user_sport_profiles.user_id));
create policy user_sport_positions_select_own on public.user_sport_positions
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_sport_positions_select_public on public.user_sport_positions
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = user_sport_positions.user_id));
-- (the profiles policies above already restrict which p rows the subquery can see)

-- ---- current legal versions (DRAFT) ----------------------------------------------------------------
insert into public.app_config (key, value) values
  ('legal.terms_version',   '"draft-0.1"'::jsonb),
  ('legal.privacy_version', '"draft-0.1"'::jsonb),
  ('legal.draft',           'true'::jsonb)
on conflict (key) do nothing;

-- ---- guard: fully onboarded user -------------------------------------------------------------------
create function private.assert_onboarded_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.adult_confirmed_at is not null and p.onboarded_at is not null
  ) then
    raise exception 'ONBOARDING_REQUIRED' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.assert_onboarded_user() from public, anon, authenticated;
grant execute on function private.assert_onboarded_user() to authenticated;

-- ---- shared validation helpers ----------------------------------------------------------------------
create function private.clean_display_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_name);
begin
  if v is null or pg_catalog.char_length(v) not between 2 and 40 or v ~ '[[:cntrl:]]' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function private.clean_display_name(text) from public, anon, authenticated;

create function private.assert_location(p_city_id uuid, p_district_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_city_id is null then
    if p_district_id is not null then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
    return;
  end if;
  if not exists (select 1 from public.cities c where c.id = p_city_id and c.is_active) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_district_id is not null and not exists (
    select 1 from public.districts d where d.id = p_district_id and d.city_id = p_city_id and d.is_active
  ) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.assert_location(uuid, uuid) from public, anon, authenticated;

-- Replaces/creates one sport profile; validates level, sport and that positions belong to the sport.
create function private.upsert_sport_profile(p_user uuid, p_sport uuid, p_level numeric, p_positions uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_positions uuid[] := coalesce(p_positions, '{}'::uuid[]);
begin
  if p_level is null or p_level < 1.0 or p_level > 5.0 or p_level * 2 <> pg_catalog.trunc(p_level * 2) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sports s where s.id = p_sport and s.is_active) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if pg_catalog.cardinality(v_positions) > 3
     or (select pg_catalog.count(distinct x) from pg_catalog.unnest(v_positions) x) <> pg_catalog.cardinality(v_positions)
     or (select pg_catalog.count(*) from public.sport_positions sp
         where sp.id = any (v_positions) and sp.sport_id = p_sport and sp.is_active) <> pg_catalog.cardinality(v_positions) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  insert into public.user_sport_profiles (user_id, sport_id, self_assessed_level)
  values (p_user, p_sport, p_level)
  on conflict (user_id, sport_id)
    do update set self_assessed_level = excluded.self_assessed_level, self_assessed_at = pg_catalog.now();

  delete from public.user_sport_positions where user_id = p_user and sport_id = p_sport;
  insert into public.user_sport_positions (user_id, sport_id, position_id)
  select p_user, p_sport, x from pg_catalog.unnest(v_positions) x;
end;
$$;
revoke all on function private.upsert_sport_profile(uuid, uuid, numeric, uuid[]) from public, anon, authenticated;

-- ---- RPC: complete onboarding ---------------------------------------------------------------------------
create function public.complete_onboarding(
  p_adult_confirmed   boolean,
  p_terms_version     text,
  p_privacy_version   text,
  p_marketing_consent boolean,
  p_display_name      text,
  p_city_id           uuid,
  p_district_id       uuid,
  p_sports            jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.assert_active_verified_user();
  v_terms     text;
  v_privacy   text;
  v_name      text;
  v_item      jsonb;
  v_seen      uuid[] := '{}';
  v_sport     uuid;
  v_positions uuid[];
begin
  if p_adult_confirmed is distinct from true then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;

  select c.value #>> '{}' into v_terms   from public.app_config c where c.key = 'legal.terms_version';
  select c.value #>> '{}' into v_privacy from public.app_config c where c.key = 'legal.privacy_version';
  if v_terms is null or v_privacy is null
     or p_terms_version is distinct from v_terms or p_privacy_version is distinct from v_privacy then
    raise exception 'CONSENT_VERSION_MISMATCH' using errcode = 'P0001';
  end if;

  v_name := private.clean_display_name(p_display_name);
  perform private.assert_location(p_city_id, p_district_id);

  if p_sports is null or pg_catalog.jsonb_typeof(p_sports) <> 'array'
     or pg_catalog.jsonb_array_length(p_sports) not between 1 and 10 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  -- All validation above and below happens before any consent is recorded, inside one transaction:
  -- either everything is stored or nothing is.
  for v_item in select * from pg_catalog.jsonb_array_elements(p_sports) loop
    begin
      v_sport := (v_item ->> 'sport_id')::uuid;
      v_positions := coalesce(
        (select pg_catalog.array_agg(x::uuid) from pg_catalog.jsonb_array_elements_text(coalesce(v_item -> 'position_ids', '[]'::jsonb)) x),
        '{}'::uuid[]);
      if v_sport = any (v_seen) then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
      v_seen := v_seen || v_sport;
      perform private.upsert_sport_profile(v_uid, v_sport, (v_item ->> 'level')::numeric, v_positions);
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
        raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end;
  end loop;

  update public.profiles
     set display_name       = v_name,
         city_id            = p_city_id,
         district_id        = p_district_id,
         adult_confirmed_at = coalesce(adult_confirmed_at, pg_catalog.now()),
         onboarded_at       = coalesce(onboarded_at, pg_catalog.now())
   where id = v_uid;

  insert into public.user_consents (user_id, kind, version) values
    (v_uid, 'TERMS', v_terms), (v_uid, 'PRIVACY_NOTICE', v_privacy)
  on conflict (user_id, kind, version) do update set revoked_at = null;

  if p_marketing_consent is true then
    insert into public.user_consents (user_id, kind, version) values (v_uid, 'MARKETING', 'v1')
    on conflict (user_id, kind, version) do update set revoked_at = null, granted_at = pg_catalog.now();
    update public.user_settings set marketing_consent_at = pg_catalog.now() where user_id = v_uid and marketing_consent_at is null;
  end if;
end;
$$;
revoke all on function public.complete_onboarding(boolean, text, text, boolean, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_onboarding(boolean, text, text, boolean, text, uuid, uuid, jsonb) to authenticated;

-- ---- RPC: update profile ---------------------------------------------------------------------------------
create function public.update_my_profile(p_display_name text, p_bio text, p_city_id uuid, p_district_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  v_bio text := nullif(pg_catalog.btrim(p_bio), '');
begin
  if v_bio is not null and (pg_catalog.char_length(v_bio) > 280 or v_bio ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.assert_location(p_city_id, p_district_id);
  update public.profiles
     set display_name = private.clean_display_name(p_display_name),
         bio = v_bio, city_id = p_city_id, district_id = p_district_id
   where id = v_uid;
end;
$$;
revoke all on function public.update_my_profile(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text, uuid, uuid) to authenticated;

-- ---- RPC: update settings -----------------------------------------------------------------------------------
create function public.update_my_settings(
  p_locale             text,
  p_theme              text,
  p_profile_visibility public.profile_visibility,
  p_show_reliability   boolean,
  p_show_badges        boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_locale not in ('tr', 'en') or p_theme not in ('system', 'light', 'dark')
     or p_profile_visibility is null or p_show_reliability is null or p_show_badges is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.user_settings
     set locale = p_locale, theme = p_theme, profile_visibility = p_profile_visibility,
         show_reliability = p_show_reliability, show_badges = p_show_badges
   where user_id = v_uid;
end;
$$;
revoke all on function public.update_my_settings(text, text, public.profile_visibility, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_my_settings(text, text, public.profile_visibility, boolean, boolean) to authenticated;

-- ---- RPC: marketing consent (separate, revocable, never bundled with Terms) --------------------------------------
create function public.set_marketing_consent(p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_granted is null then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
  if p_granted then
    insert into public.user_consents (user_id, kind, version) values (v_uid, 'MARKETING', 'v1')
    on conflict (user_id, kind, version) do update set revoked_at = null, granted_at = pg_catalog.now();
    update public.user_settings set marketing_consent_at = pg_catalog.now() where user_id = v_uid;
  else
    update public.user_consents set revoked_at = pg_catalog.now()
     where user_id = v_uid and kind = 'MARKETING' and revoked_at is null;
    update public.user_settings set marketing_consent_at = null where user_id = v_uid;
  end if;
end;
$$;
revoke all on function public.set_marketing_consent(boolean) from public, anon, authenticated;
grant execute on function public.set_marketing_consent(boolean) to authenticated;

-- ---- RPC: sport profiles ------------------------------------------------------------------------------------------
create function public.set_sport_profile(p_sport_id uuid, p_level numeric, p_position_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.upsert_sport_profile(private.assert_onboarded_user(), p_sport_id, p_level, p_position_ids);
end;
$$;
revoke all on function public.set_sport_profile(uuid, numeric, uuid[]) from public, anon, authenticated;
grant execute on function public.set_sport_profile(uuid, numeric, uuid[]) to authenticated;

create function public.remove_sport_profile(p_sport_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  delete from public.user_sport_profiles where user_id = v_uid and sport_id = p_sport_id;
end;
$$;
revoke all on function public.remove_sport_profile(uuid) from public, anon, authenticated;
grant execute on function public.remove_sport_profile(uuid) to authenticated;

-- ---- get_my_account: add onboarding state (additive; no released clients exist yet) ------------------------------------
drop function public.get_my_account();
create function public.get_my_account()
returns table (
  user_id         uuid,
  account_status  public.account_status,
  email_verified  boolean,
  is_admin        boolean,
  adult_confirmed boolean,
  onboarded       boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  return query
    select p.id,
           p.account_status,
           (u.email_confirmed_at is not null),
           private.is_admin(),
           (p.adult_confirmed_at is not null),
           (p.onboarded_at is not null)
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid;
end;
$$;
revoke all on function public.get_my_account() from public, anon, authenticated;
grant execute on function public.get_my_account() to authenticated;
