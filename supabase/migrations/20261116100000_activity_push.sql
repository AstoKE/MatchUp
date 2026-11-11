-- ROADMAP P-20 (founder, 2026-11-10): push for a new join request (to the organizer) and an approval (to the player).
-- ADR-0028 addendum.
--
-- * Its own switch, "my events" (user_settings.push_activity), separate from the two promotional consents. These messages
--   are about the person's own events, not advertising, so it is a preference that starts on (founder, 2026-11-11), not a
--   recorded consent. Existing accounts that answered the popup with nothing on start with it off: they said no to push.
--   Nothing reaches a phone that has not allowed notifications: the app registers a token only with OS permission.
-- * Queued by a trigger on the in-app notifications that already exist (JOIN_REQUESTED with status REQUESTED, i.e. one
--   that needs a decision; REQUEST_APPROVED), so every path that writes them is covered. The trigger never breaks the
--   request or the approval: if queueing fails, the in-app notification still stands.
-- * No burst: while a message for the same person, kind and event is waiting, or was sent in the last 30 minutes, no
--   second one is queued.
-- * Quiet hours (22:00–09:00 Istanbul) delay these messages instead of dropping them (push_outbox.send_after). When the
--   time comes, the sender checks they still mean something: the event has not started, the request is still open, the
--   player is still approved.
-- * Text: fixed and localized, with the sport and district; never a person's name, a message or a place.

alter table public.user_settings add column push_activity boolean not null default true;
update public.user_settings
   set push_activity = false
 where push_prompted_at is not null and push_recommendations_at is null and push_reminders_at is null;

alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('TEST', 'RECOMMENDATION', 'REMINDER', 'JOIN_REQUEST', 'REQUEST_APPROVED'));
alter table public.push_outbox add column send_after timestamptz;
create index push_outbox_user_event_idx on public.push_outbox (user_id, event_id, kind, created_at) where event_id is not null;

insert into public.app_config (key, value) values
  ('push.activity_window_minutes', '30'::jsonb)
on conflict (key) do nothing;

