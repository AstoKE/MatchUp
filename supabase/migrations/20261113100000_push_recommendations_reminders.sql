-- Phase 8 / M5: what push sends (docs/PHASE8_PLAN.md M5, ADR-0028).
--
-- * Events for you (PUSH_RECOMMENDATIONS): every 10 minutes, a published public event with room, starting in two hours or
--   later, published in the last 36 hours, is matched to people who play its sport, live in its province and (when the
--   event names a level range) are within it. Never the organizer, someone already in the event, or a blocked pair; never
--   the same event twice. At most one a day per person (Istanbul day).
-- * Reminders (PUSH_REMINDERS): every hour, people whose phones have not opened the app for 7 days get one if their
--   province has upcoming events. At most 2 in 7 days, at least 48 hours apart (founder, 2026-11-07).
-- * Quiet hours 22:00–09:00 Istanbul: nothing is queued; the night's events are recommended in the morning.
-- * Text: fixed and localized, with the sport, district, province and a count; never a person.

alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('TEST', 'RECOMMENDATION', 'REMINDER'));
-- Catalog names for the text (sport, district, province) and a count: no personal data.
alter table public.push_outbox add column args jsonb not null default '{}'::jsonb
  check (jsonb_typeof(args) = 'object' and pg_column_size(args) <= 512);
create index push_outbox_user_kind_idx on public.push_outbox (user_id, kind, created_at);

