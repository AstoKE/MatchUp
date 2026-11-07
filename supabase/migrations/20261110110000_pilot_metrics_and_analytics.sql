-- Phase 7 / M4: pilot metrics and opt-in usage analytics (ADR-0025, docs/PHASE7_PLAN.md).
--
-- Two different things:
--   * Pilot metrics (registrations, fill rate, no-shows, provinces) are computed from the data the service already
--     holds to work at all (events, participations), for administrators at aal2 only. No extra tracking.
--   * Usage analytics (which parts of the app are used: the map opened, a filter applied) are recorded ONLY for a
--     person who gave the separate, explicit ANALYTICS consent (off by default). No free text, no coordinates, no ids of
--     other people: event names from an allow-list with a few coded properties. Withdrawing the consent stops it and
--     deletes what was recorded. Guests are never recorded.

alter table public.user_settings add column analytics_consent_at timestamptz;

create table public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (name in ('discover_viewed', 'filter_applied', 'event_detail_viewed', 'map_opened',
                                            'near_me_used', 'venue_suggest_opened')),
  props       jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 256),
  occurred_at timestamptz not null default now()
);
create index analytics_events_name_time_idx on public.analytics_events (name, occurred_at);
create index analytics_events_user_idx on public.analytics_events (user_id, occurred_at);
alter table public.analytics_events enable row level security;
-- Written by track_event, read by admin_pilot_metrics, exported and purged: never by the API roles directly.
revoke all on public.analytics_events from anon, authenticated;

-- The properties each event may carry, and their allowed values: codes only.
create function private.analytics_props_ok(p_name text, p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from pg_catalog.jsonb_each(p) e
        where not (
          (p_name = 'discover_viewed' and e.key = 'view' and e.value in ('"LIST"', '"MAP"'))
          or (p_name = 'filter_applied' and e.key = 'kind'
              and e.value in ('"SPORT"', '"DATE"', '"TIME"', '"SETTING"', '"DISTRICT"', '"OPEN"', '"CITY"'))
          or (p_name = 'map_opened' and e.key = 'where' and e.value in ('"DISCOVER"', '"PIN"', '"VENUE"'))
          or (p_name = 'near_me_used' and e.key = 'result' and e.value in ('"OK"', '"DENIED"', '"UNAVAILABLE"'))));
$$;
revoke all on function private.analytics_props_ok(text, jsonb) from public, anon, authenticated;

create function public.set_analytics_consent(p_granted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_granted is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_granted then
    insert into public.user_consents (user_id, kind, version) values (v_uid, 'ANALYTICS', 'v1')
    on conflict (user_id, kind, version) do update set revoked_at = null, granted_at = pg_catalog.now();
    update public.user_settings set analytics_consent_at = pg_catalog.now() where user_id = v_uid;
  else
    update public.user_consents set revoked_at = pg_catalog.now()
     where user_id = v_uid and kind = 'ANALYTICS' and revoked_at is null;
    update public.user_settings set analytics_consent_at = null where user_id = v_uid;
    -- Withdrawing the consent also removes what was recorded under it.
    delete from public.analytics_events where user_id = v_uid;
  end if;
end;
$$;

-- Records one usage event for a consenting person. Returns false, without an error, when nothing is recorded (no
-- consent, over 300 an hour): the app fires and forgets, and must never break because of analytics.
create function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  v_props jsonb := coalesce(p_props, '{}'::jsonb);
begin
  if p_name is null or p_name not in ('discover_viewed', 'filter_applied', 'event_detail_viewed', 'map_opened',
                                      'near_me_used', 'venue_suggest_opened')
     or not private.analytics_props_ok(p_name, v_props) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.user_settings s where s.user_id = v_uid and s.analytics_consent_at is not null) then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analytics:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.analytics_events a
       where a.user_id = v_uid and a.occurred_at > pg_catalog.now() - interval '1 hour') >= 300 then
    return false;
  end if;
  insert into public.analytics_events (user_id, name, props) values (v_uid, p_name, v_props);
  return true;
end;
$$;

