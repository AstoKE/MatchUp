-- Phase 11 / M1 (ADR-0032, ROADMAP P-05): recurring events. A series is made from a published event and opens the next
-- events by itself, two weeks ahead, as ordinary events (founder's decisions, 2026-11-14):
--   * every week or every two weeks; the weekday and time stay the same in Europe/Istanbul;
--   * players join each event separately; changing or stopping a series reaches only the events not opened yet;
--   * at most 2 active series per person; a new event counts towards the limit of upcoming published events, and a
--     week that does not fit is skipped, not the series;
--   * the series acts as its organizer only while they may organize, and with details that still validate.

insert into public.app_config (key, value) values
  ('quota.max_active_series', '2'::jsonb),
  ('series.horizon_days', '14'::jsonb)
on conflict (key) do nothing;

-- The row outlives a purge: deleting the series would touch its completed events, which are frozen (I-7). Deleting
-- the auth user at the end of a purge clears organizer_id, and the trigger below wipes the copied details.
create table public.event_series (
  id              uuid primary key default gen_random_uuid(),
  organizer_id    uuid references auth.users (id) on delete set null,
  interval_weeks  smallint not null check (interval_weeks in (1, 2)),
  template        jsonb not null check (jsonb_typeof(template) = 'object'),
  close_offset    interval check (close_offset is null or close_offset >= interval '0'),
  anchor_at       timestamptz not null,
  next_at         timestamptz not null,
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'STOPPED')),
  stopped_reason  text check (stopped_reason in ('BY_ORGANIZER', 'ORGANIZER_UNAVAILABLE', 'DETAILS_INVALID')),
  stopped_at      timestamptz,
  created_at      timestamptz not null default now(),
  check ((status = 'ACTIVE') = (stopped_reason is null and stopped_at is null))
);
create index event_series_organizer_idx on public.event_series (organizer_id);
create index event_series_due_idx on public.event_series (next_at) where status = 'ACTIVE';
alter table public.event_series enable row level security;
revoke all on public.event_series from anon, authenticated;

create function private.event_series_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organizer_id is null then
    new.template := '{}'::jsonb;
    new.close_offset := null;
    if new.status = 'ACTIVE' then
      new.status := 'STOPPED';
      new.stopped_reason := 'ORGANIZER_UNAVAILABLE';
      new.stopped_at := pg_catalog.now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.event_series_before_update() from public, anon, authenticated;
create trigger event_series_before_update before update on public.event_series
  for each row execute function private.event_series_before_update();

alter table public.events add column series_id uuid references public.event_series (id);
create unique index events_series_start_key on public.events (series_id, starts_at) where series_id is not null;

-- ---- helpers --------------------------------------------------------------------------------------------------------

-- Whether a person may organize right now: what assert_onboarded_user (and the account guard under it) checks, for a
-- given id instead of the caller, so the job can act for the organizer.
create function private.can_organize(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null)
     and exists (select 1 from public.profiles p
                  where p.id = p_uid and p.account_status = 'ACTIVE'
                    and p.adult_confirmed_at is not null and p.onboarded_at is not null)
     and private.legal_consent_current(p_uid)
     and (not private.config_bool('phone.required', false) or private.phone_verified(p_uid));
$$;

-- An event's details as event input, the way update_event rebuilds them (a venue hidden since is dropped). Without the
-- times: the series adds its own start and registration close to each event.
create function private.series_template(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(e) - array['id', 'organizer_id', 'client_request_id', 'starts_at', 'ends_at', 'registration_closes_at',
                              'status', 'invite_token', 'series_id', 'created_at', 'updated_at', 'published_at',
                              'canceled_at', 'completed_at', 'approved_count'])
         || pg_catalog.jsonb_build_object(
              'location_label', d.location_label, 'address_text', d.address_text,
              'participant_notes', d.participant_notes, 'point', private.point_json(d.exact_point),
              'venue_id', case when exists (select 1 from public.venues v
                                             where v.id = d.venue_id and v.listing_status = 'ACTIVE')
                               then d.venue_id end)
    from public.events e
    join public.event_private_details d on d.event_id = e.id
   where e.id = p_event;
$$;