create table private.push_recommended (
  user_id    uuid not null,
  event_id   uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table private.push_recommended enable row level security;
revoke all on private.push_recommended from public, anon, authenticated;

insert into public.app_config (key, value) values
  ('push.quiet_from_hour', '22'::jsonb),
  ('push.quiet_until_hour', '9'::jsonb),
  ('push.recommendations_per_day', '1'::jsonb),
  ('push.reminders_per_week', '2'::jsonb),
  ('push.reminder_gap_hours', '48'::jsonb),
  ('push.reminder_inactive_days', '7'::jsonb)
on conflict (key) do nothing;

-- Quiet hours, in Istanbul time.
create function private.push_quiet(p_now timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when private.config_int('push.quiet_from_hour', 22) > private.config_int('push.quiet_until_hour', 9)
      then extract(hour from p_now at time zone 'Europe/Istanbul') >= private.config_int('push.quiet_from_hour', 22)
        or extract(hour from p_now at time zone 'Europe/Istanbul') < private.config_int('push.quiet_until_hour', 9)
    else extract(hour from p_now at time zone 'Europe/Istanbul') >= private.config_int('push.quiet_from_hour', 22)
     and extract(hour from p_now at time zone 'Europe/Istanbul') < private.config_int('push.quiet_until_hour', 9)
  end;
$$;

-- The text of each kind, in the person's language, from catalog names and a count.
drop function private.push_text(text, text);
create function private.push_text(p_kind text, p_locale text, p_args jsonb)
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
  end;
$$;

-- Whether a person may receive a kind now: an active account and the matching consent (the test needs none).
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
             else false
           end);
$$;

-- Events for you. Returns the number of messages queued.
create function private.queue_recommendations(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day   timestamptz := (pg_catalog.date_trunc('day', p_now at time zone 'Europe/Istanbul')) at time zone 'Europe/Istanbul';
  v_count integer;
begin
  if private.push_quiet(p_now) then
    return 0;
  end if;
  -- One run at a time (a slow run and the next tick never queue twice).
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('push:recommendations', 0)) then
    return 0;
  end if;
  -- People first (consent, phone, under the day's limit), then their pairs with the candidate events: the per-person
  -- checks run once per person, not once per pair (5,000 people × 50 events measured, docs/PHASE8_PLAN.md M5).
  with people as (
    select p.id as user_id, p.city_id
      from public.profiles p
      join public.user_settings s on s.user_id = p.id
     where p.account_status = 'ACTIVE' and p.onboarded_at is not null and p.city_id is not null
       and s.push_recommendations_at is not null
       and exists (select 1 from public.push_devices d where d.user_id = p.id)
       and (select pg_catalog.count(*) from public.push_outbox o
             where o.user_id = p.id and o.kind = 'RECOMMENDATION' and o.created_at >= v_day)
           < private.config_int('push.recommendations_per_day', 1)
  ), candidates as materialized (
    select e.id, e.sport_id, e.city_id, e.district_id, e.organizer_id, e.starts_at, e.skill_min, e.skill_max
      from public.events e
     where e.status = 'PUBLISHED' and e.visibility = 'PUBLIC'
       and e.published_at > p_now - interval '36 hours'
       and e.starts_at > p_now + interval '2 hours'
       and e.approved_count < e.capacity
       and exists (select 1 from public.profiles o where o.id = e.organizer_id and o.account_status = 'ACTIVE')
  ), matches as (
    -- For each person, the soonest event that fits: the search stops at the first one.
    select pe.user_id, m.event_id, m.sport_id, m.district_id
      from people pe
      cross join lateral (
        select c.id as event_id, c.sport_id, c.district_id
          from candidates c
          join public.user_sport_profiles u on u.user_id = pe.user_id and u.sport_id = c.sport_id
         where c.city_id = pe.city_id and c.organizer_id <> pe.user_id
           and (c.skill_min is null or u.self_assessed_level >= c.skill_min)
           and (c.skill_max is null or u.self_assessed_level <= c.skill_max)
           and not exists (select 1 from public.event_participations x where x.event_id = c.id and x.user_id = pe.user_id)
           and not exists (select 1 from private.push_recommended r where r.user_id = pe.user_id and r.event_id = c.id)
           -- The same rule as private.is_blocked_pair, as two index lookups.
           and not exists (select 1 from public.user_blocks b where b.blocker_id = pe.user_id and b.blocked_id = c.organizer_id)
           and not exists (select 1 from public.user_blocks b where b.blocker_id = c.organizer_id and b.blocked_id = pe.user_id)
         order by c.starts_at, c.id
         limit 1) m
  ), queued as (
    insert into public.push_outbox (user_id, kind, event_id, args, created_at)
    select m.user_id, 'RECOMMENDATION', m.event_id,
           pg_catalog.jsonb_build_object(
             'sport', (select sp.names from public.sports sp where sp.id = m.sport_id),
             'district', (select di.names from public.districts di where di.id = m.district_id)),
           p_now
      from matches m
    returning user_id, event_id
  )
  insert into private.push_recommended (user_id, event_id, created_at)
  select q.user_id, q.event_id, p_now from queued q;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Reminders. Returns the number of messages queued.
create function private.queue_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if private.push_quiet(p_now) then
    return 0;
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('push:reminders', 0)) then
    return 0;
  end if;
  with eligible as (
    select p.id as user_id, p.city_id
      from public.profiles p
      join public.user_settings s on s.user_id = p.id
     where p.account_status = 'ACTIVE' and p.onboarded_at is not null and p.city_id is not null
       and s.push_reminders_at is not null
       -- The phone has not opened the app for a while (it refreshes its token on every start).
       and (select pg_catalog.max(d.last_seen_at) from public.push_devices d where d.user_id = p.id)
           < p_now - pg_catalog.make_interval(days => private.config_int('push.reminder_inactive_days', 7))
       and (select pg_catalog.count(*) from public.push_outbox o
             where o.user_id = p.id and o.kind = 'REMINDER' and o.created_at > p_now - interval '7 days')
           < private.config_int('push.reminders_per_week', 2)
       and not exists (select 1 from public.push_outbox o
                        where o.user_id = p.id and o.kind = 'REMINDER'
                          and o.created_at > p_now - pg_catalog.make_interval(hours => private.config_int('push.reminder_gap_hours', 48)))
  ), counted as (
    select el.user_id, el.city_id,
           (select pg_catalog.count(*) from public.events e
             where e.city_id = el.city_id and e.status = 'PUBLISHED' and e.visibility = 'PUBLIC'
               and e.starts_at > p_now and e.starts_at < p_now + interval '7 days'
               and e.approved_count < e.capacity
               and e.organizer_id <> el.user_id) as upcoming
      from eligible el
  )
  insert into public.push_outbox (user_id, kind, args, created_at)
  select c.user_id, 'REMINDER',
         pg_catalog.jsonb_build_object('city', (select ci.names from public.cities ci where ci.id = c.city_id),
                                       'count', c.upcoming),
         p_now
    from counted c
   where c.upcoming > 0;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.push_quiet(timestamptz), private.push_text(text, text, jsonb),
  private.queue_recommendations(timestamptz), private.queue_reminders(timestamptz)
  from public, anon, authenticated;

select cron.schedule('push-recommendations', '*/10 * * * *', 'select private.queue_recommendations()');
select cron.schedule('push-reminders', '5 * * * *', 'select private.queue_reminders()');

-- The sender passes the new arguments to the text, and takes up to 1,000 rows a run (requests stay at 100 messages):
-- a morning of recommendations leaves within minutes, not hours (same signature).
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
$function$;

-- Which events were recommended to whom is kept 30 days, like the messages.
create or replace function private.prune_push()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_outbox where created_at < pg_catalog.now() - interval '30 days';
  delete from private.push_recommended where created_at < pg_catalog.now() - interval '30 days';
$$;

-- The purge also forgets which events were recommended to the person (same signature).
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
  delete from private.push_recommended where user_id = p_uid;
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
