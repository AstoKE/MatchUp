-- =====================================================================================
-- Phase 2 / P2-M5: atomic replacement of a user's sport profiles (profile editing) and a single shared
-- implementation of "validate and store a list of sport selections" used by onboarding AND editing.
--
-- Forward-only: 20261025110000 is not edited. complete_onboarding is re-created (same signature, same
-- behaviour) so both entry points run the exact same validation; the per-user row lock serializes
-- simultaneous submissions from several devices.
-- =====================================================================================

create function private.apply_sport_selection(p_user uuid, p_sports jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_seen      uuid[] := '{}';
  v_sport     uuid;
  v_positions uuid[];
begin
  if p_sports is null or pg_catalog.jsonb_typeof(p_sports) <> 'array'
     or pg_catalog.jsonb_array_length(p_sports) not between 1 and 10 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  -- One writer per user at a time: concurrent saves from two devices cannot interleave.
  perform 1 from public.profiles p where p.id = p_user for update;

  for v_item in select * from pg_catalog.jsonb_array_elements(p_sports) loop
    begin
      v_sport := (v_item ->> 'sport_id')::uuid;
      v_positions := coalesce(
        (select pg_catalog.array_agg(x::uuid)
           from pg_catalog.jsonb_array_elements_text(coalesce(v_item -> 'position_ids', '[]'::jsonb)) x),
        '{}'::uuid[]);
      if v_sport = any (v_seen) then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
      v_seen := v_seen || v_sport;
      perform private.upsert_sport_profile(p_user, v_sport, (v_item ->> 'level')::numeric, v_positions);
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
        raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end;
  end loop;
  return v_seen;
end;
$$;
revoke all on function private.apply_sport_selection(uuid, jsonb) from public, anon, authenticated;

-- ---- RPC: replace the caller's sport profiles (adds, updates and removes in one transaction) ------------
create function public.replace_my_sport_profiles(p_sports jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_onboarded_user();
  v_kept uuid[];
begin
  v_kept := private.apply_sport_selection(v_uid, p_sports);
  delete from public.user_sport_profiles where user_id = v_uid and sport_id <> all (v_kept);
end;
$$;
revoke all on function public.replace_my_sport_profiles(jsonb) from public, anon, authenticated;
grant execute on function public.replace_my_sport_profiles(jsonb) to authenticated;

-- ---- complete_onboarding: identical behaviour, shared sport validation ---------------------------------------
create or replace function public.complete_onboarding(
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
  v_uid     uuid := private.assert_active_verified_user();
  v_terms   text;
  v_privacy text;
  v_name    text;
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

  -- Everything is validated before any consent is recorded, inside one transaction:
  -- either everything is stored or nothing is.
  perform private.apply_sport_selection(v_uid, p_sports);

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
    update public.user_settings set marketing_consent_at = pg_catalog.now()
     where user_id = v_uid and marketing_consent_at is null;
  end if;
end;
$$;
