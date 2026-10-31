-- Phase 5 / M3b: skill ratings and the job that closes review windows (F-25, second half). RATING_SYSTEM §3.4, §5.2,
-- §11, ADR-0004 (SQL is authoritative; packages/domain/src/rating/skill.ts is the reference, compared by
-- rating-equivalence). Runs once per event, when its window closes: until then reviews stay blind and count for nothing.
-- NOT here: the moderation flags of §3.5 and hiding a review (Phase 6), notifications (app change).

insert into private.rating_config (key, value) values
  ('skill.prior_weight', 2),
  ('skill.default_prior', 3),
  ('skill.half_life_days', 180),
  ('skill.min_reviewers_per_event', 2),
  ('skill.trim_from_reviewers', 5),
  ('skill.full_weight_reviewers', 3),
  ('skill.pair_free_events', 2),
  ('skill.pair_window_days', 90),
  ('xp.fair_play_min_reviewers', 2);

-- ---- tables --------------------------------------------------------------------------------------------------
create table public.user_sport_ratings (
  user_id           uuid not null references public.profiles (id),
  sport_id          uuid not null references public.sports (id),
  rating            numeric(3, 2) not null check (rating between 1 and 5),
  confidence        numeric(6, 5) not null check (confidence >= 0 and confidence < 1),
  sample_events     integer not null check (sample_events > 0),
  algorithm_version smallint not null default 1,
  computed_at       timestamptz not null default pg_catalog.now(),
  primary key (user_id, sport_id)
);
comment on table public.user_sport_ratings is
  'Derived skill snapshot, always recomputable from skill_reviews. No row means no counted event: the self-assessment stands.';

alter table public.user_sport_ratings enable row level security;
revoke all on public.user_sport_ratings from anon, authenticated;
grant select on public.user_sport_ratings to authenticated;
create policy user_sport_ratings_select_own on public.user_sport_ratings for select to authenticated
  using (user_id = (select auth.uid()));

-- Finalized events are frozen (I-7), so "this window was processed" lives beside them. Also the set of events whose
-- reviews the formula may read: an open window is still double-blind.
create table private.closed_review_windows (
  event_id  uuid primary key references public.events (id) on delete cascade,
  closed_at timestamptz not null default pg_catalog.now()
);
alter table private.closed_review_windows enable row level security;
revoke all on private.closed_review_windows from public, anon, authenticated;

-- I-8 again: the RPC compares its transaction's start with the window, which a submission waiting on the job's event
-- lock could pass after the job has already read the reviews.
create or replace function private.skill_reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.events e
                  where e.id = new.event_id and e.status = 'COMPLETED' and e.attendance_finalized_at is not null
                    and e.sport_id = new.sport_id)
     or (select pg_catalog.count(*) from public.event_participations p
          where p.event_id = new.event_id and p.user_id in (new.reviewer_id, new.reviewee_id)
            and p.status = 'APPROVED' and p.attendance = 'PRESENT') <> 2 then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.closed_review_windows c where c.event_id = new.event_id) then
    raise exception 'WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- the math (pure, double precision like the TypeScript reference) -------------------------------------------
-- Parallel arrays, one entry per review about the user, all sports (repeated pairs decay across sports); only p_sport
-- enters the rating. Equal scores are trimmed in reviewer-id order, as in skill.ts.
create function private.skill_stats(
  p_prior double precision, p_sport uuid, p_events uuid[], p_sports uuid[], p_reviewers uuid[],
  p_scores double precision[], p_starts timestamptz[], p_at timestamptz)
