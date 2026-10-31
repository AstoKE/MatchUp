-- Phase 5 / M3a: reliability events, the XP ledger and the progress cache (F-25, first half).
-- RATING_SYSTEM §2, §4, §5, ADR-0004 (SQL is authoritative; packages/domain/src/rating is the reference and the
-- constants' single source). Created when an event is finalized and corrected when a dispute is resolved.
-- NOT here (M3b): skill ratings, the review-window-close job, REVIEWS_SUBMITTED and FAIR_PLAY_RECEIVED XP.

-- ---- constants (generated from packages/domain/src/rating/constants.ts; the equivalence test fails on drift) ---
create table private.rating_config (
  key   text primary key,
  value double precision not null
);
insert into private.rating_config (key, value) values
  ('reliability.prior_weight', 3),
  ('reliability.prior_value', 0.9),
  ('reliability.half_life_days', 180),
  ('reliability.min_signals_to_show', 3),
  ('reliability.attended_value', 1),
  ('reliability.late_cancel_value', 0.5),
  ('reliability.no_show_value', 0),
  ('reliability.late_cancel_max_window_hours', 12),
  ('reliability.confidence_low_below', 0.4),
  ('reliability.confidence_high_above', 0.7),
  ('xp.attended_event', 50),
  ('xp.organized_event', 40),
  ('xp.first_in_sport', 30),
  ('xp.reviews_submitted', 10),
  ('xp.fair_play_received', 10),
  ('xp.min_present_others', 2),
  ('xp.attendance_max_per_day', 2),
  ('xp.attendance_max_per_week', 6),
  ('xp.organizer_max_per_day', 2),
  ('xp.organizer_min_account_age_hours', 24),
  ('windows.review_window_hours', 72),
  ('windows.auto_finalize_hours', 48);

create function private.rating_const(p_key text)
returns double precision
language plpgsql
stable
set search_path = ''
as $$
declare
  v double precision;
begin
  select c.value into v from private.rating_config c where c.key = p_key;
  if not found then
    raise exception 'rating constant % is missing', p_key;
  end if;
  return v;
end;
$$;

-- ---- tables --------------------------------------------------------------------------------------------------
create table public.reliability_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id),
  participation_id uuid not null references public.event_participations (id) on delete cascade,
  event_id         uuid not null references public.events (id) on delete cascade,
  kind             text not null check (kind in ('ATTENDED', 'LATE_CANCEL', 'NO_SHOW')),
  weight           numeric(2, 1) not null check (weight between 0 and 1),
  occurred_at      timestamptz not null,
  voided_at        timestamptz,
  void_reason      text check (void_reason is null or char_length(void_reason) between 1 and 80),
  created_at       timestamptz not null default pg_catalog.now(),
  constraint reliability_events_void check ((voided_at is null) = (void_reason is null))
);
-- At most ONE ACTIVE signal per participation (I-10). A dispute voids the old row and creates the correct one.
create unique index reliability_events_active_uq on public.reliability_events (participation_id) where voided_at is null;
create index reliability_events_user_idx on public.reliability_events (user_id, occurred_at) where voided_at is null;
comment on table public.reliability_events is
  'Append-only reliability signals derived from finalized events; only voided_at / void_reason may change.';

create table public.xp_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id),
  amount       integer not null check (amount <> 0),
  reason_code  text not null check (reason_code in
                 ('ATTENDED_EVENT', 'ORGANIZED_EVENT', 'FIRST_IN_SPORT', 'REVIEWS_SUBMITTED', 'FAIR_PLAY_RECEIVED',
                  'ACHIEVEMENT_BONUS', 'CORRECTION')),
  source_type  text not null check (source_type in ('EVENT', 'ACHIEVEMENT', 'SPORT')),
  source_id    uuid,
  rule_version smallint not null default 1,
  dedupe_key   text not null unique check (char_length(dedupe_key) <= 200),
  created_at   timestamptz not null default pg_catalog.now()
);
create index xp_transactions_user_idx on public.xp_transactions (user_id, reason_code);
comment on table public.xp_transactions is 'Immutable XP ledger (I-9): no UPDATE or DELETE; corrections are compensating rows.';

create table public.user_progress (
  user_id                uuid primary key references public.profiles (id),
  reliability_score      numeric(6, 5) not null,
  reliability_samples    integer not null,
  reliability_confidence numeric(6, 5) not null,
  xp_total               integer not null default 0,
  algorithm_version      smallint not null default 1,
  computed_at            timestamptz not null default pg_catalog.now()
);
comment on table public.user_progress is 'Derived cache, always recomputable from reliability_events and xp_transactions.';