-- The pilot dashboard: counts from operational data over the last p_days days, plus consented usage counts. Nothing
-- about an individual: totals, rates, provinces.
create function public.admin_pilot_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_from timestamptz;
begin
  perform private.assert_admin_aal2();
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  v_from := pg_catalog.now() - pg_catalog.make_interval(days => p_days);
  return pg_catalog.jsonb_build_object(
    'days', p_days,
    'players', pg_catalog.jsonb_build_object(
      'onboarded', (select pg_catalog.count(*) from public.profiles p where p.onboarded_at is not null and p.account_status = 'ACTIVE'),
      'new', (select pg_catalog.count(*) from public.profiles p where p.onboarded_at >= v_from),
      'organized', (select pg_catalog.count(distinct e.organizer_id) from public.events e
                     where e.published_at >= v_from),
      'joined', (select pg_catalog.count(distinct x.user_id) from public.event_participations x
                  where not x.is_organizer and x.requested_at >= v_from),
      'analytics_consent', (select pg_catalog.count(*) from public.user_settings s where s.analytics_consent_at is not null)),
    'events', pg_catalog.jsonb_build_object(
      'published', (select pg_catalog.count(*) from public.events e where e.published_at >= v_from),
      'upcoming', (select pg_catalog.count(*) from public.events e
                    where e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()),
      'canceled', (select pg_catalog.count(*) from public.events e where e.canceled_at >= v_from),
      'completed', (select pg_catalog.count(*) from public.events e where e.completed_at >= v_from),
      'fill_rate', (select pg_catalog.round(pg_catalog.avg(e.approved_count::numeric / e.capacity), 3) from public.events e
                     where e.completed_at >= v_from)),
    'participation', pg_catalog.jsonb_build_object(
      'requests', (select pg_catalog.count(*) from public.event_participations x
                    where not x.is_organizer and x.requested_at >= v_from),
      'approved', (select pg_catalog.count(*) from public.event_participations x
                    where not x.is_organizer and x.approved_at >= v_from),
      'no_show_rate', (select pg_catalog.round(
                         pg_catalog.count(*) filter (where x.attendance = 'ABSENT')::numeric
                         / nullif(pg_catalog.count(*) filter (where x.attendance in ('PRESENT', 'ABSENT')), 0), 3)
                        from public.event_participations x join public.events e on e.id = x.event_id
                       where e.attendance_finalized_at >= v_from and not x.is_organizer)),
    'provinces', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('city_id', t.city_id, 'name', t.name, 'upcoming', t.n)
                                  order by t.n desc, t.name)
        from (select e.city_id, c.names ->> 'tr' as name, pg_catalog.count(*) as n
                from public.events e join public.cities c on c.id = e.city_id
               where e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()
               group by e.city_id, c.names ->> 'tr' order by n desc limit 10) t), '[]'::jsonb),
    'provinces_active', (select pg_catalog.count(distinct e.city_id) from public.events e
                          where e.status = 'PUBLISHED' and e.starts_at > pg_catalog.now()),
    'usage', coalesce((
      select pg_catalog.jsonb_object_agg(a.name, a.n)
        from (select x.name, pg_catalog.count(*) as n from public.analytics_events x
               where x.occurred_at >= v_from group by x.name) a), '{}'::jsonb),
    'daily', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'day', d.day::date,
               'new_players', (select pg_catalog.count(*) from public.profiles p
                                where p.onboarded_at >= d.day and p.onboarded_at < d.day + interval '1 day'),
               'published', (select pg_catalog.count(*) from public.events e
                              where e.published_at >= d.day and e.published_at < d.day + interval '1 day'),
               'requests', (select pg_catalog.count(*) from public.event_participations x
                             where not x.is_organizer and x.requested_at >= d.day
                               and x.requested_at < d.day + interval '1 day')) order by d.day)
        from pg_catalog.generate_series(pg_catalog.date_trunc('day', v_from + interval '1 day'),
                                        pg_catalog.date_trunc('day', pg_catalog.now()), interval '1 day') d(day)), '[]'::jsonb));
end;
$$;

create function private.export_analytics_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('usage_analytics', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', a.name, 'props', a.props, 'occurred_at', a.occurred_at)
                                order by a.occurred_at, a.id)
      from public.analytics_events a where a.user_id = p_uid), '[]'::jsonb));
$$;
revoke all on function private.export_analytics_data(uuid) from public, anon, authenticated;

revoke all on function public.set_analytics_consent(boolean), public.track_event(text, jsonb),
  public.admin_pilot_metrics(integer) from public, anon, authenticated;
grant execute on function public.set_analytics_consent(boolean), public.track_event(text, jsonb),
  public.admin_pilot_metrics(integer) to authenticated;

-- Live definitions with one addition each: the analytics in the export, and their removal on purge.
create or replace function public.export_my_data()
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
  ) || private.export_event_data(v_uid) || private.export_place_data(v_uid) || private.export_analytics_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

create or replace function private.purge_account(p_uid uuid)
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
  update public.profiles
     set display_name = null, avatar_path = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$function$;
