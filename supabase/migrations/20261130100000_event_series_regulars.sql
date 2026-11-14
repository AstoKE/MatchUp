-- Phase 11 / M3 (ADR-0032): the regulars, changing a series, and the series that stop by themselves.
--
-- * When the job opens an event of a series, the players approved for the previous event (the latest earlier one not
--   canceled) are told: an in-app notification SERIES_EVENT_OPENED, and a push behind the "my events" switch. No seat
--   is kept for them; they join the new event like anybody else. Not told: the organizer, accounts that are not active,
--   and anyone in a block with the organizer (blocks are mutual and silent).
-- * apply_event_to_series: the organizer copies an opened, upcoming event's details, weekday, time and registration
--   close into its active series. Opened events stay as they are; the series continues in the period after the last
--   opened event (the week after, or two weeks after for a fortnightly series).
-- * A series stops by itself (NO_PLAYERS) when its last 3 events that took place had no approved player besides the
--   organizer. Canceled events do not count.
-- * When a series stops by itself (not by the organizer's hand, and not through a purge), its organizer gets an in-app
--   SERIES_STOPPED notification, while the account is active. The reason is a template key in the payload.
-- * Notification payloads carry ids and template keys only (SECURITY §6).

insert into public.app_config (key, value) values
  ('series.empty_events_to_stop', '3'::jsonb)
on conflict (key) do nothing;

alter table public.event_series drop constraint event_series_stopped_reason_check;
alter table public.event_series add constraint event_series_stopped_reason_check
  check (stopped_reason in ('BY_ORGANIZER', 'ORGANIZER_UNAVAILABLE', 'DETAILS_INVALID', 'NO_PLAYERS'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER',
  'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED', 'ORGANIZATION_INVITED', 'ORGANIZATION_JOIN_REQUESTED',
  'ORGANIZATION_MEMBER_APPROVED', 'BUSINESS_APPROVED', 'BUSINESS_REJECTED', 'BUSINESS_STAFF_INVITED',
  'SERIES_EVENT_OPENED', 'SERIES_STOPPED'));

alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('TEST', 'RECOMMENDATION', 'REMINDER', 'JOIN_REQUEST', 'REQUEST_APPROVED', 'SERIES_EVENT_OPENED'));

-- ---- stopping ---------------------------------------------------------------------------------------------------------

-- As in 20261128100000, plus the organizer's notification when the series stops by itself.
create or replace function private.stop_series(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  update public.event_series set status = 'STOPPED', stopped_reason = p_reason, stopped_at = pg_catalog.now()
   where id = p_id and status = 'ACTIVE'
  returning organizer_id into v_uid;
  if not found or p_reason = 'BY_ORGANIZER' or v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.account_status = 'ACTIVE') then
    return;
  end if;
  perform private.notify(v_uid, 'SERIES_STOPPED',
    pg_catalog.jsonb_build_object(
      'series_id', p_id,
      'reason', p_reason,
      -- The latest event of the series: its management page says why the series stopped.
      'event_id', (select e.id from public.events e where e.series_id = p_id order by e.starts_at desc limit 1)),
    'SERIES_STOPPED:' || p_id::text);
end;
$$;

-- Whether the last events of a series that took place all ended without a player besides the organizer.
create function private.series_has_no_players(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select e.id from public.events e
     where e.series_id = p_id and e.status in ('PUBLISHED', 'COMPLETED') and e.ends_at <= pg_catalog.now()
     order by e.starts_at desc
     limit private.config_int('series.empty_events_to_stop', 3)
  )
  select pg_catalog.count(*) = private.config_int('series.empty_events_to_stop', 3)
         and not exists (select 1 from public.event_participations p
                          where p.event_id in (select id from recent) and p.status = 'APPROVED' and not p.is_organizer)
    from recent;
$$;

-- ---- the regulars -----------------------------------------------------------------------------------------------------

