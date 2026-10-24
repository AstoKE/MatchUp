-- =====================================================================================
-- Phase 1 foundation: identity baseline, explicit-grant model, RLS baseline.
-- See docs/DATABASE.md §3.1, §9–10, docs/SECURITY.md §4, ADR-0003, ADR-0013.
--
-- Security model implemented here:
--   * Nothing in `public` is reachable by API roles unless a GRANT below says so (default privileges
--     are revoked: the Data API exposes `public`, so an auto-granted table would be an open API).
--   * RLS is enabled on every table; there are NO write policies and NO write grants for API roles.
--     Writes happen only through SECURITY DEFINER RPCs added by later phases.
--   * Every SECURITY DEFINER function: `set search_path = ''`, schema-qualified references,
--     EXECUTE revoked from PUBLIC/anon/authenticated and granted only to the roles that need it,
--     and authentication/authorization enforced inside the function body.
--   * `private` holds helpers; it is NOT in the API's exposed schemas (supabase/config.toml).
-- =====================================================================================

-- ---- Schemas -------------------------------------------------------------------------
create schema if not exists private;
comment on schema private is 'Internal helpers and trigger functions. Not exposed through the Data API.';

-- Policy expressions run as the invoking role, so API roles need USAGE to resolve private helpers;
-- they still need an explicit EXECUTE grant per function (granted below, never by default).
grant usage on schema private to anon, authenticated;

-- ---- Default privileges: deny by default ------------------------------------------------
-- Supabase grants new public objects to anon/authenticated by default. We invert that.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;

-- ---- Types ---------------------------------------------------------------------------
create type public.account_status as enum ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED');
create type public.profile_visibility as enum ('EVERYONE', 'EVENT_PEERS');
create type public.consent_kind as enum ('TERMS', 'PRIVACY_NOTICE', 'MARKETING');

-- ---- Generic helpers ------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ---- profiles ---------------------------------------------------------------------------
-- id = auth user id. Deliberately NO foreign key to auth.users (ADR-0003): account deletion removes
-- the auth user but keeps an anonymized tombstone row so historical records stay consistent.
create table public.profiles (
  id                    uuid primary key,
  display_name          text check (display_name is null or char_length(display_name) between 2 and 40),
  avatar_path           text check (avatar_path is null or char_length(avatar_path) <= 255),
  bio                   text check (bio is null or char_length(bio) <= 280),
  account_status        public.account_status not null default 'ACTIVE',
  deletion_requested_at timestamptz,
  adult_confirmed_at    timestamptz,
  created_at            timestamptz not null default pg_catalog.now(),
  updated_at            timestamptz not null default pg_catalog.now(),
  constraint profiles_deletion_state check (
    (account_status = 'PENDING_DELETION') = (deletion_requested_at is not null)
    or account_status = 'DELETED'
  )
);
comment on table public.profiles is 'Public-facing identity, 1:1 with auth.users (no FK on purpose, ADR-0003).';
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---- user_settings --------------------------------------------------------------------
create table public.user_settings (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  locale              text not null default 'tr' check (locale in ('tr', 'en')),
  theme               text not null default 'system' check (theme in ('system', 'light', 'dark')),
  profile_visibility  public.profile_visibility not null default 'EVENT_PEERS',
  show_reliability    boolean not null default true,
  show_badges         boolean not null default true,
  marketing_consent_at timestamptz,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now()
);
comment on table public.user_settings is 'Private preferences and privacy settings. Private by default (EVENT_PEERS).';
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();

-- ---- user_consents ---------------------------------------------------------------------
create table public.user_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.consent_kind not null,
  version     text not null check (char_length(version) between 1 and 40),
  granted_at  timestamptz not null default pg_catalog.now(),
  revoked_at  timestamptz,
  unique (user_id, kind, version)
);
comment on table public.user_consents is 'Evidence of versioned terms/privacy/marketing consent (KVKK, SECURITY §8).';

-- ---- platform_admins -------------------------------------------------------------------
-- Admin status is a row here, written only with service credentials / migrations. Never JWT metadata.
create table public.platform_admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  granted_by  uuid,
  granted_at  timestamptz not null default pg_catalog.now(),
  revoked_at  timestamptz
);
comment on table public.platform_admins is 'Administrators. No client write path exists; grant with service credentials only.';

-- ---- app_config ---------------------------------------------------------------------------
-- Operational switches readable by everyone (including guests, e.g. minimum app version).
-- MUST NEVER contain secrets.
create table public.app_config (
  key         text primary key check (key ~ '^[a-z0-9_.]{1,64}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default pg_catalog.now()
);
comment on table public.app_config is 'Public operational config (kill switches, min app version). Never store secrets here.';
create trigger app_config_set_updated_at before update on public.app_config
  for each row execute function private.set_updated_at();

insert into public.app_config (key, value)
values ('min_supported_app_version', '"0.0.0"'::jsonb)
on conflict (key) do nothing;

-- ---- Authorization helper ---------------------------------------------------------------
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = (select auth.uid())
      and a.revoked_at is null
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---- Guard used by every future write RPC --------------------------------------------------
-- Returns the caller's id or raises a stable domain error code (matched by packages/domain mapRpcError).
create function private.assert_active_verified_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_confirmed timestamptz;
  v_status    public.account_status;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select u.email_confirmed_at into v_confirmed from auth.users u where u.id = v_uid;
  if v_confirmed is null then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  select p.account_status into v_status from public.profiles p where p.id = v_uid;
  if v_status is distinct from 'ACTIVE'::public.account_status then
    raise exception 'ACCOUNT_RESTRICTED' using errcode = 'P0001';
  end if;

  return v_uid;
end;
$$;
revoke all on function private.assert_active_verified_user() from public, anon, authenticated;
grant execute on function private.assert_active_verified_user() to authenticated;

-- ---- New-user bootstrap (trigger on auth.users) -------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---- Public RPC: caller's account state (UX only; enforcement stays server-side) ---------------
create function public.get_my_account()
returns table (
  user_id        uuid,
  account_status public.account_status,
  email_verified boolean,
  is_admin       boolean
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
           private.is_admin()
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid;
end;
$$;
revoke all on function public.get_my_account() from public, anon, authenticated;
grant execute on function public.get_my_account() to authenticated;

-- ---- Row Level Security ------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.user_settings   enable row level security;
alter table public.user_consents   enable row level security;
alter table public.platform_admins enable row level security;
alter table public.app_config      enable row level security;

-- Explicit read grants (writes are never granted to API roles).
grant select on public.profiles, public.user_settings, public.user_consents, public.platform_admins
  to authenticated;
grant select on public.app_config to anon, authenticated;

-- profiles: own row, or admin. (Other users' visibility rules arrive with Phase 2.)
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select private.is_admin()));

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy platform_admins_select_admin on public.platform_admins
  for select to authenticated
  using ((select private.is_admin()));

-- app_config is public operational config (guests included, ADR-0013).
create policy app_config_select_all on public.app_config
  for select to anon, authenticated
  using (true);

-- Indexes for policy predicates / FKs beyond the primary keys
create index user_consents_user_id_idx on public.user_consents (user_id);
