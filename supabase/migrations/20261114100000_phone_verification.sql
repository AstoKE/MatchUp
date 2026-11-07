-- Phase 8: phone verification (ADR-0029, founder's decision 2026-11-07).
--
-- * Purpose: one account per person. A Turkish mobile number (+90 5xx) is verified by SMS through Supabase Auth's own
--   phone change (updateUser → code → verifyOtp); Auth keeps a number on one account only.
-- * Enforced here, server-side: with `phone.required` on, every write behind private.assert_onboarded_user needs a
--   verified +90 5xx number. Browsing, onboarding itself, re-consent and account deletion do not.
-- * `phone.required` starts OFF: hosted has no SMS provider yet, and switching it on before that would lock everyone out
--   (DEPLOYMENT §14 says when). Existing accounts are asked at their next visit, by the app's gate.
-- * The number is never shown to anyone and never leaves Auth except to its owner (export).

insert into public.app_config (key, value) values ('phone.required', 'false'::jsonb)
on conflict (key) do nothing;

create function private.config_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value #>> '{}')::boolean from public.app_config c where c.key = p_key), p_default);
$$;

-- A confirmed Turkish mobile number on the account (Auth stores it without the '+').
create function private.phone_verified(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u
                  where u.id = p_uid and u.phone_confirmed_at is not null and u.phone ~ '^905[0-9]{9}$');
$$;

revoke all on function private.config_bool(text, boolean), private.phone_verified(uuid) from public, anon, authenticated;
grant execute on function private.config_bool(text, boolean), private.phone_verified(uuid) to authenticated;

create or replace function private.assert_onboarded_user()
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
  if not private.legal_consent_current(v_uid) then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
  if private.config_bool('phone.required', false) and not private.phone_verified(v_uid) then
    raise exception 'PHONE_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Additive columns for the app's gate (the table shape changes, so the function is recreated; older apps ignore them).
drop function public.get_my_account();
create function public.get_my_account()
returns table (user_id uuid, account_status public.account_status, email_verified boolean, is_admin boolean,
               adult_confirmed boolean, onboarded boolean, legal_consent_current boolean,
               deletion_due_at timestamptz, phone_verified boolean, phone_required boolean)
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
           (p.onboarded_at is not null),
           private.legal_consent_current(p.id),
           p.deletion_requested_at + interval '30 days',
           private.phone_verified(p.id),
           private.config_bool('phone.required', false)
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid;
end;
$$;
revoke all on function public.get_my_account() from public, anon, authenticated;
grant execute on function public.get_my_account() to authenticated;

-- The export includes the number (same signature).
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
        'user_id', p.id, 'email', u.email, 'phone', u.phone, 'created_at', p.created_at,
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
  ) || private.export_event_data(v_uid) || private.export_place_data(v_uid) || private.export_analytics_data(v_uid)
    || private.export_push_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;
