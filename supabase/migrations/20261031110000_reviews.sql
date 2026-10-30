-- Phase 5 / M2: double-blind skill reviews (F-24). DATABASE §3.5, RATING_SYSTEM §3.3 and §3.5, invariant I-8,
-- docs/PHASE5_PLAN.md. A review is written by one verified-present participant about another of the same finalized
-- event, inside the 72 h window. Nobody but its author can read it (the rating engine, M3, is the only consumer).
-- No notifications yet (they arrive with the app change), no blocked-pair filter yet (Phase 6).

create table public.skill_reviews (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id),
  reviewee_id uuid not null references public.profiles (id),
  sport_id    uuid not null references public.sports (id),
  skill_score smallint not null check (skill_score between 1 and 5),
  fair_play   boolean not null default false,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'HIDDEN')),
  created_at  timestamptz not null default pg_catalog.now(),
  unique (event_id, reviewer_id, reviewee_id),
  constraint skill_reviews_not_self check (reviewer_id <> reviewee_id)
);
comment on table public.skill_reviews is
  'Peer skill reviews, double-blind: readable only by the author. Written only through submit_reviews.';
create index skill_reviews_reviewee_idx on public.skill_reviews (reviewee_id, sport_id) where status = 'ACTIVE';

alter table public.skill_reviews enable row level security;
grant select on public.skill_reviews to authenticated;
create policy skill_reviews_select_own on public.skill_reviews for select to authenticated
  using (reviewer_id = (select auth.uid()));

-- I-8 as a second line behind the RPC: both people must be verified present at a finalized event.
create function private.skill_reviews_before_insert()
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
  return new;
end;
$$;
revoke all on function private.skill_reviews_before_insert() from public, anon, authenticated;
create trigger skill_reviews_before_insert before insert on public.skill_reviews
  for each row execute function private.skill_reviews_before_insert();

-- p_reviews: [{"reviewee_id": uuid, "skill_score": 1..5, "fair_play": bool (optional)}], at most 60. All or nothing:
-- one ineligible or duplicate entry rejects the whole submission. Returns how many reviews were stored.
create function public.submit_reviews(p_event_id uuid, p_reviews jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.assert_onboarded_user();
  e          public.events;
  me         public.event_participations;
  v_item     jsonb;
  v_reviewee uuid;
  v_score    numeric;
  v_fair     boolean;
  v_target   public.event_participations;
  v_seen     uuid[] := array[]::uuid[];
  v_others   integer;
  v_count    integer := 0;
begin
  if p_reviews is null or pg_catalog.jsonb_typeof(p_reviews) <> 'array'
     or pg_catalog.jsonb_array_length(p_reviews) not between 1 and 60 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  -- FOR SHARE: many reviewers submit at once, but the event cannot be finalized or edited underneath them.
  select * into e from public.events x where x.id = p_event_id for share;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into me from public.event_participations p where p.event_id = e.id and p.user_id = v_uid;
  if not found or me.status <> 'APPROVED' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';  -- not a participant: indistinguishable from missing
  end if;
  if e.status <> 'COMPLETED' or e.attendance_finalized_at is null then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';  -- the window has not opened
  end if;
  if pg_catalog.now() > e.review_window_closes_at then
    raise exception 'WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if me.attendance <> 'PRESENT' then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';  -- absent, unconfirmed or disputed
  end if;
  if me.is_organizer then
    -- The organizer's own row is self-attested: it earns review rights only with 2+ verified-present others.
    select pg_catalog.count(*) into v_others from public.event_participations p
     where p.event_id = e.id and not p.is_organizer and p.status = 'APPROVED' and p.attendance = 'PRESENT';
    if v_others < 2 then
      raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';
    end if;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_reviews) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'reviewee_id') <> 'string'
       or (v_item ->> 'reviewee_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or pg_catalog.jsonb_typeof(v_item -> 'skill_score') <> 'number'
       or (v_item ? 'fair_play' and pg_catalog.jsonb_typeof(v_item -> 'fair_play') <> 'boolean') then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    v_reviewee := (v_item ->> 'reviewee_id')::uuid;
    v_score := (v_item ->> 'skill_score')::numeric;
    v_fair := coalesce((v_item ->> 'fair_play')::boolean, false);
    if v_score <> pg_catalog.trunc(v_score) or v_score not between 1 and 5 or v_reviewee = any (v_seen) then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_reviewee;
    if v_reviewee = v_uid then
      raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';  -- not yourself
    end if;
    select * into v_target from public.event_participations p where p.event_id = e.id and p.user_id = v_reviewee;
    if not found or v_target.status <> 'APPROVED' or v_target.attendance <> 'PRESENT' then
      raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = 'P0001';
    end if;
    insert into public.skill_reviews (event_id, reviewer_id, reviewee_id, sport_id, skill_score, fair_play)
    values (e.id, v_uid, v_reviewee, e.sport_id, v_score::smallint, v_fair)
    on conflict (event_id, reviewer_id, reviewee_id) do nothing;
    if not found then
      raise exception 'ALREADY_REVIEWED' using errcode = 'P0001';
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.submit_reviews(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_reviews(uuid, jsonb) to authenticated;

-- ---- account export (ADR-0017): the reviews the user wrote. Reviews about them stay anonymous aggregates. -----
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
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;
