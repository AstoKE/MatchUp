-- Phase 5 / M4: badges (F-26). RATING_SYSTEM §6 and §12, DATABASE §3.5, ADR-0004 (the definitions' single source is
-- packages/domain/src/rating/achievements.ts; rating-equivalence fails on drift). Evaluated wherever the facts change:
-- finalization, a dispute resolution, a review window closing. Revoking is moderation's (Phase 6).

create table public.achievement_definitions (
  code         text primary key,
  names        jsonb not null,
  descriptions jsonb not null,
  rule         jsonb not null,
  scope        text not null check (scope in ('GLOBAL', 'PER_SPORT')),
  xp_bonus     integer not null check (xp_bonus > 0),
  is_active    boolean not null default true,
  version      smallint not null default 1
);
comment on table public.achievement_definitions is 'Badge catalog, readable by signed-in users. {sport} in names is the sport''s localized name.';

create table public.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id),
  code            text not null references public.achievement_definitions (code),
  sport_id        uuid references public.sports (id),
  awarded_at      timestamptz not null default pg_catalog.now(),
  source_event_id uuid references public.events (id) on delete set null,
  revoked_at      timestamptz
);
-- A revoked badge keeps its row, so it is not awarded again.
create unique index user_achievements_uq on public.user_achievements
  (user_id, code, coalesce(sport_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on table public.user_achievements is 'Badge awards, idempotent; only moderation revokes (revoked_at).';

alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;
revoke all on public.achievement_definitions, public.user_achievements from anon, authenticated;
grant select on public.achievement_definitions to authenticated;
grant select on public.user_achievements to authenticated;
create policy achievement_definitions_select_all on public.achievement_definitions for select to authenticated
  using (true);
create policy user_achievements_select_own on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.achievement_definitions (code, scope, xp_bonus, names, descriptions, rule) values
  ('FIRST_MATCH', 'GLOBAL', 50,
   '{"tr": "İlk Maç", "en": "First Match"}',
   '{"tr": "İlk maçına katıldın.", "en": "You played your first match."}',
   '{"type": "ATTENDANCES", "min": 1}'),
  ('TEN_GAMES', 'GLOBAL', 100,
   '{"tr": "On Maç", "en": "Ten Games"}',
   '{"tr": "10 maça katıldın.", "en": "You played 10 games."}',
   '{"type": "ATTENDANCES", "min": 10}'),
  ('SPORT_REGULAR', 'PER_SPORT', 75,
   '{"tr": "{sport} Müdavimi", "en": "{sport} Regular"}',
   '{"tr": "Bu sporda 10 maça katıldın.", "en": "You played 10 games in this sport."}',
   '{"type": "SPORT_ATTENDANCES", "min": 10}'),
  ('MULTI_SPORT', 'GLOBAL', 75,
   '{"tr": "Çok Yönlü", "en": "Multi-Sport"}',
   '{"tr": "3 farklı sporda oynadın.", "en": "You played 3 different sports."}',
   '{"type": "DISTINCT_SPORTS", "min": 3}'),
  ('RELIABLE_PLAYER', 'GLOBAL', 100,
   '{"tr": "Güvenilir Oyuncu", "en": "Reliable Player"}',
   '{"tr": "Sözünü tutan bir oyuncusun: yüksek güvenilirlik, son 60 günde gelmeme yok.", "en": "You keep your word: high reliability and no no-shows in the last 60 days."}',
   '{"type": "RELIABILITY", "min_score": 0.9, "min_confidence_above": 0.7, "min_signals": 10, "no_show_free_days": 60}'),
  ('COMMUNITY_ORGANIZER', 'GLOBAL', 100,
   '{"tr": "Topluluk Organizatörü", "en": "Community Organizer"}',
   '{"tr": "En az 3 oyuncunun katıldığı 5 etkinlik düzenledin.", "en": "You organized 5 events with at least 3 players each."}',
   '{"type": "ORGANIZED_EVENTS", "min_events": 5, "min_present": 3}'),
  ('FAIR_PLAY', 'GLOBAL', 75,
   '{"tr": "Centilmen", "en": "Fair Play"}',
   '{"tr": "3 etkinlikte 5 farklı oyuncu centilmenliğini takdir etti.", "en": "5 different players commended your fair play across 3 events."}',
   '{"type": "FAIR_PLAY", "min_reviewers": 5, "min_events": 3}');

-- ---- the rule (pure, compared with achievementRuleMet) --------------------------------------------------------------
create function private.achievement_rule_met(p_rule jsonb, f jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_rule ->> 'type'
    when 'ATTENDANCES' then (f ->> 'attendances')::float8 >= (p_rule ->> 'min')::float8
    when 'SPORT_ATTENDANCES' then (f ->> 'sport_attendances')::float8 >= (p_rule ->> 'min')::float8
    when 'DISTINCT_SPORTS' then (f ->> 'distinct_sports')::float8 >= (p_rule ->> 'min')::float8
    when 'RELIABILITY' then
      (f ->> 'reliability_score')::float8 >= (p_rule ->> 'min_score')::float8
      and (f ->> 'reliability_confidence')::float8 > (p_rule ->> 'min_confidence_above')::float8
      and (f ->> 'reliability_samples')::float8 >= (p_rule ->> 'min_signals')::float8
      and (f ->> 'days_since_no_show' is null
           or (f ->> 'days_since_no_show')::float8 > (p_rule ->> 'no_show_free_days')::float8)
    when 'ORGANIZED_EVENTS' then (f ->> 'organized_events')::float8 >= (p_rule ->> 'min_events')::float8
    when 'FAIR_PLAY' then
      (f ->> 'fair_play_reviewers')::float8 >= (p_rule ->> 'min_reviewers')::float8
      and (f ->> 'fair_play_events')::float8 >= (p_rule ->> 'min_events')::float8
    else false
  end;
$$;

-- ---- the facts ------------------------------------------------------------------------------------------------------
-- Verified attendances per sport. The organizer's own row is self-attested: it counts only with enough verified-present
-- others (RATING_SYSTEM §2).
create function private.verified_attendances_by_sport(p_uid uuid)
returns table (sport_id uuid, attendances integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.sport_id, pg_catalog.count(*)::integer
    from public.event_participations p
    join public.events e on e.id = p.event_id
   where p.user_id = p_uid and p.status = 'APPROVED' and p.attendance = 'PRESENT'
     and e.attendance_finalized_at is not null
     and (not p.is_organizer
          or (select pg_catalog.count(*) from public.event_participations o
               where o.event_id = e.id and not o.is_organizer and o.status = 'APPROVED' and o.attendance = 'PRESENT')
             >= private.rating_const('xp.min_present_others'))
   group by e.sport_id;
$$;

-- Reliability comes from user_progress: callers recompute it first. Fair play reads closed windows only, an open one is
-- still double-blind.
create function private.achievement_facts(p_uid uuid, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attendances', coalesce((select pg_catalog.sum(a.attendances) from private.verified_attendances_by_sport(p_uid) a), 0),
    'sport_attendances', 0,
    'distinct_sports', (select pg_catalog.count(*) from private.verified_attendances_by_sport(p_uid)),
    'reliability_score', coalesce(up.reliability_score, 0),
    'reliability_confidence', coalesce(up.reliability_confidence, 0),
    'reliability_samples', coalesce(up.reliability_samples, 0),
    'days_since_no_show', (
      select extract(epoch from (p_at - pg_catalog.max(r.occurred_at))) / 86400.0
        from public.reliability_events r
       where r.user_id = p_uid and r.kind = 'NO_SHOW' and r.voided_at is null),
    'organized_events', (
      select pg_catalog.count(*)
        from public.events e
       where e.organizer_id = p_uid and e.attendance_finalized_at is not null
         and (select pg_catalog.count(*) from public.event_participations o
               where o.event_id = e.id and not o.is_organizer and o.status = 'APPROVED' and o.attendance = 'PRESENT')
             >= (select (d.rule ->> 'min_present')::integer from public.achievement_definitions d where d.code = 'COMMUNITY_ORGANIZER')),
    'fair_play_reviewers', (
      select pg_catalog.count(distinct v.reviewer_id)
        from public.skill_reviews v
        join private.closed_review_windows c on c.event_id = v.event_id
       where v.reviewee_id = p_uid and v.fair_play and v.status = 'ACTIVE'),
    'fair_play_events', (
      select pg_catalog.count(distinct v.event_id)
        from public.skill_reviews v
        join private.closed_review_windows c on c.event_id = v.event_id
       where v.reviewee_id = p_uid and v.fair_play and v.status = 'ACTIVE'))
    from (select 1) one
    left join public.user_progress up on up.user_id = p_uid;
$$;

-- ---- awarding ---------------------------------------------------------------------------------------------------------
create function private.grant_achievement(p_uid uuid, p_code text, p_sport uuid, p_event uuid, p_bonus integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.user_achievements (user_id, code, sport_id, source_event_id)
  values (p_uid, p_code, p_sport, p_event)
  on conflict (user_id, code, coalesce(sport_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  perform private.award_xp(p_uid, p_bonus, 'ACHIEVEMENT_BONUS', 'ACHIEVEMENT', v_id,
                           'ach:' || p_code || ':' || p_uid || coalesce(':' || p_sport, ''));
  return true;
end;
$$;

-- Idempotent. Callers hold the user's rating lock and have just recomputed the progress cache.
create function private.evaluate_achievements(p_uid uuid, p_event uuid default null, p_at timestamptz default pg_catalog.now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facts jsonb;
  d       public.achievement_definitions;
  s       record;
  v_new   boolean := false;
begin
  if (select p.account_status from public.profiles p where p.id = p_uid) = 'DELETED' then
    return;
  end if;
  v_facts := private.achievement_facts(p_uid, p_at);
  for d in select * from public.achievement_definitions x where x.is_active order by x.code loop
    if d.scope = 'GLOBAL' then
      if private.achievement_rule_met(d.rule, v_facts) then
        v_new := private.grant_achievement(p_uid, d.code, null, p_event, d.xp_bonus) or v_new;
      end if;
    else
      for s in select * from private.verified_attendances_by_sport(p_uid) order by 1 loop
        if private.achievement_rule_met(d.rule, v_facts || jsonb_build_object('sport_attendances', s.attendances)) then
          v_new := private.grant_achievement(p_uid, d.code, s.sport_id, p_event, d.xp_bonus) or v_new;
        end if;
      end loop;
    end if;
  end loop;
  if v_new then
    perform private.recompute_user_progress(p_uid, p_at);
  end if;
end;
$$;

revoke all on function private.achievement_rule_met(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.verified_attendances_by_sport(uuid) from public, anon, authenticated;
revoke all on function private.achievement_facts(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.grant_achievement(uuid, text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.evaluate_achievements(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---- hooks: the three places where the facts change ---------------------------------------------------------------------
create or replace function private.apply_finalization(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e      public.events;
  v_user uuid;
  v_part uuid;
begin
  select * into e from public.events x where x.id = p_event;
  -- All involved users are locked first, in id order, so two finalizations with common players cannot deadlock.
  for v_user in
    select u from (select p.user_id as u from public.event_participations p where p.event_id = e.id
                   union select e.organizer_id) q order by u
  loop
    perform private.lock_rating_user(v_user);
  end loop;
  for v_part in select p.id from public.event_participations p where p.event_id = e.id order by p.user_id loop
    perform private.apply_attendance_outcome(v_part);
  end loop;
  for v_user in
    select p.user_id from public.event_participations p
     where p.event_id = e.id and p.status = 'APPROVED' and p.attendance = 'PRESENT' order by p.user_id
  loop
    perform private.award_attendance_xp(e.id, v_user);
  end loop;
  perform private.award_organizer_xp(e.id);
  for v_user in
    select u from (select p.user_id as u from public.event_participations p where p.event_id = e.id
                   union select e.organizer_id) q order by u
  loop
    perform private.recompute_user_progress(v_user);
    perform private.evaluate_achievements(v_user, e.id);
  end loop;
end;
$$;

create or replace function public.admin_resolve_attendance_dispute(p_participation_id uuid, p_resolution public.attendance_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_onboarded_user();
  v_event uuid;
  p       public.event_participations;
begin
  if not private.is_admin() or (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_resolution not in ('PRESENT', 'ABSENT') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select ep.event_id into v_event from public.event_participations ep where ep.id = p_participation_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform 1 from public.events x where x.id = v_event for update;
  select * into p from public.event_participations ep where ep.id = p_participation_id for update;
  if p.attendance <> 'DISPUTED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  perform private.lock_rating_user(p.user_id);
  update public.attendance_disputes
     set status = 'RESOLVED', resolution = p_resolution, resolved_by = v_uid, resolved_at = pg_catalog.now()
   where participation_id = p.id;
  update public.event_participations
     set attendance = p_resolution, attendance_marked_at = pg_catalog.now(), attendance_marked_by = v_uid
   where id = p.id;
  perform private.apply_attendance_outcome(p.id);
  if p_resolution = 'PRESENT' then
    perform private.award_attendance_xp(v_event, p.user_id);
  end if;
  perform private.recompute_user_progress(p.user_id);
  perform private.evaluate_achievements(p.user_id, v_event);
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'ATTENDANCE_DISPUTE_RESOLVED', p.id, pg_catalog.jsonb_build_object('resolution', p_resolution));
end;
$$;

create or replace function private.close_review_windows(p_at timestamptz default pg_catalog.now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due    uuid[];
  v_closed uuid[];
  v_user   uuid;
  r        record;
begin
  with due as (
    select e.id
      from public.events e
     where e.status = 'COMPLETED' and e.attendance_finalized_at is not null and e.review_window_closes_at <= p_at
       and not exists (select 1 from private.closed_review_windows c where c.event_id = e.id)
     order by e.review_window_closes_at, e.id
     limit 200
       for update of e skip locked
  )
  select pg_catalog.array_agg(due.id) into v_due from due;
  if v_due is null then
    return 0;
  end if;

  with inserted as (
    insert into private.closed_review_windows (event_id)
    select pg_catalog.unnest(v_due)
    on conflict (event_id) do nothing
    returning event_id
  )
  select pg_catalog.array_agg(inserted.event_id) into v_closed from inserted;
  if v_closed is null then
    return 0;
  end if;

  for v_user in
    select u from (select x.reviewer_id as u from public.skill_reviews x where x.event_id = any (v_closed)
                   union select x.reviewee_id from public.skill_reviews x where x.event_id = any (v_closed)) q
     order by u
  loop
    perform private.lock_rating_user(v_user);
  end loop;

  -- Reviews of a deleted account keep counting for the others; the tombstone itself earns and holds nothing.
  for r in
    select x.event_id, x.reviewer_id
      from public.skill_reviews x
      join public.profiles p on p.id = x.reviewer_id and p.account_status <> 'DELETED'
     where x.event_id = any (v_closed) and x.status = 'ACTIVE'
     group by x.event_id, x.reviewer_id
  loop
    perform private.award_xp(r.reviewer_id, private.rating_const('xp.reviews_submitted')::integer, 'REVIEWS_SUBMITTED', 'EVENT',
                             r.event_id, 'reviews:' || r.event_id || ':' || r.reviewer_id);
  end loop;
  for r in
    select x.event_id, x.reviewee_id
      from public.skill_reviews x
      join public.profiles p on p.id = x.reviewee_id and p.account_status <> 'DELETED'
     where x.event_id = any (v_closed) and x.status = 'ACTIVE' and x.fair_play
     group by x.event_id, x.reviewee_id
    having pg_catalog.count(*) >= private.rating_const('xp.fair_play_min_reviewers')
  loop
    perform private.award_xp(r.reviewee_id, private.rating_const('xp.fair_play_received')::integer, 'FAIR_PLAY_RECEIVED', 'EVENT',
                             r.event_id, 'fairplay:' || r.event_id || ':' || r.reviewee_id);
  end loop;

  for r in
    select distinct x.reviewee_id, x.sport_id
      from public.skill_reviews x
      join public.profiles p on p.id = x.reviewee_id and p.account_status <> 'DELETED'
     where x.event_id = any (v_closed)
  loop
    perform private.recompute_user_sport_rating(r.reviewee_id, r.sport_id, p_at);
  end loop;

  for v_user in
    select u from (select x.reviewer_id as u from public.skill_reviews x where x.event_id = any (v_closed)
                   union select x.reviewee_id from public.skill_reviews x where x.event_id = any (v_closed)) q
      join public.profiles p on p.id = q.u and p.account_status <> 'DELETED'
     order by u
  loop
    perform private.recompute_user_progress(v_user, p_at);
  end loop;

  -- FAIR_PLAY is the one badge a closing window can unlock; one of the events closing now is credited as its source.
  for r in
    select distinct on (x.reviewee_id) x.reviewee_id, x.event_id
      from public.skill_reviews x
     where x.event_id = any (v_closed) and x.fair_play and x.status = 'ACTIVE'
     order by x.reviewee_id, x.event_id
  loop
    perform private.evaluate_achievements(r.reviewee_id, r.event_id, p_at);
  end loop;
  return pg_catalog.array_length(v_closed, 1);
end;
$$;

-- ---- account export and purge (ADR-0017) ---------------------------------------------------------------------------------
create or replace function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  delete from public.user_sport_ratings where user_id = p_uid;
  delete from public.user_achievements where user_id = p_uid;
  update public.event_participations set request_message = null, status_reason = null
   where user_id = p_uid and (request_message is not null or status_reason is not null);
  update public.attendance_disputes d set reason = null
    from public.event_participations p
   where p.id = d.participation_id and p.user_id = p_uid and d.reason is not null;
  delete from public.event_private_details d
   using public.events e
   where e.id = d.event_id and e.organizer_id = p_uid;
$$;

create or replace function private.export_event_data(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organized_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'description', e.description, 'status', e.status,
               'sport', s.slug, 'district', dt.slug, 'starts_at', e.starts_at,
               'duration_minutes', e.duration_minutes, 'capacity', e.capacity, 'visibility', e.visibility,
               'location_label', pd.location_label, 'address_text', pd.address_text,
               'participant_notes', pd.participant_notes, 'created_at', e.created_at,
               'published_at', e.published_at, 'canceled_at', e.canceled_at, 'completed_at', e.completed_at,
               'attendance_finalized_at', e.attendance_finalized_at)
             order by e.created_at)
        from public.events e
        join public.sports s on s.id = e.sport_id
        join public.districts dt on dt.id = e.district_id
        left join public.event_private_details pd on pd.event_id = e.id
       where e.organizer_id = p_uid), '[]'::jsonb),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', p.event_id, 'status', p.status, 'attendance', p.attendance,
               'is_organizer', p.is_organizer, 'request_message', p.request_message,
               'requested_at', p.requested_at, 'approved_at', p.approved_at, 'canceled_at', p.canceled_at,
               'attendance_marked_at', p.attendance_marked_at)
             order by p.requested_at)
        from public.event_participations p where p.user_id = p_uid), '[]'::jsonb),
    'attendance_disputes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', p.event_id, 'reason', d.reason, 'status', d.status,
               'resolution', d.resolution, 'created_at', d.created_at, 'resolved_at', d.resolved_at)
             order by d.created_at)
        from public.attendance_disputes d
        join public.event_participations p on p.id = d.participation_id
       where p.user_id = p_uid), '[]'::jsonb),
    'reviews_written', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', r.event_id, 'reviewee_id', r.reviewee_id, 'skill_score', r.skill_score,
               'fair_play', r.fair_play, 'created_at', r.created_at)
             order by r.created_at)
        from public.skill_reviews r where r.reviewer_id = p_uid), '[]'::jsonb),
    'reliability_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', r.event_id, 'kind', r.kind, 'weight', r.weight, 'occurred_at', r.occurred_at,
               'voided_at', r.voided_at, 'void_reason', r.void_reason)
             order by r.occurred_at, r.id)
        from public.reliability_events r where r.user_id = p_uid), '[]'::jsonb),
    'xp_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', x.amount, 'reason_code', x.reason_code, 'source_type', x.source_type,
               'source_id', x.source_id, 'created_at', x.created_at)
             order by x.created_at, x.id)
        from public.xp_transactions x where x.user_id = p_uid), '[]'::jsonb),
    'progress', (
      select jsonb_build_object(
               'reliability_score', up.reliability_score, 'reliability_samples', up.reliability_samples,
               'reliability_confidence', up.reliability_confidence, 'xp_total', up.xp_total,
               'computed_at', up.computed_at)
        from public.user_progress up where up.user_id = p_uid),
    'sport_ratings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sport', s.slug, 'rating', sr.rating, 'confidence', sr.confidence,
               'sample_events', sr.sample_events, 'computed_at', sr.computed_at)
             order by s.slug)
        from public.user_sport_ratings sr
        join public.sports s on s.id = sr.sport_id
       where sr.user_id = p_uid), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', a.code, 'sport', s.slug, 'awarded_at', a.awarded_at, 'revoked_at', a.revoked_at)
             order by a.awarded_at, a.code)
        from public.user_achievements a
        left join public.sports s on s.id = a.sport_id
       where a.user_id = p_uid), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;

-- ---- events finalized before this migration (none on a fresh database): idempotent ------------------------------------------
select private.evaluate_achievements(up.user_id) from public.user_progress up order by up.user_id;