-- The insert create_event has always done, shared with the series job so a new column cannot reach only one of them.
create function private.insert_event(p_uid uuid, p_client_request_id uuid, r private.event_input, p_series uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  pp   record;
begin
  select * into pp from private.public_point_of(r);
  insert into public.events (
    organizer_id, client_request_id, sport_id, sport_format_id, title, description, visibility, invite_token,
    starts_at, duration_minutes, ends_at, registration_closes_at, city_id, district_id, location_visibility,
    public_location_label, capacity, waitlist_enabled, auto_approve, setting, organizer_plays, skill_min, skill_max, booking_status,
    cost_amount_minor, cost_note, equipment_note, public_point, public_point_precision, series_id)
  values (
    p_uid, p_client_request_id, r.sport_id, r.sport_format_id, r.title, r.description, r.visibility,
    case when r.visibility = 'INVITE_ONLY' then private.new_invite_token() end,
    r.starts_at, r.duration_minutes, r.starts_at, r.registration_closes_at, r.city_id, r.district_id,
    r.location_visibility, case when r.location_visibility = 'PUBLIC' then r.location_label end,
    r.capacity, r.waitlist_enabled, r.auto_approve, r.setting, r.organizer_plays, r.skill_min, r.skill_max, r.booking_status,
    r.cost_amount_minor, r.cost_note, r.equipment_note, pp.point, pp.point_precision, p_series)
  returning id into v_id;
  insert into public.event_private_details (event_id, location_label, address_text, participant_notes, exact_point, venue_id)
  values (v_id, r.location_label, r.address_text, r.participant_notes, r.point, r.venue_id);
  return v_id;
end;
$$;

-- Same as 20261107100000, with the insert moved into private.insert_event.
create or replace function public.create_event(p_client_request_id uuid, p_input jsonb, p_publish boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  r     private.event_input;
  v_id  uuid;
begin
  if p_client_request_id is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.lock_organizer(v_uid);
  select e.id into v_id from public.events e
   where e.organizer_id = v_uid and e.client_request_id = p_client_request_id;
  if found then
    return v_id;
  end if;

  r := private.parse_event_input(p_input);
  if (select count(*) from public.events x
       where x.organizer_id = v_uid and x.created_at > pg_catalog.now() - interval '24 hours')
     >= private.account_quota(v_uid, 'quota.max_events_created_per_day', 10, 'quota.new_account_max_events_per_day', 2) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  v_id := private.insert_event(v_uid, p_client_request_id, r, null);
  if p_publish then
    perform private.publish_event_row(v_uid, v_id);
  end if;
  return v_id;
end;
$$;

-- The next start after p_at, the same weekday and local time (Turkey has no daylight saving today; this keeps it right
-- if that changes).
create function private.series_step(p_at timestamptz, p_weeks smallint)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((p_at at time zone 'Europe/Istanbul') + pg_catalog.make_interval(days => 7 * p_weeks)) at time zone 'Europe/Istanbul';
$$;

create function private.stop_series(p_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.event_series set status = 'STOPPED', stopped_reason = p_reason, stopped_at = pg_catalog.now()
   where id = p_id and status = 'ACTIVE';
$$;

-- Opens every event of one series that starts within the horizon. The caller holds the series row lock. A start too
-- close to publish is passed over; a week that does not fit the upcoming-events limit is retried next run until it is
-- too close, then passed over.
create function private.open_series(p_id uuid)
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

-- The hourly job. Each series in its own subtransaction: one that fails unexpectedly is left for the next run and does
-- not stop the others. Rows another run holds are skipped.
create function private.open_series_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_total integer := 0;
  v_until timestamptz := pg_catalog.now()
                         + pg_catalog.make_interval(days => private.config_int('series.horizon_days', 14));
begin
  for v_id in
    select s.id from public.event_series s
     where s.status = 'ACTIVE' and s.next_at <= v_until
     order by s.next_at
     for update skip locked
  loop
    begin
      v_total := v_total + private.open_series(v_id);
    exception when others then
      null;
    end;
  end loop;
  return v_total;
end;
$$;

-- ---- RPCs -----------------------------------------------------------------------------------------------------------

-- The organizer makes a series from a published, upcoming event of theirs and gets its id. Asking again for an event
-- already in an active series returns that series; an event of a stopped series can start a new one.
create function public.create_event_series(p_event_id uuid, p_interval_weeks integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_onboarded_user();
  e      public.events;
  v_tmpl jsonb;
  v_id   uuid;
begin
  if p_interval_weeks is null or p_interval_weeks not in (1, 2) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  perform private.lock_organizer(v_uid);
  select * into e from public.events x where x.id = p_event_id for update;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.series_id is not null then
    select s.id into v_id from public.event_series s where s.id = e.series_id and s.status = 'ACTIVE';
    if found then
      return v_id;
    end if;
  end if;
  if e.status <> 'PUBLISHED' or e.starts_at <= pg_catalog.now() then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if (select count(*) from public.event_series s where s.organizer_id = v_uid and s.status = 'ACTIVE')
     >= private.config_int('quota.max_active_series', 2) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  v_tmpl := private.series_template(e.id);
  perform private.parse_event_input(v_tmpl || pg_catalog.jsonb_build_object(
            'starts_at', e.starts_at, 'registration_closes_at', e.registration_closes_at));
  insert into public.event_series (organizer_id, interval_weeks, template, close_offset, anchor_at, next_at)
  values (v_uid, p_interval_weeks, v_tmpl, e.starts_at - e.registration_closes_at, e.starts_at,
          private.series_step(e.starts_at, p_interval_weeks::smallint))
  returning id into v_id;
  update public.events set series_id = v_id where id = e.id;
  perform private.open_series(v_id);
  return v_id;
end;
$$;

create function public.stop_event_series(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  perform 1 from public.event_series s where s.id = p_series_id and s.organizer_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.stop_series(p_series_id, 'BY_ORGANIZER');
end;
$$;

-- The series an event belongs to, for anyone who can see the event (the get_event_organization rule). Why it stopped
-- and the next start are the organizer's.
create function public.get_event_series(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'id', s.id, 'interval_weeks', s.interval_weeks, 'status', s.status,
           'is_mine', s.organizer_id = (select auth.uid()),
           'stopped_reason', case when s.organizer_id = (select auth.uid()) then s.stopped_reason end,
           'next_at', case when s.organizer_id = (select auth.uid()) and s.status = 'ACTIVE' then s.next_at end)
    from public.events e
    join public.event_series s on s.id = e.series_id
   where e.id = p_event_id
     and ((e.visibility = 'PUBLIC' and e.status in ('PUBLISHED', 'COMPLETED'))
          or e.organizer_id = (select auth.uid())
          or exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = (select auth.uid())));
$$;

-- The caller's series, newest first, each with its upcoming published events.
create function public.list_my_event_series()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', s.id, 'title', s.template ->> 'title', 'interval_weeks', s.interval_weeks, 'status', s.status,
             'stopped_reason', s.stopped_reason, 'anchor_at', s.anchor_at,
             'next_at', case when s.status = 'ACTIVE' then s.next_at end, 'created_at', s.created_at,
             'upcoming', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', e.id, 'starts_at', e.starts_at)
                                           order by e.starts_at)
                 from public.events e
                where e.series_id = s.id and e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()), '[]'::jsonb))
           order by s.created_at desc, s.id)
      from public.event_series s where s.organizer_id = v_uid), '[]'::jsonb);