returns table (rating double precision, confidence double precision, sample_events integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_k    double precision := private.rating_const('skill.prior_weight');
  v_hl   double precision := private.rating_const('skill.half_life_days');
  v_min  double precision := private.rating_const('skill.min_reviewers_per_event');
  v_trim double precision := private.rating_const('skill.trim_from_reviewers');
  v_full double precision := private.rating_const('skill.full_weight_reviewers');
  v_free double precision := private.rating_const('skill.pair_free_events');
  v_days double precision := private.rating_const('skill.pair_window_days');
begin
  return query
  with r as (
    select t.event_id, t.sport_id, t.reviewer_id, t.score, t.starts_at
      from unnest(p_events, p_sports, p_reviewers, p_scores, p_starts)
           as t(event_id, sport_id, reviewer_id, score, starts_at)
  ), weighted as (
    select r.event_id, r.reviewer_id, r.score, r.starts_at,
           1.0::double precision / (1 + greatest(0::double precision,
             (select pg_catalog.count(*) from r o
               where o.reviewer_id = r.reviewer_id and o.starts_at <= r.starts_at
                 and o.starts_at > r.starts_at - pg_catalog.make_interval(secs => v_days * 86400))::double precision - v_free)) as w
      from r
     where r.sport_id = p_sport
  ), ranked as (
    select x.*,
           pg_catalog.row_number() over (partition by x.event_id order by x.score, x.reviewer_id) as rn,
           pg_catalog.count(*) over (partition by x.event_id) as n
      from weighted x
  ), per_event as (
    select pg_catalog.max(y.n)::double precision as n,
           pg_catalog.max(y.starts_at) as starts_at,
           pg_catalog.sum(y.w * y.score) filter (where y.n < v_trim or (y.rn > 1 and y.rn < y.n))
             / pg_catalog.sum(y.w) filter (where y.n < v_trim or (y.rn > 1 and y.rn < y.n)) as mean
      from ranked y
     group by y.event_id
    having pg_catalog.max(y.n) >= v_min
  ), event_weights as (
    select least(z.n, v_full) / v_full
             * pg_catalog.power(0.5::double precision, greatest(0::double precision, extract(epoch from (p_at - z.starts_at))::double precision / 86400.0) / v_hl) as we,
           z.mean
      from per_event z
  )
  select (v_k * p_prior + coalesce(pg_catalog.sum(q.we * q.mean), 0)) / (v_k + coalesce(pg_catalog.sum(q.we), 0)),
         coalesce(pg_catalog.sum(q.we), 0) / (coalesce(pg_catalog.sum(q.we), 0) + v_k),
         pg_catalog.count(*)::integer
    from event_weights q;
end;
$$;

-- ---- the snapshot ---------------------------------------------------------------------------------------------
create function private.recompute_user_sport_rating(p_uid uuid, p_sport uuid, p_at timestamptz default pg_catalog.now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events    uuid[];
  v_sports    uuid[];
  v_reviewers uuid[];
  v_scores    double precision[];
  v_starts    timestamptz[];
  v_prior     double precision;
  s           record;
begin
  select pg_catalog.array_agg(r.event_id), pg_catalog.array_agg(r.sport_id), pg_catalog.array_agg(r.reviewer_id),
         pg_catalog.array_agg(r.skill_score::double precision), pg_catalog.array_agg(e.starts_at)
    into v_events, v_sports, v_reviewers, v_scores, v_starts
    from public.skill_reviews r
    join public.events e on e.id = r.event_id
    join private.closed_review_windows c on c.event_id = r.event_id
   where r.reviewee_id = p_uid and r.status = 'ACTIVE';
  select u.self_assessed_level::double precision into v_prior
    from public.user_sport_profiles u where u.user_id = p_uid and u.sport_id = p_sport;
  select * into s from private.skill_stats(coalesce(v_prior, private.rating_const('skill.default_prior')), p_sport,
                                           v_events, v_sports, v_reviewers, v_scores, v_starts, p_at);
  if s.sample_events = 0 then
    -- Nothing counted: the self-assessment stands, and no row reveals that a lone reviewer exists.
    delete from public.user_sport_ratings where user_id = p_uid and sport_id = p_sport;
    return;
  end if;
  insert into public.user_sport_ratings (user_id, sport_id, rating, confidence, sample_events, algorithm_version, computed_at)
  values (p_uid, p_sport, pg_catalog.round(s.rating::numeric, 2), pg_catalog.round(s.confidence::numeric, 5),
          s.sample_events, 1, p_at)
  on conflict (user_id, sport_id) do update
     set rating = excluded.rating, confidence = excluded.confidence, sample_events = excluded.sample_events,
         algorithm_version = excluded.algorithm_version, computed_at = excluded.computed_at;
end;
$$;

-- ---- the job --------------------------------------------------------------------------------------------------
-- Every 15 minutes. p_at is "now" (tests move it instead of tampering with frozen events). Returns how many windows
-- it closed. SKIP LOCKED: an event locked by a running submit_reviews (FOR SHARE) or a dispute waits for the next run, so
-- the job never reads a half-submitted set and never waits on an event while holding user locks. All users are
-- locked up front in id order, as finalization does, because one run holds them across several events.
create function private.close_review_windows(p_at timestamptz default pg_catalog.now())
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
  return pg_catalog.array_length(v_closed, 1);
end;
$$;

select cron.schedule('close-review-windows', '*/15 * * * *', 'select private.close_review_windows()');

revoke all on function private.skill_stats(double precision, uuid, uuid[], uuid[], uuid[], double precision[], timestamptz[], timestamptz)
  from public, anon, authenticated;
revoke all on function private.recompute_user_sport_rating(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.close_review_windows(timestamptz) from public, anon, authenticated;

-- ---- account export and purge (ADR-0017) --------------------------------------------------------------------------
-- The snapshot is derived personal data with no use after the account is gone; the reviews behind it stay anonymous.
create or replace function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  delete from public.user_sport_ratings where user_id = p_uid;
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
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;
