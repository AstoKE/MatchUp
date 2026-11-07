-- Phase 8 / M4: the push foundation (docs/PHASE8_PLAN.md M4, ADR-0028).
--
-- * Two consents, off by default and separate: PUSH_RECOMMENDATIONS ("events for you") and PUSH_REMINDERS. Asked once
--   per account in a popup (push_prompted_at). Withdrawing one stops its messages at once, also those already queued.
-- * push_devices: the Expo push tokens of the person's devices. A token belongs to one device: when someone else signs
--   in there, the token moves to them. The app unregisters the token at sign-out, so a shared phone never shows the
--   previous person's notifications.
-- * push_outbox → push_deliveries: messages wait in the outbox; every minute pg_cron builds one batch for the Expo push
--   service and sends it with pg_net (no Edge Function, no secret). The next run reads the answers: a token Expo calls
--   DeviceNotRegistered is deleted.
-- * Payloads carry a fixed, localized title and body and an event id at most: no names, free text or coordinates.

create extension if not exists pg_net;

alter table public.user_settings
  add column push_recommendations_at timestamptz,
  add column push_reminders_at timestamptz,
  add column push_prompted_at timestamptz;

-- ---- devices ----------------------------------------------------------------------------------------------------------
create table public.push_devices (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token        text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
-- Written and read only through the functions below and the sender.
revoke all on public.push_devices from anon, authenticated;

-- ---- outbox and deliveries ------------------------------------------------------------------------------------------
create table public.push_outbox (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  -- TEST: the person's own test message; M5 adds the recommendation and reminder kinds.
  kind          text not null check (kind in ('TEST')),
  event_id      uuid,
  created_at    timestamptz not null default now(),
  dispatched_at timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where dispatched_at is null;
create index push_outbox_user_idx on public.push_outbox (user_id, created_at);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

create table public.push_deliveries (
  id         bigint generated always as identity primary key,
  outbox_id  bigint not null references public.push_outbox (id) on delete cascade,
  device_id  bigint references public.push_devices (id) on delete set null,
  request_id bigint not null,
  position   integer not null,
  status     text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'ERROR')),
  error      text check (error is null or char_length(error) <= 64),
  created_at timestamptz not null default now()
);
create index push_deliveries_pending_idx on public.push_deliveries (request_id) where status = 'PENDING';
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

insert into public.app_config (key, value) values
  ('push.enabled', 'true'::jsonb),
  ('push.endpoint', '"https://exp.host/--/api/v2/push/send"'::jsonb),
  ('quota.max_test_pushes_per_day', '3'::jsonb),
  ('quota.max_push_devices', '10'::jsonb)
on conflict (key) do nothing;

