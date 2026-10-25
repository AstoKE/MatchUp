-- Re-consent gate: an onboarded user whose recorded Terms/Privacy acceptance is not for the CURRENT
-- versions (app_config legal.*) is blocked from every write RPC until they accept the new versions.
-- Before this, publishing new legal texts only affected new sign-ups (LAUNCH_CHECKLIST §1).
-- Additive for clients: one new RPC, one new domain code (CONSENT_REQUIRED), one new get_my_account column.

-- ---- helper: does this user hold an unrevoked acceptance of both current versions? ------------------
-- Fails closed: if the configured versions are missing, nobody counts as current.
create function private.legal_consent_current(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select (select c.value #>> '{}' from public.app_config c where c.key = 'legal.terms_version')   as terms,
           (select c.value #>> '{}' from public.app_config c where c.key = 'legal.privacy_version') as privacy
  )
  select coalesce((
    select v.terms is not null and v.privacy is not null
       and exists (select 1 from public.user_consents uc
                   where uc.user_id = p_uid and uc.kind = 'TERMS'
                     and uc.version = v.terms and uc.revoked_at is null)
       and exists (select 1 from public.user_consents uc
                   where uc.user_id = p_uid and uc.kind = 'PRIVACY_NOTICE'
                     and uc.version = v.privacy and uc.revoked_at is null)
    from v
  ), false);
$$;
revoke all on function private.legal_consent_current(uuid) from public, anon, authenticated;

-- ---- guard: fully onboarded user, now including current consent --------------------------------------
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
  return v_uid;
end;
$$;

-- ---- accept_current_legal_terms: re-consent for already-onboarded users -----------------------------
-- The client sends the versions it displayed, so an acceptance can never be recorded for a text the
-- user did not see (same rule as complete_onboarding). Idempotent; 18+ and marketing are untouched.
create function public.accept_current_legal_terms(p_terms_version text, p_privacy_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_active_verified_user();
  v_terms   text;
  v_privacy text;
begin
  -- New users accept inside complete_onboarding, together with the 18+ confirmation.
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.adult_confirmed_at is not null and p.onboarded_at is not null
  ) then
    raise exception 'ONBOARDING_REQUIRED' using errcode = 'P0001';
  end if;

  select c.value #>> '{}' into v_terms   from public.app_config c where c.key = 'legal.terms_version';
  select c.value #>> '{}' into v_privacy from public.app_config c where c.key = 'legal.privacy_version';
  if v_terms is null or v_privacy is null
     or p_terms_version is distinct from v_terms or p_privacy_version is distinct from v_privacy then
    raise exception 'CONSENT_VERSION_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.user_consents (user_id, kind, version) values
    (v_uid, 'TERMS', v_terms), (v_uid, 'PRIVACY_NOTICE', v_privacy)
  on conflict (user_id, kind, version) do update set revoked_at = null;
end;
$$;
revoke all on function public.accept_current_legal_terms(text, text) from public, anon, authenticated;
grant execute on function public.accept_current_legal_terms(text, text) to authenticated;

-- ---- get_my_account: add legal_consent_current (additive column; no released clients exist yet) -----
drop function public.get_my_account();
create function public.get_my_account()
returns table (
  user_id               uuid,
  account_status        public.account_status,
  email_verified        boolean,
  is_admin              boolean,
  adult_confirmed       boolean,
  onboarded             boolean,
  legal_consent_current boolean
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
           (p.onboarded_at is not null),
           private.legal_consent_current(p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid;
end;
$$;
revoke all on function public.get_my_account() from public, anon, authenticated;
grant execute on function public.get_my_account() to authenticated;