-- Tells the players approved for the event before p_event in its series that p_event is open.
create function private.notify_series_regulars(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e      public.events;
  v_prev uuid;
begin
  select * into e from public.events where id = p_event;
  select x.id into v_prev from public.events x
   where x.series_id = e.series_id and x.starts_at < e.starts_at and x.status <> 'CANCELED'
   order by x.starts_at desc limit 1;
  if v_prev is null then
    return;
  end if;
  perform private.notify(p.user_id, 'SERIES_EVENT_OPENED',
            pg_catalog.jsonb_build_object('event_id', e.id, 'series_id', e.series_id),
            'SERIES_EVENT_OPENED:' || e.id::text || ':' || p.user_id::text)
     from public.event_participations p
     join public.profiles pr on pr.id = p.user_id and pr.account_status = 'ACTIVE'
    where p.event_id = v_prev and p.status = 'APPROVED' and not p.is_organizer
      and not private.is_blocked_pair(p.user_id, e.organizer_id)
      and not exists (select 1 from public.event_participations q where q.event_id = e.id and q.user_id = p.user_id);
end;
$$;

-- As in 20261128100000, plus: a series whose last events had nobody stops (NO_PLAYERS) before opening another, and
-- each event it opens is announced to the previous event's players.
create or replace function private.open_series(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.event_series;
  r        private.event_input;
  v_id     uuid;
  v_org    uuid;
  v_opened integer := 0;
  v_lead   interval := pg_catalog.make_interval(mins => private.config_int('event.min_lead_minutes', 60));
  v_until  timestamptz := pg_catalog.now()
                          + pg_catalog.make_interval(days => private.config_int('series.horizon_days', 14));
begin
  select * into s from public.event_series where id = p_id;
  if not found or s.status <> 'ACTIVE' then
    return 0;
  end if;
  if not private.can_organize(s.organizer_id) then
    perform private.stop_series(s.id, 'ORGANIZER_UNAVAILABLE');
    return 0;
  end if;
  if private.series_has_no_players(s.id) then
    perform private.stop_series(s.id, 'NO_PLAYERS');
    return 0;
  end if;
  perform private.lock_organizer(s.organizer_id);

  while s.next_at <= v_until loop
    if s.next_at >= pg_catalog.now() + v_lead then
      begin
        r := private.parse_event_input(
               s.template || pg_catalog.jsonb_build_object(
                 'starts_at', s.next_at,
                 'registration_closes_at', s.next_at - s.close_offset));
      exception when sqlstate 'P0001' then
        perform private.stop_series(s.id, 'DETAILS_INVALID');
        return v_opened;
      end;
      begin
        v_id := private.insert_event(
                  s.organizer_id,
                  md5(s.id::text || ':' || extract(epoch from s.next_at)::text)::uuid,
                  r, s.id);
        perform private.publish_event_row(s.organizer_id, v_id);
        v_org := (s.template ->> 'organization_id')::uuid;
        if v_org is not null
           and exists (select 1 from public.organizations o where o.id = v_org and o.status = 'ACTIVE')
           and private.organization_role(v_org, s.organizer_id) in ('OWNER', 'ADMIN') then
          update public.events set organization_id = v_org where id = v_id;
        end if;
        perform private.notify_series_regulars(v_id);
        v_opened := v_opened + 1;
      exception
        when unique_violation then
          null;  -- this start is taken (an event of the series was moved onto it): leave it
        when sqlstate 'P0001' then
          if sqlerrm = 'QUOTA_EXCEEDED' then
            exit;  -- keep next_at: the next run tries this week again
          end if;
          raise;
      end;
    end if;
    s.next_at := private.series_step(s.next_at, s.interval_weeks);
  end loop;
  update public.event_series set next_at = s.next_at where id = s.id;
  return v_opened;
end;
$$;

-- ---- changing the series ----------------------------------------------------------------------------------------------

-- "The next events should be like this one." The organizer of an opened, upcoming event of an active series copies its
-- details, weekday, time and registration close into the series. Returns the next start the series will open.
create function public.apply_event_to_series(p_event_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  e        public.events;
  s        public.event_series;
  v_tmpl   jsonb;
  v_last   timestamptz;
  v_next   timestamptz;
begin
  select * into e from public.events x where x.id = p_event_id;
  if not found or e.organizer_id <> v_uid or e.series_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  -- The series row first, then the organizer: the order the hourly job takes them in, so the two cannot deadlock.
  select * into s from public.event_series x where x.id = e.series_id for update;
  perform private.lock_organizer(v_uid);
  select * into e from public.events x where x.id = p_event_id;
  if s.status <> 'ACTIVE' or e.status <> 'PUBLISHED' or e.starts_at <= pg_catalog.now() then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  v_tmpl := private.series_template(e.id);
  perform private.parse_event_input(v_tmpl || pg_catalog.jsonb_build_object(
            'starts_at', e.starts_at, 'registration_closes_at', e.registration_closes_at));

  -- The first start on the new schedule in a period after the last event already opened (any status: a canceled week
  -- stays canceled).
  select max(x.starts_at) into v_last from public.events x where x.series_id = s.id;
  v_next := private.series_step(e.starts_at, s.interval_weeks);
  while pg_catalog.date_trunc('week', v_next at time zone 'Europe/Istanbul')
        < pg_catalog.date_trunc('week', v_last at time zone 'Europe/Istanbul')
          + pg_catalog.make_interval(days => 7 * s.interval_weeks) loop
    v_next := private.series_step(v_next, s.interval_weeks);
  end loop;

  update public.event_series
     set template = v_tmpl, close_offset = e.starts_at - e.registration_closes_at, next_at = v_next
   where id = s.id;
  perform private.open_series(s.id);
  return v_next;
end;
$$;

-- ---- push ---------------------------------------------------------------------------------------------------------------

-- As in 20261116100000, plus SERIES_EVENT_OPENED.
create or replace function private.queue_activity_push()
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
  elsif new.type = 'SERIES_EVENT_OPENED' then
    v_kind := 'SERIES_EVENT_OPENED';
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
    -- A push is a convenience: the change it is about must never fail because of it.
    return new;
  end;
  return new;
end;
$$;

drop trigger notifications_activity_push on public.notifications;
create trigger notifications_activity_push
  after insert on public.notifications
  for each row when (new.type in ('JOIN_REQUESTED', 'REQUEST_APPROVED', 'SERIES_EVENT_OPENED'))
  execute function private.queue_activity_push();

-- As in 20261116100000, plus SERIES_EVENT_OPENED: still worth saying while the event is open to join and the player
-- has not joined it already.
create or replace function private.push_relevant(p_kind text, p_uid uuid, p_event uuid)
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
    when 'SERIES_EVENT_OPENED' then exists (
      select 1 from public.events e
       where e.id = p_event and e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()
         and (e.registration_closes_at is null or e.registration_closes_at > pg_catalog.now())
         and not exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = p_uid))
    else true
  end;
$$;

-- As in 20261116100000, plus SERIES_EVENT_OPENED.
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
    when 'SERIES_EVENT_OPENED' then case when p_locale = 'en'
      then pg_catalog.jsonb_build_object('title', 'Next game is open',
             'body', concat_ws(' · ', p_args #>> '{sport,en}', p_args #>> '{district,en}') || ': the next game of an event you played is open. Tap to join.')
      else pg_catalog.jsonb_build_object('title', 'Yeni hafta açıldı',
             'body', concat_ws(' · ', p_args #>> '{sport,tr}', p_args #>> '{district,tr}') || ': oynadığın etkinliğin yeni haftası açıldı. Katılmak için dokun.') end
  end;
$$;

-- As in 20261116100000, plus SERIES_EVENT_OPENED under "my events".
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
             when 'SERIES_EVENT_OPENED' then s.push_activity
             else false
           end);
$$;

revoke all on function private.series_has_no_players(uuid), private.notify_series_regulars(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_event_to_series(uuid) from public, anon, authenticated;
grant execute on function public.apply_event_to_series(uuid) to authenticated;