-- ---- RPCs: devices ------------------------------------------------------------------------------------------------------
-- Registers (or refreshes) this device's token for the caller. A token that belonged to someone else moves to the caller.
create function public.register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'
     or p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  insert into public.push_devices (user_id, token, platform) values (v_uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = pg_catalog.now();
  -- Keep the newest few devices of a person.
  delete from public.push_devices d
   where d.user_id = v_uid
     and d.id not in (select x.id from public.push_devices x where x.user_id = v_uid
                       order by x.last_seen_at desc, x.id desc
                       limit private.config_int('quota.max_push_devices', 10));
end;
$$;

-- At sign-out (and when the person turns notifications off on this device). Only one's own token.
create function public.unregister_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  delete from public.push_devices where token = p_token and user_id = v_uid;
end;
$$;

-- ---- RPCs: consents -------------------------------------------------------------------------------------------------------
create function private.set_push_consent(p_uid uuid, p_kind public.consent_kind, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_granted then
    insert into public.user_consents (user_id, kind, version) values (p_uid, p_kind, 'v1')
    on conflict (user_id, kind, version) do update set revoked_at = null, granted_at = pg_catalog.now();
  else
    update public.user_consents set revoked_at = pg_catalog.now()
     where user_id = p_uid and kind = p_kind and revoked_at is null;
  end if;
end;
$$;

-- Both choices at once (the popup and Settings send both). Also records that the person was asked.
create function public.set_push_consents(p_recommendations boolean, p_reminders boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  s     public.user_settings;
begin
  if p_recommendations is null or p_reminders is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into s from public.user_settings x where x.user_id = v_uid for update;
  if p_recommendations is distinct from (s.push_recommendations_at is not null) then
    perform private.set_push_consent(v_uid, 'PUSH_RECOMMENDATIONS', p_recommendations);
  end if;
  if p_reminders is distinct from (s.push_reminders_at is not null) then
    perform private.set_push_consent(v_uid, 'PUSH_REMINDERS', p_reminders);
  end if;
  update public.user_settings
     set push_recommendations_at = case when p_recommendations then coalesce(push_recommendations_at, pg_catalog.now()) end,
         push_reminders_at = case when p_reminders then coalesce(push_reminders_at, pg_catalog.now()) end,
         push_prompted_at = coalesce(push_prompted_at, pg_catalog.now())
   where user_id = v_uid;
end;
$$;

-- ---- RPC: a test message to one's own devices ------------------------------------------------------------------------
-- Lets a person (and the founder on a real phone) check that notifications arrive. Needs no consent: it is asked for.
create function public.send_test_push()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('push-test:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.push_outbox o
       where o.user_id = v_uid and o.kind = 'TEST' and o.created_at > pg_catalog.now() - interval '1 day')
     >= private.config_int('quota.max_test_pushes_per_day', 3) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.push_devices d where d.user_id = v_uid) then
    return false;  -- nothing to send to
  end if;
  insert into public.push_outbox (user_id, kind) values (v_uid, 'TEST');
  return true;
end;
$$;

-- ---- the sender -------------------------------------------------------------------------------------------------------------
-- The fixed text of each kind, in the person's language.
create function private.push_text(p_kind text, p_locale text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'TEST' then case when p_locale = 'en'
      then '{"title": "Notifications are on", "body": "This is a test notification."}'::jsonb
      else '{"title": "Bildirimler açık", "body": "Bu bir deneme bildirimi."}'::jsonb end
  end;
$$;

-- Whether a person may receive a kind now: an active account and, except for the test, the matching consent.
create function private.push_allowed(p_uid uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.user_settings s on s.user_id = p.id
     where p.id = p_uid and p.account_status = 'ACTIVE'
       and case p_kind when 'TEST' then true else false end);
$$;

-- Sends the oldest pending outbox rows (up to 100 a run): one message per device of each person who may receive it, in
-- requests of at most 100 messages (Expo's limit). Returns the number of requests. Rows of people who may not receive
-- them, or have no device, are closed without a delivery. Every row taken is closed, so nothing is sent twice.
create function private.push_dispatch()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text := (select c.value #>> '{}' from public.app_config c where c.key = 'push.endpoint');
  v_chunks   integer;
  v_messages jsonb;
  v_request  bigint;
begin
  if coalesce((select (c.value #>> '{}')::boolean from public.app_config c where c.key = 'push.enabled'), false) is false
     or v_endpoint is null then
    return 0;
  end if;

  create temporary table if not exists push_batch (
    position integer, outbox_id bigint, device_id bigint, message jsonb) on commit drop;
  truncate push_batch;

  with pending as (
    select o.* from public.push_outbox o
     where o.dispatched_at is null
     order by o.created_at, o.id
     limit 100
     for update skip locked
  ), closed as (
    -- A data-modifying CTE always runs, whether or not it is referenced.
    update public.push_outbox o set dispatched_at = pg_catalog.now()
      from pending p where o.id = p.id
  )
  insert into push_batch (position, outbox_id, device_id, message)
  select (pg_catalog.row_number() over (order by p.created_at, p.id, d.id) - 1)::integer, p.id, d.id,
         pg_catalog.jsonb_build_object(
           'to', d.token,
           'sound', 'default',
           'title', t.text ->> 'title',
           'body', t.text ->> 'body',
           'data', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind', p.kind, 'event_id', p.event_id)))
    from pending p
    join public.push_devices d on d.user_id = p.user_id
    join public.user_settings s on s.user_id = p.user_id
    cross join lateral (select private.push_text(p.kind, s.locale) as text) t
   where private.push_allowed(p.user_id, p.kind);

  v_chunks := (select pg_catalog.ceil(pg_catalog.count(*) / 100.0)::integer from push_batch);
  for chunk in 0 .. v_chunks - 1 loop
    select pg_catalog.jsonb_agg(b.message order by b.position) into v_messages
      from push_batch b where b.position / 100 = chunk;
    select net.http_post(
             url := v_endpoint,
             body := v_messages,
             headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
             timeout_milliseconds := 10000)
      into v_request;
    insert into public.push_deliveries (outbox_id, device_id, request_id, position)
    select b.outbox_id, b.device_id, v_request, b.position - chunk * 100
      from push_batch b where b.position / 100 = chunk;
  end loop;
  return v_chunks;
end;
$$;

-- Reads Expo's answers to earlier batches: each ticket in order; a token that is no longer registered is deleted.
-- A batch without an answer after an hour is closed as an error.
create function private.push_collect()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_done integer := 0;
begin
  for r in
    select distinct d.request_id, h.status_code, h.content, h.error_msg
      from public.push_deliveries d
      left join net._http_response h on h.id = d.request_id
     where d.status = 'PENDING'
       and (h.id is not null or d.created_at < pg_catalog.now() - interval '1 hour')
  loop
    if r.status_code = 200 then
      update public.push_deliveries d
         set status = case when t.ticket ->> 'status' = 'ok' then 'SENT' else 'ERROR' end,
             error = case when t.ticket ->> 'status' = 'ok' then null
                          else pg_catalog.left(coalesce(t.ticket #>> '{details,error}', 'UNKNOWN'), 64) end
        from (select x.ticket, (x.ordinality - 1)::integer as position
                from pg_catalog.jsonb_array_elements(coalesce(r.content::jsonb -> 'data', '[]'::jsonb))
                     with ordinality as x(ticket, ordinality)) t
       where d.request_id = r.request_id and d.position = t.position and d.status = 'PENDING';
      delete from public.push_devices pd
       using public.push_deliveries d
       where d.request_id = r.request_id and d.device_id = pd.id and d.error = 'DeviceNotRegistered';
    end if;
    -- Anything still pending for this request (an HTTP error, no answer, a short ticket list) is an error.
    update public.push_deliveries d
       set status = 'ERROR',
           error = case when r.status_code is null then 'NO_RESPONSE' else 'HTTP_' || r.status_code end
     where d.request_id = r.request_id and d.status = 'PENDING';
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

-- Old delivery records are not kept.
create function private.prune_push()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_outbox where created_at < pg_catalog.now() - interval '30 days';
$$;

create function private.export_push_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'push_devices', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'platform', d.platform, 'token', d.token, 'created_at', d.created_at, 'last_seen_at', d.last_seen_at)
             order by d.created_at, d.id)
        from public.push_devices d where d.user_id = p_uid), '[]'::jsonb),
    'push_messages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'kind', o.kind, 'event_id', o.event_id, 'created_at', o.created_at, 'dispatched_at', o.dispatched_at)
             order by o.created_at, o.id)
        from public.push_outbox o where o.user_id = p_uid), '[]'::jsonb));
$$;

revoke all on function public.register_push_device(text, text), public.unregister_push_device(text),
  public.set_push_consents(boolean, boolean), public.send_test_push() from public, anon, authenticated;
grant execute on function public.register_push_device(text, text), public.unregister_push_device(text),
  public.set_push_consents(boolean, boolean), public.send_test_push() to authenticated;
revoke all on function private.set_push_consent(uuid, public.consent_kind, boolean), private.push_text(text, text),
  private.push_allowed(uuid, text), private.push_dispatch(), private.push_collect(), private.prune_push(),
  private.export_push_data(uuid) from public, anon, authenticated;

select cron.schedule('push-collect', '* * * * *', 'select private.push_collect()');
select cron.schedule('push-dispatch', '* * * * *', 'select private.push_dispatch()');
select cron.schedule('push-prune', '41 4 * * *', 'select private.prune_push()');

-- ---- export and purge (same signatures) -----------------------------------------------------------------------------------
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
  ) || private.export_event_data(v_uid) || private.export_place_data(v_uid) || private.export_analytics_data(v_uid)
    || private.export_push_data(v_uid) into v_result;

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
  delete from public.push_devices where user_id = p_uid;
  delete from public.push_outbox where user_id = p_uid;  -- deliveries cascade
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
