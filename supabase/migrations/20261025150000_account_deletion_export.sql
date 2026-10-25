-- Account deletion (request → 30-day grace → purge) and personal-data export, in SQL only (ADR-0017):
-- no Edge Function and no service-role key. The purge runs daily through pg_cron as the owner role.
-- Additive for clients: new RPCs, new domain code REAUTH_REQUIRED, new get_my_account column.

create extension if not exists pg_cron with schema pg_catalog;

-- ---- audit log (private schema: never exposed through the Data API) ----------------------------------
-- No PII and no free text: ids, a fixed action vocabulary and small structured metadata only.
create table private.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,  -- null = the system (scheduled job)
  action     text not null check (action in (
               'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED',
               'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED')),
  target_id  uuid,
  metadata   jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now()
);
comment on table private.audit_logs is 'Append-only security audit trail (no PII). Read later through admin RPCs only.';
create index audit_logs_actor_action_idx on private.audit_logs (actor_id, action, created_at desc);
alter table private.audit_logs enable row level security;
revoke all on private.audit_logs from public, anon, authenticated;

create function private.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
revoke all on function private.audit_logs_append_only() from public, anon, authenticated;
create trigger audit_logs_no_update before update on private.audit_logs
  for each row execute function private.audit_logs_append_only();

-- ---- recent re-authentication ------------------------------------------------------------------------
-- Supabase access tokens carry `amr` entries with the UNIX time of the sign-in method; a refresh keeps
-- it (measured), so this proves a password was entered within p_max_age, not merely that a session exists.
create function private.assert_recent_auth(p_max_age interval default interval '10 minutes')
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_amr  jsonb := (select auth.jwt()) -> 'amr';
  v_last double precision;
begin
  if jsonb_typeof(v_amr) = 'array' then
    select max((e ->> 'timestamp')::double precision) into v_last
      from jsonb_array_elements(v_amr) e
     where jsonb_typeof(e) = 'object' and e ->> 'method' = 'password'
       and (e ->> 'timestamp') ~ '^[0-9]+(\.[0-9]+)?$';
  end if;
  if v_last is null or pg_catalog.to_timestamp(v_last) < pg_catalog.now() - p_max_age then
    raise exception 'REAUTH_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.assert_recent_auth(interval) from public, anon, authenticated;

-- ---- request / cancel --------------------------------------------------------------------------------
-- Returns when the purge is due. Idempotent: a second request returns the original schedule.
create function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_status    public.account_status;
  v_requested timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select p.account_status, p.deletion_requested_at into v_status, v_requested
    from public.profiles p where p.id = v_uid for update;
  if v_status = 'PENDING_DELETION' then
    return v_requested + interval '30 days';
  end if;
  -- SUSPENDED accounts are excluded for now (moderation evasion); data requests go through support (⚖).
  if v_status is distinct from 'ACTIVE'::public.account_status then
    raise exception 'ACCOUNT_RESTRICTED' using errcode = 'P0001';
  end if;
  perform private.assert_recent_auth();

  update public.profiles
     set account_status = 'PENDING_DELETION', deletion_requested_at = pg_catalog.now()
   where id = v_uid;
  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'ACCOUNT_DELETION_REQUESTED', v_uid);
  return pg_catalog.now() + interval '30 days';
end;
$$;
revoke all on function public.request_account_deletion() from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;

-- Cancelling is the safe direction: no re-authentication needed. Idempotent for an active account.
create function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_status public.account_status;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select p.account_status into v_status from public.profiles p where p.id = v_uid for update;
  if v_status = 'ACTIVE' then
    return;
  end if;
  if v_status is distinct from 'PENDING_DELETION'::public.account_status then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update public.profiles
     set account_status = 'ACTIVE', deletion_requested_at = null
   where id = v_uid;
  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'ACCOUNT_DELETION_CANCELED', v_uid);
end;
$$;
revoke all on function public.cancel_account_deletion() from public, anon, authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---- purge (system only) -----------------------------------------------------------------------------
-- Keeps a tombstone profile row (FK integrity for future history, ADR-0003) and the consent evidence
-- (version + time, linked to the tombstone; retention to be confirmed by counsel ⚖). Everything else
-- personal is deleted, then the auth user (sessions, identities, email) is removed.
-- Every table with personal data must be handled here AND in export_my_data
-- (enforced by supabase/tests/database/06_account_deletion_export.test.sql).
create function private.purge_account(p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
  update public.profiles
     set display_name = null, avatar_path = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$$;
revoke all on function private.purge_account(uuid) from public, anon, authenticated;

-- One failing account must not stop the others; failures are audited (SQLSTATE only, no message text).
create function private.process_deletion_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_purged integer := 0;
begin
  for v_id in
    select p.id from public.profiles p
     where p.account_status = 'PENDING_DELETION'
       and p.deletion_requested_at <= pg_catalog.now() - interval '30 days'
     order by p.deletion_requested_at
     limit 200
  loop
    begin
      if private.purge_account(v_id) then
        v_purged := v_purged + 1;
      end if;
    exception when others then
      insert into private.audit_logs (actor_id, action, target_id, metadata)
      values (null, 'ACCOUNT_PURGE_FAILED', v_id, jsonb_build_object('sqlstate', sqlstate));
    end;
  end loop;
  return v_purged;
end;
$$;
revoke all on function private.process_deletion_queue() from public, anon, authenticated;

select cron.schedule('process-deletion-queue', '17 3 * * *', 'select private.process_deletion_queue()');

-- ---- export -------------------------------------------------------------------------------------------
-- The caller's own personal data as JSON (the app saves/shares it as a file). At most once per 24 h,
-- serialized per user so parallel calls cannot bypass the limit.
create function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'format_version', 1,
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
  ) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$$;
revoke all on function public.export_my_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;

-- ---- get_my_account: add deletion_due_at (additive column; no released clients exist yet) -------------
drop function public.get_my_account();
create function public.get_my_account()
returns table (
  user_id               uuid,
  account_status        public.account_status,
  email_verified        boolean,
  is_admin              boolean,
  adult_confirmed       boolean,
  onboarded             boolean,
  legal_consent_current boolean,
  deletion_due_at       timestamptz
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
           private.legal_consent_current(p.id),
           p.deletion_requested_at + interval '30 days'
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_uid;
end;
$$;
revoke all on function public.get_my_account() from public, anon, authenticated;
grant execute on function public.get_my_account() to authenticated;