alter table public.reliability_events enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.user_progress enable row level security;
revoke all on public.reliability_events, public.xp_transactions, public.user_progress from anon, authenticated;
grant select on public.reliability_events, public.xp_transactions, public.user_progress to authenticated;
create policy reliability_events_select_own on public.reliability_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy xp_transactions_select_own on public.xp_transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_progress_select_own on public.user_progress for select to authenticated
  using (user_id = (select auth.uid()));

-- ---- immutability --------------------------------------------------------------------------------------------
create function private.xp_transactions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- I-9
end;
$$;
create trigger xp_transactions_immutable before update or delete on public.xp_transactions
  for each row execute function private.xp_transactions_immutable();

create function private.reliability_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1 then
      return old;  -- cascade from an event or participation that is itself being deleted (drafts only)
    end if;
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if old.voided_at is not null
     or (pg_catalog.to_jsonb(new) - 'voided_at' - 'void_reason') <> (pg_catalog.to_jsonb(old) - 'voided_at' - 'void_reason') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';  -- only voiding, once
  end if;
  return new;
end;
$$;
create trigger reliability_events_guard before update or delete on public.reliability_events
  for each row execute function private.reliability_events_guard();

-- ---- the math (pure, double precision like the TypeScript reference) -------------------------------------------
-- score = (A·p0 + Σ w·v) / (A + Σ w), w = 0.5^(age/180), confidence = Σ w / (Σ w + A)   (RATING_SYSTEM §4.2)
create function private.reliability_score(p_values double precision[], p_ages double precision[])
returns table (score double precision, confidence double precision, samples integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  a   double precision := private.rating_const('reliability.prior_weight');
  p0  double precision := private.rating_const('reliability.prior_value');
  hl  double precision := private.rating_const('reliability.half_life_days');
  n   integer := coalesce(pg_catalog.array_length(p_values, 1), 0);
  w   double precision;
  wsum double precision := 0;
  vsum double precision := 0;
  i   integer;
begin
  for i in 1 .. n loop
    w := pg_catalog.power(0.5::double precision, greatest(0::double precision, p_ages[i]) / hl);
    wsum := wsum + w;
    vsum := vsum + w * p_values[i];
  end loop;
  return query select (a * p0 + vsum) / (a + wsum), wsum / (wsum + a), n;
end;
$$;

-- ---- the progress cache ---------------------------------------------------------------------------------------
create function private.recompute_user_progress(p_uid uuid, p_at timestamptz default pg_catalog.now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_values double precision[];
  v_ages   double precision[];
  s        record;
  v_xp     integer;
begin
  select pg_catalog.array_agg(r.weight::double precision order by r.occurred_at, r.id),
         pg_catalog.array_agg(extract(epoch from (p_at - r.occurred_at)) / 86400.0 order by r.occurred_at, r.id)
    into v_values, v_ages
    from public.reliability_events r
   where r.user_id = p_uid and r.voided_at is null;
  select * into s from private.reliability_score(v_values, v_ages);
  select coalesce(pg_catalog.sum(x.amount), 0)::integer into v_xp from public.xp_transactions x where x.user_id = p_uid;
  insert into public.user_progress (user_id, reliability_score, reliability_samples, reliability_confidence,
                                    xp_total, algorithm_version, computed_at)
  values (p_uid, pg_catalog.round(s.score::numeric, 5), s.samples, pg_catalog.round(s.confidence::numeric, 5), v_xp, 1, p_at)
  on conflict (user_id) do update
     set reliability_score = excluded.reliability_score, reliability_samples = excluded.reliability_samples,
         reliability_confidence = excluded.reliability_confidence, xp_total = excluded.xp_total,
         algorithm_version = excluded.algorithm_version, computed_at = excluded.computed_at;
end;
$$;

-- Canceled after starts_at − min(12 h, ½ · (starts_at − approved_at)) (RATING_SYSTEM §4.1). Pure, so the equivalence test
-- can compare it with the TypeScript reference on random inputs.
create function private.is_late_cancel(p_starts timestamptz, p_approved timestamptz, p_canceled timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_canceled > p_starts - least(
    pg_catalog.make_interval(secs => private.rating_const('reliability.late_cancel_max_window_hours') * 3600),
    (p_starts - p_approved) / 2);
$$;

-- ---- reliability signals --------------------------------------------------------------------------------------
-- Creates the participation's signal from its CURRENT state in a finalized event (RATING_SYSTEM §4.1):
-- PRESENT → ATTENDED, ABSENT → NO_SHOW, late unexcused cancellation after approval → LATE_CANCEL; everything else is
-- neutral (organizer row, NOT_CONFIRMED, DISPUTED, never approved, early or excused cancellation, REMOVED).
create function private.apply_attendance_outcome(p_participation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p      public.event_participations;
  e      public.events;
  v_kind text;
begin
  select * into p from public.event_participations x where x.id = p_participation;
  select * into e from public.events x where x.id = p.event_id;
  if p.is_organizer or e.attendance_finalized_at is null then
    return;
  end if;
  if p.status = 'APPROVED' and p.attendance = 'PRESENT' then
    v_kind := 'ATTENDED';
  elsif p.status = 'APPROVED' and p.attendance = 'ABSENT' then
    v_kind := 'NO_SHOW';
  elsif p.status = 'CANCELED' and p.approved_at is not null and p.canceled_at is not null and not p.cancellation_excused then
    if private.is_late_cancel(e.starts_at, p.approved_at, p.canceled_at) then
      v_kind := 'LATE_CANCEL';
    end if;
  end if;
  if v_kind is null then
    return;
  end if;
  insert into public.reliability_events (user_id, participation_id, event_id, kind, weight, occurred_at)
  values (p.user_id, p.id, e.id, v_kind,
          case v_kind when 'ATTENDED' then private.rating_const('reliability.attended_value')
                      when 'LATE_CANCEL' then private.rating_const('reliability.late_cancel_value')
                      else private.rating_const('reliability.no_show_value') end,
          e.starts_at)
  on conflict (participation_id) where voided_at is null do nothing;
end;
$$;

create function private.void_reliability_event(p_participation uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reliability_events
     set voided_at = pg_catalog.now(), void_reason = p_reason
   where participation_id = p_participation and voided_at is null;
$$;

-- ---- XP -------------------------------------------------------------------------------------------------------
create function private.award_xp(p_user uuid, p_amount integer, p_reason text, p_source_type text, p_source uuid, p_dedupe text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.xp_transactions (user_id, amount, reason_code, source_type, source_id, dedupe_key)
  values (p_user, p_amount, p_reason, p_source_type, p_source, p_dedupe)
  on conflict (dedupe_key) do nothing;
  return found;
end;
$$;

create function private.lock_rating_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  -- Serializes XP decisions of one user across events: the daily and weekly caps read what other events paid.
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rating:' || p_user::text, 0));
$$;

-- ATTENDED_EVENT (+50, capped per day and per week in Istanbul) and FIRST_IN_SPORT (+30) for one verified-present
-- participant of a finalized event. The event needs enough verified-present participants besides the organizer.
create function private.award_attendance_xp(p_event uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        public.events;
  v_others integer;
  v_day    integer;
  v_week   integer;
  v_tz     constant text := 'Europe/Istanbul';
begin
  perform private.lock_rating_user(p_user);
  select * into e from public.events x where x.id = p_event;
  if e.attendance_finalized_at is null
     or not exists (select 1 from public.event_participations p
                     where p.event_id = e.id and p.user_id = p_user and p.status = 'APPROVED' and p.attendance = 'PRESENT') then
    return;
  end if;
  select pg_catalog.count(*) into v_others from public.event_participations p
   where p.event_id = e.id and not p.is_organizer and p.status = 'APPROVED' and p.attendance = 'PRESENT';
  if v_others < private.rating_const('xp.min_present_others') then
    return;
  end if;
  select pg_catalog.count(*) filter (where (ev.starts_at at time zone v_tz)::date = (e.starts_at at time zone v_tz)::date),
         pg_catalog.count(*) filter (where pg_catalog.date_trunc('week', ev.starts_at at time zone v_tz)
                                          = pg_catalog.date_trunc('week', e.starts_at at time zone v_tz))
    into v_day, v_week
    from public.xp_transactions x
    join public.events ev on ev.id = x.source_id
   where x.user_id = p_user and x.reason_code = 'ATTENDED_EVENT' and x.source_id <> e.id;
  if v_day < private.rating_const('xp.attendance_max_per_day') and v_week < private.rating_const('xp.attendance_max_per_week') then
    perform private.award_xp(p_user, private.rating_const('xp.attended_event')::integer, 'ATTENDED_EVENT', 'EVENT', e.id,
                             'attend:' || e.id || ':' || p_user);
  end if;
  perform private.award_xp(p_user, private.rating_const('xp.first_in_sport')::integer, 'FIRST_IN_SPORT', 'SPORT', e.sport_id,
                           'first_sport:' || p_user || ':' || e.sport_id);
end;
$$;

-- ORGANIZED_EVENT (+40): the organizer of an event with enough verified-present others, not a day-old account,
-- at most two a day.
create function private.award_organizer_xp(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e        public.events;
  v_others integer;
  v_day    integer;
  v_tz     constant text := 'Europe/Istanbul';
begin
  select * into e from public.events x where x.id = p_event;
  perform private.lock_rating_user(e.organizer_id);
  if e.attendance_finalized_at is null then
    return;
  end if;
  select pg_catalog.count(*) into v_others from public.event_participations p
   where p.event_id = e.id and not p.is_organizer and p.status = 'APPROVED' and p.attendance = 'PRESENT';
  if v_others < private.rating_const('xp.min_present_others') then
    return;
  end if;
  if (select pr.created_at from public.profiles pr where pr.id = e.organizer_id)
       > e.attendance_finalized_at - pg_catalog.make_interval(secs => private.rating_const('xp.organizer_min_account_age_hours') * 3600) then
    return;
  end if;
  select pg_catalog.count(*) into v_day
    from public.xp_transactions x
    join public.events ev on ev.id = x.source_id
   where x.user_id = e.organizer_id and x.reason_code = 'ORGANIZED_EVENT' and x.source_id <> e.id
     and (ev.starts_at at time zone v_tz)::date = (e.starts_at at time zone v_tz)::date;
  if v_day < private.rating_const('xp.organizer_max_per_day') then
    perform private.award_xp(e.organizer_id, private.rating_const('xp.organized_event')::integer, 'ORGANIZED_EVENT', 'EVENT', e.id,
                             'organize:' || e.id);
  end if;
end;
$$;

-- Everything finalization causes, in the finalizing transaction: signals, XP, the caches. Idempotent: the dedupe
-- keys and the one-active-signal index make a second run a no-op.
create function private.apply_finalization(p_event uuid)
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
  end loop;
end;
$$;

-- M1's finalization point, now with its consequences (M1 documented this hook).
create or replace function private.finalize_event_row(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
     set attendance_finalized_at = pg_catalog.now(),
         review_window_closes_at = pg_catalog.now() + interval '72 hours'
   where id = p_event and status = 'COMPLETED' and attendance_finalized_at is null;
  if found then
    perform private.apply_finalization(p_event);
  end if;
end;
$$;

-- ---- disputes: a DISPUTED mark is excluded until resolved; the resolution creates the correct signal ---------------
create or replace function public.dispute_attendance(p_participation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_onboarded_user();
  v_event uuid;
  e       public.events;
  p       public.event_participations;
begin
  select ep.event_id into v_event from public.event_participations ep where ep.id = p_participation_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into e from public.events x where x.id = v_event for update;
  select * into p from public.event_participations ep where ep.id = p_participation_id for update;
  if p.user_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';  -- not theirs: indistinguishable from missing
  end if;
  if p.attendance = 'DISPUTED' then
    return;  -- idempotent
  end if;
  if p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p.is_organizer or p.attendance <> 'ABSENT' or e.attendance_finalized_at is null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if pg_catalog.now() > e.attendance_finalized_at + interval '72 hours' then
    raise exception 'WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  perform private.lock_rating_user(p.user_id);
  insert into public.attendance_disputes (participation_id, reason) values (p.id, pg_catalog.btrim(p_reason));
  update public.event_participations set attendance = 'DISPUTED' where id = p.id;
  perform private.void_reliability_event(p.id, 'DISPUTED');
  perform private.recompute_user_progress(p.user_id);
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
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'ATTENDANCE_DISPUTE_RESOLVED', p.id, pg_catalog.jsonb_build_object('resolution', p_resolution));
end;
$$;

-- ---- grants: everything above is internal ------------------------------------------------------------------------
revoke all on function private.rating_const(text) from public, anon, authenticated;
revoke all on function private.reliability_score(double precision[], double precision[]) from public, anon, authenticated;
revoke all on function private.is_late_cancel(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.recompute_user_progress(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.apply_attendance_outcome(uuid) from public, anon, authenticated;
revoke all on function private.void_reliability_event(uuid, text) from public, anon, authenticated;
revoke all on function private.award_xp(uuid, integer, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.lock_rating_user(uuid) from public, anon, authenticated;
revoke all on function private.award_attendance_xp(uuid, uuid) from public, anon, authenticated;
revoke all on function private.award_organizer_xp(uuid) from public, anon, authenticated;
revoke all on function private.apply_finalization(uuid) from public, anon, authenticated;
revoke all on function private.xp_transactions_immutable() from public, anon, authenticated;
revoke all on function private.reliability_events_guard() from public, anon, authenticated;
revoke all on private.rating_config from public, anon, authenticated;

-- ---- account export (ADR-0017): the user's own signals, ledger and cache -----------------------------------------
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
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;

-- ---- events finalized before this migration (none on a fresh database): idempotent ---------------------------------
select private.apply_finalization(e.id)
  from public.events e
 where e.attendance_finalized_at is not null
 order by e.attendance_finalized_at;