-- The end of the quiet hours that contain p_now (null outside them), in Istanbul time.
create function private.push_quiet_until(p_now timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local  timestamp := p_now at time zone 'Europe/Istanbul';
  v_target timestamp;
begin
  if not private.push_quiet(p_now) then
    return null;
  end if;
  v_target := pg_catalog.date_trunc('day', v_local) + pg_catalog.make_interval(hours => private.config_int('push.quiet_until_hour', 9));
  if v_target <= v_local then
    v_target := v_target + interval '1 day';
  end if;
  return v_target at time zone 'Europe/Istanbul';
end;
$$;

-- Queues the push for an in-app notification that has one. Called by the trigger below.
create function private.queue_activity_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  text;
  v_event uuid;
  e       public.events;
begin
  if new.type = 'JOIN_REQUESTED' and new.payload ->> 'status' = 'REQUESTED' then
    v_kind := 'JOIN_REQUEST';
  elsif new.type = 'REQUEST_APPROVED' then
    v_kind := 'REQUEST_APPROVED';
  else
    return new;
  end if;
  begin
    v_event := (new.payload ->> 'event_id')::uuid;
    select * into e from public.events x where x.id = v_event;
    if not found then
      return new;
    end if;
    -- Cheap checks first: the switch and a registered phone (the sender checks again when it sends).
    if not exists (select 1 from public.user_settings s where s.user_id = new.user_id and s.push_activity)
       or not exists (select 1 from public.push_devices d where d.user_id = new.user_id) then
      return new;
    end if;
    if exists (select 1 from public.push_outbox o
                where o.user_id = new.user_id and o.event_id = v_event and o.kind = v_kind
                  and (o.dispatched_at is null
                       or o.created_at > pg_catalog.now()
                          - pg_catalog.make_interval(mins => private.config_int('push.activity_window_minutes', 30)))) then
      return new;
    end if;
    insert into public.push_outbox (user_id, kind, event_id, args, send_after)
    values (new.user_id, v_kind, v_event,
            pg_catalog.jsonb_build_object(
              'sport', (select sp.names from public.sports sp where sp.id = e.sport_id),
              'district', (select di.names from public.districts di where di.id = e.district_id)),
            private.push_quiet_until(pg_catalog.now()));
  exception when others then
    -- A push is a convenience: the request or approval it is about must never fail because of it.
    return new;
  end;
  return new;
end;
$$;

create trigger notifications_activity_push
  after insert on public.notifications
  for each row when (new.type in ('JOIN_REQUESTED', 'REQUEST_APPROVED'))
  execute function private.queue_activity_push();

-- Whether a waiting message still means something when it is sent (a request decided overnight is not announced).
create function private.push_relevant(p_kind text, p_uid uuid, p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'JOIN_REQUEST' then exists (
      select 1 from public.events e
       where e.id = p_event and e.organizer_id = p_uid and e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()
         and exists (select 1 from public.event_participations p where p.event_id = e.id and p.status = 'REQUESTED'))
    when 'REQUEST_APPROVED' then exists (
      select 1 from public.events e
        join public.event_participations p on p.event_id = e.id and p.user_id = p_uid
       where e.id = p_event and e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now() and p.status = 'APPROVED')
    else true
  end;
$$;

-- The text of each kind, in the person's language (same signature; two kinds added).
create or replace function private.push_text(p_kind text, p_locale text, p_args jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'TEST' then case when p_locale = 'en'
      then '{"title": "Notifications are on", "body": "This is a test notification."}'::jsonb
      else '{"title": "Bildirimler açık", "body": "Bu bir deneme bildirimi."}'::jsonb end
    when 'RECOMMENDATION' then case when p_locale = 'en'
      then pg_catalog.jsonb_build_object('title', 'A new game for you',
             'body', concat_ws(' · ', p_args #>> '{sport,en}', p_args #>> '{district,en}') || '. Tap to see it.')
      else pg_catalog.jsonb_build_object('title', 'Sana uygun yeni bir maç',
             'body', concat_ws(' · ', p_args #>> '{sport,tr}', p_args #>> '{district,tr}') || '. Görmek için dokun.') end
    when 'REMINDER' then case when p_locale = 'en'
      then pg_catalog.jsonb_build_object('title', 'Up for a game this week?',
             'body', (p_args #>> '{city,en}') || ': ' || (p_args ->> 'count')
                     || case when (p_args ->> 'count') = '1' then ' upcoming event is waiting.' else ' upcoming events are waiting.' end)
      else pg_catalog.jsonb_build_object('title', 'Bu hafta oynamaya ne dersin?',
             'body', (p_args #>> '{city,tr}') || ': yaklaşan ' || (p_args ->> 'count') || ' etkinlik seni bekliyor.') end
    when 'JOIN_REQUEST' then case when p_locale = 'en'
      then pg_catalog.jsonb_build_object('title', 'New join request',
             'body', concat_ws(' · ', p_args #>> '{sport,en}', p_args #>> '{district,en}') || ': someone wants to join your event. Tap to decide.')
      else pg_catalog.jsonb_build_object('title', 'Yeni katılım isteği',
             'body', concat_ws(' · ', p_args #>> '{sport,tr}', p_args #>> '{district,tr}') || ': etkinliğine katılmak isteyen var. Karar vermek için dokun.') end
    when 'REQUEST_APPROVED' then case when p_locale = 'en'
      then pg_catalog.jsonb_build_object('title', 'You''re in',
             'body', concat_ws(' · ', p_args #>> '{sport,en}', p_args #>> '{district,en}') || ': your request was approved. Tap to see the event.')
      else pg_catalog.jsonb_build_object('title', 'İsteğin onaylandı',
             'body', concat_ws(' · ', p_args #>> '{sport,tr}', p_args #>> '{district,tr}') || ': etkinliğe katılıyorsun. Görmek için dokun.') end
  end;
$$;

-- Whether a person may receive a kind now (same signature; the two kinds follow "my events").
create or replace function private.push_allowed(p_uid uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.user_settings s on s.user_id = p.id
     where p.id = p_uid and p.account_status = 'ACTIVE'
       and case p_kind
             when 'TEST' then true
             when 'RECOMMENDATION' then s.push_recommendations_at is not null
             when 'REMINDER' then s.push_reminders_at is not null
             when 'JOIN_REQUEST' then s.push_activity
             when 'REQUEST_APPROVED' then s.push_activity
             else false
           end);
$$;

-- The sender (same signature): skips messages whose time has not come, and closes those that no longer mean anything.
CREATE OR REPLACE FUNCTION private.push_dispatch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       and (o.send_after is null or o.send_after <= pg_catalog.now())
     order by o.created_at, o.id
     limit 1000
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
    cross join lateral (select private.push_text(p.kind, s.locale, p.args) as text) t
   where private.push_allowed(p.user_id, p.kind)
     and private.push_relevant(p.kind, p.user_id, p.event_id);

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
$function$;

-- All three choices at once (the popup and Settings of new app versions). set_push_consents(boolean, boolean) stays for
-- installed apps and leaves "my events" as it is.
create function public.set_push_preferences(p_recommendations boolean, p_reminders boolean, p_activity boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_activity is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform public.set_push_consents(p_recommendations, p_reminders);
  update public.user_settings set push_activity = p_activity where user_id = v_uid;
end;
$$;

revoke all on function public.set_push_preferences(boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_push_preferences(boolean, boolean, boolean) to authenticated;
revoke all on function private.push_quiet_until(timestamptz), private.queue_activity_push(),
  private.push_relevant(text, uuid, uuid), private.push_text(text, text, jsonb), private.push_allowed(uuid, text),
  private.push_dispatch()
  from public, anon, authenticated;