end;
$$;

-- ---- account export (ADR-0017) --------------------------------------------------------------------------------------
create function private.export_series_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('event_series', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'interval_weeks', s.interval_weeks, 'details', s.template, 'first_start', s.anchor_at,
             'status', s.status, 'stopped_reason', s.stopped_reason, 'stopped_at', s.stopped_at,
             'created_at', s.created_at)
           order by s.created_at, s.id)
      from public.event_series s where s.organizer_id = p_uid), '[]'::jsonb));
$$;

-- Same as 20261122100000, plus the series.
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
    || private.export_push_data(v_uid) || private.export_feedback_data(v_uid) || private.export_organization_data(v_uid)
    || private.export_business_data(v_uid) || private.export_series_data(v_uid)
    into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

-- ---- the job and grants ---------------------------------------------------------------------------------------------
select cron.schedule('open-series-events', '7 * * * *', 'select private.open_series_events()');

revoke all on function private.can_organize(uuid), private.series_template(uuid),
  private.insert_event(uuid, uuid, private.event_input, uuid), private.series_step(timestamptz, smallint),
  private.stop_series(uuid, text), private.open_series(uuid), private.open_series_events(),
  private.export_series_data(uuid)
  from public, anon, authenticated;
revoke all on function public.create_event_series(uuid, integer), public.stop_event_series(uuid),
  public.get_event_series(uuid), public.list_my_event_series()
  from public, anon, authenticated;
grant execute on function public.create_event_series(uuid, integer), public.stop_event_series(uuid),
  public.get_event_series(uuid), public.list_my_event_series()
  to authenticated;
