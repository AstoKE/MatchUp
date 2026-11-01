-- Phase 6 / M2: reporting (F-27). PRD §4.9, USER_FLOWS FL-9, SECURITY S-16, docs/PHASE6_PLAN.md decision 2 (USER and EVENT only:
-- reviews are double-blind so nobody can see one to report it, venues wait for Phase 4). Nothing happens automatically: a report
-- waits for a person (decision 4). The reporter learns only that it was received; the target never learns who reported.

insert into public.app_config (key, value) values ('quota.max_reports_per_day', '20'::jsonb)
on conflict (key) do nothing;

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type text not null check (target_type in ('USER', 'EVENT')),
  target_id   uuid not null,
  reason      text not null check (reason in ('SPAM', 'HARASSMENT', 'UNSAFE', 'FAKE_EVENT', 'INAPPROPRIATE', 'OTHER')),
  details     text check (details is null or char_length(details) between 1 and 1000),
  status      text not null default 'OPEN' check (status in ('OPEN', 'ACTIONED', 'DISMISSED')),
  handled_by  uuid references public.profiles (id),
  handled_at  timestamptz,
  created_at  timestamptz not null default pg_catalog.now(),
  constraint reports_handled check ((status = 'OPEN') = (handled_at is null))
);
create unique index reports_one_open_uq on public.reports (reporter_id, target_type, target_id) where status = 'OPEN';
create index reports_open_idx on public.reports (created_at) where status = 'OPEN';
create index reports_reporter_idx on public.reports (reporter_id, created_at);
comment on table public.reports is 'User reports. Written only through report(); who handled one is not visible to the reporter.';

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
-- Column grant: what was done and by whom stays with the moderators.
grant select (id, target_type, target_id, reason, details, created_at) on public.reports to authenticated;
create policy reports_select_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Could the reporter have come across this person? Anyone they share an event with, the organizer of a public event, or a
-- public profile. Otherwise the answer is the one for a missing person: report() is no way to probe for accounts.
-- Blocks do not count here: reporting someone you blocked is normal.
create function private.can_report_user(p_uid uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_is_public(p_target)
      or exists (select 1 from public.events e
                  where e.organizer_id = p_target and e.status <> 'DRAFT'
                    and (e.visibility = 'PUBLIC'
                         or exists (select 1 from public.event_participations mine
                                     where mine.event_id = e.id and mine.user_id = p_uid)))
      or exists (select 1 from public.events e
                  where e.organizer_id = p_uid
                    and exists (select 1 from public.event_participations theirs
                                 where theirs.event_id = e.id and theirs.user_id = p_target))
      or exists (select 1 from public.event_participations mine
                   join public.event_participations theirs on theirs.event_id = mine.event_id
                  where mine.user_id = p_uid and theirs.user_id = p_target
                    and mine.status = 'APPROVED' and theirs.status = 'APPROVED');
$$;
revoke all on function private.can_report_user(uuid, uuid) from public, anon, authenticated;

-- Returns the report's id. Reporting the same thing twice while it is open returns the first one and costs nothing.
create function public.report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null,
  p_invite_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  v_details text := nullif(pg_catalog.btrim(p_details), '');
  v_id      uuid;
  e         public.events;
begin
  if p_target_type is null or p_target_type not in ('USER', 'EVENT') or p_target_id is null
     or p_reason is null or p_reason not in ('SPAM', 'HARASSMENT', 'UNSAFE', 'FAKE_EVENT', 'INAPPROPRIATE', 'OTHER')
     or coalesce(char_length(v_details), 0) > 1000 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if p_target_type = 'USER' then
    if p_target_id = v_uid then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_target_id and p.account_status <> 'DELETED')
       or not private.can_report_user(v_uid, p_target_id) then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  else
    select * into e from public.events x where x.id = p_target_id;
    if found and e.organizer_id = v_uid then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';  -- one's own event
    end if;
    if not found or e.status = 'DRAFT'
       or not ((e.visibility = 'PUBLIC' and e.status = 'PUBLISHED')
               or e.invite_token is not distinct from p_invite_token and p_invite_token is not null
               or exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = v_uid)) then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- The daily count reads what other calls just wrote: one reporter at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('report:' || v_uid::text, 0));

  select r.id into v_id from public.reports r
   where r.reporter_id = v_uid and r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'OPEN';
  if found then
    return v_id;
  end if;
  if (select pg_catalog.count(*) from public.reports r
       where r.reporter_id = v_uid and r.created_at > pg_catalog.now() - interval '24 hours')
     >= private.config_int('quota.max_reports_per_day', 20) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, p_target_type, p_target_id, p_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.report(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.report(text, uuid, text, text, text) to authenticated;

-- ---- account export and purge (ADR-0017) ------------------------------------------------------------------------
-- The reports a user wrote are theirs; reports about them are not exported, that would identify the reporter. On purge the
-- free text goes and the row stays, so a moderator can still see that a report existed.
create or replace function private.purge_event_data(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications where user_id = p_uid;
  delete from public.user_sport_ratings where user_id = p_uid;
  delete from public.user_achievements where user_id = p_uid;
  delete from public.user_blocks where blocker_id = p_uid or blocked_id = p_uid;
  update public.reports set details = null where reporter_id = p_uid and details is not null;
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
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.blocked_id, 'created_at', ub.created_at)
             order by ub.created_at, ub.blocked_id)
        from public.user_blocks ub where ub.blocker_id = p_uid), '[]'::jsonb),
    'reports_written', coalesce((
      select jsonb_agg(jsonb_build_object(
               'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason,
               'details', r.details, 'created_at', r.created_at)
             order by r.created_at, r.id)
        from public.reports r where r.reporter_id = p_uid), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', n.type, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at)
             order by n.created_at)
        from public.notifications n where n.user_id = p_uid), '[]'::jsonb));
$$;
