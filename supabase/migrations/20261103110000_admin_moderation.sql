-- Phase 6 / M4: what an administrator can do about a report, in the database (F-28, SECURITY S-13 and S-14).
-- Every function here needs a platform administrator signed in with a second factor (aal2) and writes a record that cannot
-- be changed afterwards. Nothing happens by itself: reports and flags wait for a person (docs/PHASE6_PLAN.md decision 4).
--
-- Deviations from the plan, on purpose:
--  * No separate "hide event": an event that is canceled is already invisible to everybody but the people in it
--    (get_event, search_events), and a new lifecycle state is not allowed. admin_cancel_event does it, with the reason
--    MODERATION, and tells the participants.
--  * The flags are computed when asked and not stored: nothing profiles a person between two visits of the console.

-- ---- the record --------------------------------------------------------------------------------------------------------
create table public.moderation_actions (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null,  -- no foreign keys: the record outlives the accounts it is about
  action      text not null check (action in (
                'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
                'REVIEW_HIDDEN', 'REVIEW_RESTORED')),
  target_type text not null check (target_type in ('USER', 'EVENT', 'REVIEW')),
  target_id   uuid not null,
  report_id   uuid,
  outcome     text check (outcome in ('ACTIONED', 'DISMISSED')),
  note        text check (note is null or char_length(note) between 1 and 1000),
  created_at  timestamptz not null default pg_catalog.now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, id desc);
comment on table public.moderation_actions is
  'Append-only record of administrator decisions (F-28). Written only by the admin_* functions; the note is free text written by an administrator: counsel decides how long it is kept (SECURITY §8).';
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;

create function private.moderation_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'moderation_actions is append-only' using errcode = '42501';
end;
$$;
revoke all on function private.moderation_actions_append_only() from public, anon, authenticated;
create trigger moderation_actions_no_change before update or delete on public.moderation_actions
  for each row execute function private.moderation_actions_append_only();
create trigger moderation_actions_no_truncate before truncate on public.moderation_actions
  for each statement execute function private.moderation_actions_append_only();

-- ---- guards ------------------------------------------------------------------------------------------------------------
-- Signed in, verified, ACTIVE, an administrator, and past the second factor. Someone who is no administrator gets the answer
-- for "not allowed", never "needs MFA": the second says the account is one.
create function private.assert_admin_aal2()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_verified_user();
begin
  if not private.is_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'MFA_REQUIRED' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- One decision: the record, and the security audit trail (no free text there).
create function private.record_moderation(
  p_actor uuid, p_action text, p_target_type text, p_target_id uuid,
  p_report uuid default null, p_outcome text default null, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_actions (actor_id, action, target_type, target_id, report_id, outcome, note)
  values (p_actor, p_action, p_target_type, p_target_id, p_report, p_outcome, p_note);
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (p_actor, p_action, p_target_id, pg_catalog.jsonb_build_object('target_type', p_target_type));
$$;

-- A required note of 1 to 1000 characters, trimmed.
create function private.admin_note(p_note text, p_required boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  if (v_note is null and p_required) or char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v_note;
end;
$$;

-- ---- reading the queue ------------------------------------------------------------------------------------------------
create function private.report_item(r public.reports)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'target_label', case r.target_type
      when 'USER' then (select p.display_name from public.profiles p where p.id = r.target_id)
      else (select e.title from public.events e where e.id = r.target_id) end,
    'reason', r.reason,
    'status', r.status,
    'created_at', r.created_at,
    'handled_at', r.handled_at,
    'reporter_id', r.reporter_id,
    'reporter_name', (select p.display_name from public.profiles p where p.id = r.reporter_id),
    'open_for_target', (select pg_catalog.count(*) from public.reports o
                         where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'OPEN'));
$$;

-- Open reports, the oldest first; closed ones, the newest first. 20 a page.
create function public.admin_list_reports(
  p_status text default 'OPEN', p_cursor jsonb default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_after timestamptz;
  v_id    uuid;
  v_rows  public.reports[];
  v_next  jsonb;
begin
  perform private.assert_admin_aal2();
  if p_status is null or p_status not in ('OPEN', 'CLOSED') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  begin
    v_after := (p_cursor ->> 'created_at')::timestamptz;
    v_id := (p_cursor ->> 'id')::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  select pg_catalog.array_agg(q.rep) into v_rows from (
    select r as rep from public.reports r
     where ((p_status = 'OPEN' and r.status = 'OPEN') or (p_status = 'CLOSED' and r.status <> 'OPEN'))
       and (v_after is null
            or (p_status = 'OPEN' and (r.created_at, r.id) > (v_after, v_id))
            or (p_status = 'CLOSED' and (r.created_at, r.id) < (v_after, v_id)))
     order by (case when p_status = 'OPEN' then r.created_at end) asc, (case when p_status = 'OPEN' then r.id end) asc,
              r.created_at desc, r.id desc
     limit v_limit + 1) q;
  if coalesce(pg_catalog.array_length(v_rows, 1), 0) > v_limit then
    v_next := pg_catalog.jsonb_build_object('created_at', (v_rows[v_limit]).created_at, 'id', (v_rows[v_limit]).id);
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(private.report_item(v_rows[i]) order by i)
                         from pg_catalog.generate_series(1, least(coalesce(pg_catalog.array_length(v_rows, 1), 0), v_limit)) i),
                      '[]'::jsonb),
    'next_cursor', v_next);
end;
$$;

-- One report with what a decision needs: the details, the target, the other open reports on it, and what was done before.
create function public.admin_get_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r        public.reports;
  v_target jsonb;
begin
  perform private.assert_admin_aal2();
  select * into r from public.reports x where x.id = p_report_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.target_type = 'USER' then
    select pg_catalog.jsonb_build_object(
             'id', p.id, 'name', p.display_name, 'account_status', p.account_status, 'created_at', p.created_at,
             'is_admin', exists (select 1 from public.platform_admins a where a.user_id = p.id and a.revoked_at is null))
      into v_target from public.profiles p where p.id = r.target_id;
  else
    select pg_catalog.jsonb_build_object(
             'id', e.id, 'name', e.title, 'status', e.status, 'starts_at', e.starts_at,
             'organizer_id', e.organizer_id,
             'organizer_name', (select o.display_name from public.profiles o where o.id = e.organizer_id),
             'approved_count', e.approved_count, 'capacity', e.capacity)
      into v_target from public.events e where e.id = r.target_id;
  end if;
  return private.report_item(r) || pg_catalog.jsonb_build_object(
    'details', r.details,
    'target', v_target,
    'others', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', o.id, 'reason', o.reason, 'details', o.details, 'created_at', o.created_at,
               'reporter_name', (select p.display_name from public.profiles p where p.id = o.reporter_id))
             order by o.created_at, o.id)
        from public.reports o
       where o.target_type = r.target_type and o.target_id = r.target_id and o.status = 'OPEN' and o.id <> r.id), '[]'::jsonb),
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'action', h.action, 'outcome', h.outcome, 'note', h.note, 'created_at', h.created_at)
             order by h.id desc)
        from (select * from public.moderation_actions m
               where m.target_type = r.target_type and m.target_id = r.target_id
               order by m.id desc limit 20) h), '[]'::jsonb));
end;
$$;

-- ---- deciding ---------------------------------------------------------------------------------------------------------
-- One decision about a target closes every open report on it. Returns how many were closed.
create function public.admin_resolve_report(p_report_id uuid, p_outcome text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_admin_aal2();
  v_note  text := private.admin_note(p_note, false);
  r       public.reports;
  v_count integer;
begin
  if p_outcome is null or p_outcome not in ('ACTIONED', 'DISMISSED') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into r from public.reports x where x.id = p_report_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status <> 'OPEN' then
    if r.status = p_outcome then
      return 0;  -- idempotent
    end if;
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.reports
     set status = p_outcome, handled_by = v_uid, handled_at = pg_catalog.now()
   where target_type = r.target_type and target_id = r.target_id and status = 'OPEN';
  get diagnostics v_count = row_count;
  perform private.record_moderation(v_uid, 'REPORT_RESOLVED', r.target_type, r.target_id, r.id, p_outcome, v_note);
  return v_count;
end;
$$;

-- The person cannot act any more: every write function refuses them (ACCOUNT_RESTRICTED), the discovery and the player card
-- stop showing them, and every session of theirs ends. Their events stay as they are: an administrator decides about each
-- one with admin_cancel_event, since the people in them did nothing wrong. Another administrator cannot be suspended;
-- remove the role first.
create function public.admin_suspend_user(p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_note   text := private.admin_note(p_note, true);
  v_status public.account_status;
begin
  select p.account_status into v_status from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status = 'SUSPENDED' then
    return;  -- idempotent
  end if;
  if v_status <> 'ACTIVE' or p_user_id = v_uid
     or exists (select 1 from public.platform_admins a where a.user_id = p_user_id and a.revoked_at is null) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.profiles set account_status = 'SUSPENDED' where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  perform private.record_moderation(v_uid, 'USER_SUSPENDED', 'USER', p_user_id, null, null, v_note);
end;
$$;

create function public.admin_reinstate_user(p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_note   text := private.admin_note(p_note, true);
  v_status public.account_status;
begin
  select p.account_status into v_status from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status = 'ACTIVE' then
    return;  -- idempotent
  end if;
  if v_status <> 'SUSPENDED' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.profiles set account_status = 'ACTIVE' where id = p_user_id;
  perform private.record_moderation(v_uid, 'USER_REINSTATED', 'USER', p_user_id, null, null, v_note);
end;
$$;

-- A published event that has not started. The participants are told it was canceled; the organizer's own words do not
-- exist here, so the page shows only the reason MODERATION.
create function public.admin_cancel_event(p_event_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, true);
  e      public.events;
begin
  select * into e from public.events x where x.id = p_event_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status = 'CANCELED' then
    return;  -- idempotent
  end if;
  if e.status <> 'PUBLISHED' or pg_catalog.now() >= e.starts_at then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.events
     set status = 'CANCELED', canceled_at = pg_catalog.now(), cancel_reason = 'MODERATION', cancel_message = null
   where id = e.id;
  perform private.notify(p.user_id, 'EVENT_CANCELED', pg_catalog.jsonb_build_object('event_id', e.id),
                         'EVENT_CANCELED:' || e.id || ':' || p.user_id)
     from public.event_participations p
    where p.event_id = e.id and not p.is_organizer and p.status in ('REQUESTED', 'WAITLISTED', 'APPROVED');
  perform private.record_moderation(v_uid, 'EVENT_CANCELED_BY_ADMIN', 'EVENT', e.id, null, null, v_note);
end;
$$;

-- A hidden review no longer counts: the rating is computed again. XP already paid stays (PHASE6_PLAN decision 3).
create function private.set_review_status(p_review uuid, p_status text, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_admin_aal2();
  v     public.skill_reviews;
begin
  select * into v from public.skill_reviews x where x.id = p_review;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform private.lock_rating_user(v.reviewee_id);
  select * into v from public.skill_reviews x where x.id = p_review for update;
  if v.status = p_status then
    return;  -- idempotent
  end if;
  update public.skill_reviews set status = p_status where id = v.id;
  perform private.recompute_user_sport_rating(v.reviewee_id, v.sport_id);
  perform private.record_moderation(v_uid, p_action, 'REVIEW', v.id, null, null, p_note);
end;
$$;

create function public.admin_hide_review(p_review_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  perform private.set_review_status(p_review_id, 'HIDDEN', 'REVIEW_HIDDEN', private.admin_note(p_note, true));
end;
$$;

create function public.admin_restore_review(p_review_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  perform private.set_review_status(p_review_id, 'ACTIVE', 'REVIEW_RESTORED', private.admin_note(p_note, true));
end;
$$;

-- ---- looking around ---------------------------------------------------------------------------------------------------
-- The reviews one person wrote or got: an administrator reads them although everybody else cannot (double-blind).
create function public.admin_list_reviews(p_reviewer uuid default null, p_reviewee uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  if p_reviewer is null and p_reviewee is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', r.id, 'event_id', r.event_id, 'event_title', e.title,
             'reviewer_id', r.reviewer_id, 'reviewer_name', a.display_name,
             'reviewee_id', r.reviewee_id, 'reviewee_name', b.display_name,
             'sport_id', r.sport_id, 'skill_score', r.skill_score, 'fair_play', r.fair_play,
             'status', r.status, 'created_at', r.created_at)
           order by r.created_at desc, r.id)
      from (select * from public.skill_reviews x
             where (p_reviewer is null or x.reviewer_id = p_reviewer) and (p_reviewee is null or x.reviewee_id = p_reviewee)
             order by x.created_at desc, x.id limit 100) r
      join public.events e on e.id = r.event_id
      join public.profiles a on a.id = r.reviewer_id
      join public.profiles b on b.id = r.reviewee_id), '[]'::jsonb);
end;
$$;

-- Disputed absences waiting for a decision (admin_resolve_attendance_dispute, Phase 5).
create function public.admin_list_disputes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'participation_id', d.participation_id, 'event_id', e.id, 'event_title', e.title,
             'user_id', p.user_id, 'user_name', pr.display_name, 'reason', d.reason,
             'created_at', d.created_at, 'finalized_at', e.attendance_finalized_at)
           order by d.created_at, d.participation_id)
      from public.attendance_disputes d
      join public.event_participations p on p.id = d.participation_id
      join public.events e on e.id = p.event_id
      join public.profiles pr on pr.id = p.user_id
     where d.status = 'OPEN'), '[]'::jsonb);
end;
$$;

-- Patterns worth a person's attention (RATING_SYSTEM §3.5 and §4.4). Flags only: no penalty follows from any of them.
--  MUTUAL_FIVE     two people who gave each other the top score at 2 or more events
--  REVIEW_BOMBING  a reviewer with 10 or more reviews, 3 or more of them 2 points or more away from what the others gave
--                  the same person at the same event
--  NO_SHOWS        3 or more no-shows in the last 30 days
-- Computed when asked, at most 50 of each kind; the pilot is small enough for it. Look at the plan when it is not.
create function public.admin_list_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  return coalesce((
    select pg_catalog.jsonb_agg(f.item order by f.kind, f.n desc)
      from (
        (select 'MUTUAL_FIVE' as kind, m.n,
                pg_catalog.jsonb_build_object('kind', 'MUTUAL_FIVE', 'count', m.n, 'subjects', pg_catalog.jsonb_build_array(
                  pg_catalog.jsonb_build_object('id', m.a, 'name', (select p.display_name from public.profiles p where p.id = m.a)),
                  pg_catalog.jsonb_build_object('id', m.b, 'name', (select p.display_name from public.profiles p where p.id = m.b)))) as item
           from (select x.reviewer_id as a, x.reviewee_id as b, pg_catalog.count(*)::integer as n
                   from public.skill_reviews x
                   join public.skill_reviews y on y.event_id = x.event_id and y.reviewer_id = x.reviewee_id
                                              and y.reviewee_id = x.reviewer_id
                  where x.status = 'ACTIVE' and y.status = 'ACTIVE' and x.skill_score = 5 and y.skill_score = 5
                    and x.reviewer_id < x.reviewee_id
                  group by x.reviewer_id, x.reviewee_id
                 having pg_catalog.count(*) >= 2
                  order by 3 desc limit 50) m)
        union all
        (select 'REVIEW_BOMBING', b.off,
                pg_catalog.jsonb_build_object('kind', 'REVIEW_BOMBING', 'count', b.off, 'total', b.total,
                  'subjects', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
                    'id', b.reviewer_id, 'name', (select p.display_name from public.profiles p where p.id = b.reviewer_id))))
           from (select s.reviewer_id, pg_catalog.count(*)::integer as total,
                        (pg_catalog.count(*) filter (where s.others is not null and abs(s.skill_score - s.others) >= 2))::integer as off
                   from (select r.reviewer_id, r.skill_score,
                                (select pg_catalog.avg(o.skill_score) from public.skill_reviews o
                                  where o.event_id = r.event_id and o.reviewee_id = r.reviewee_id
                                    and o.id <> r.id and o.status = 'ACTIVE') as others
                           from public.skill_reviews r where r.status = 'ACTIVE') s
                  group by s.reviewer_id) b
          where b.total >= 10 and b.off >= 3
          order by b.off desc limit 50)
        union all
        (select 'NO_SHOWS', c.n,
                pg_catalog.jsonb_build_object('kind', 'NO_SHOWS', 'count', c.n, 'subjects', pg_catalog.jsonb_build_array(
                  pg_catalog.jsonb_build_object('id', c.user_id, 'name', (select p.display_name from public.profiles p where p.id = c.user_id))))
           from (select z.user_id, pg_catalog.count(*)::integer as n from public.reliability_events z
                  where z.kind = 'NO_SHOW' and z.voided_at is null and z.occurred_at > pg_catalog.now() - interval '30 days'
                  group by z.user_id having pg_catalog.count(*) >= 3
                  order by 2 desc limit 50) c)
      ) f(kind, n, item)), '[]'::jsonb);
end;
$$;

-- A person, for the console: what an administrator looks at before deciding.
create function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  perform private.assert_admin_aal2();
  select * into p from public.profiles x where x.id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'bio', p.bio, 'account_status', p.account_status, 'created_at', p.created_at,
    'is_admin', exists (select 1 from public.platform_admins a where a.user_id = p.id and a.revoked_at is null),
    'events_organized', (select pg_catalog.count(*) from public.events e where e.organizer_id = p.id and e.status <> 'DRAFT'),
    'events_joined', (select pg_catalog.count(*) from public.event_participations q
                       where q.user_id = p.id and q.status = 'APPROVED' and not q.is_organizer),
    'reports_open', (select pg_catalog.count(*) from public.reports r
                      where r.target_type = 'USER' and r.target_id = p.id and r.status = 'OPEN'),
    'reports_total', (select pg_catalog.count(*) from public.reports r where r.target_type = 'USER' and r.target_id = p.id),
    'no_shows_30d', (select pg_catalog.count(*) from public.reliability_events z
                      where z.user_id = p.id and z.kind = 'NO_SHOW' and z.voided_at is null
                        and z.occurred_at > pg_catalog.now() - interval '30 days'),
    'blocked_by', (select pg_catalog.count(*) from public.user_blocks b where b.blocked_id = p.id),
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', h.id, 'action', h.action, 'outcome', h.outcome, 'note', h.note, 'created_at', h.created_at)
             order by h.id desc)
        from (select * from public.moderation_actions m
               where m.target_type = 'USER' and m.target_id = p.id order by m.id desc limit 20) h), '[]'::jsonb));
end;
$$;

-- By name, at least two letters, 20 at most.
create function public.admin_search_users(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  perform private.assert_admin_aal2();
  if char_length(v_query) not between 2 and 80 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', m.id, 'name', m.display_name, 'account_status', m.account_status)
                                order by m.display_name, m.id)
      from (select p.id, p.display_name, p.account_status from public.profiles p
             where p.display_name ilike '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
                     v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
             order by p.display_name, p.id limit 20) m), '[]'::jsonb);
end;
$$;

-- Everything an administrator decided, newest first.
create function public.admin_list_actions(p_cursor jsonb default null, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_before bigint;
  v_ids   bigint[];
  v_next  jsonb;
begin
  perform private.assert_admin_aal2();
  begin
    v_before := (p_cursor ->> 'id')::bigint;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;
  select pg_catalog.array_agg(m.id order by m.id desc) into v_ids
    from (select x.id from public.moderation_actions x where v_before is null or x.id < v_before
           order by x.id desc limit v_limit + 1) m;
  if coalesce(pg_catalog.array_length(v_ids, 1), 0) > v_limit then
    v_next := pg_catalog.jsonb_build_object('id', v_ids[v_limit]);
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', m.id, 'actor_id', m.actor_id,
               'actor_name', (select p.display_name from public.profiles p where p.id = m.actor_id),
               'action', m.action, 'target_type', m.target_type, 'target_id', m.target_id, 'report_id', m.report_id,
               'outcome', m.outcome, 'note', m.note, 'created_at', m.created_at) order by m.id desc)
        from public.moderation_actions m where m.id = any (v_ids[1:v_limit])), '[]'::jsonb),
    'next_cursor', v_next);
end;
$$;

-- ---- who may call what -----------------------------------------------------------------------------------------------
revoke all on function private.assert_admin_aal2() from public, anon, authenticated;
revoke all on function private.record_moderation(uuid, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.admin_note(text, boolean) from public, anon, authenticated;
revoke all on function private.report_item(public.reports) from public, anon, authenticated;
revoke all on function private.set_review_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_reports(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.admin_get_report(uuid) from public, anon, authenticated;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_suspend_user(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reinstate_user(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_cancel_event(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_hide_review(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_restore_review(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_list_reviews(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_disputes() from public, anon, authenticated;
revoke all on function public.admin_list_flags() from public, anon, authenticated;
revoke all on function public.admin_get_user(uuid) from public, anon, authenticated;
revoke all on function public.admin_search_users(text) from public, anon, authenticated;
revoke all on function public.admin_list_actions(jsonb, integer) from public, anon, authenticated;
grant execute on function public.admin_list_reports(text, jsonb, integer) to authenticated;
grant execute on function public.admin_get_report(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;
grant execute on function public.admin_reinstate_user(uuid, text) to authenticated;
grant execute on function public.admin_cancel_event(uuid, text) to authenticated;
grant execute on function public.admin_hide_review(uuid, text) to authenticated;
grant execute on function public.admin_restore_review(uuid, text) to authenticated;
grant execute on function public.admin_list_reviews(uuid, uuid) to authenticated;
grant execute on function public.admin_list_disputes() to authenticated;
grant execute on function public.admin_list_flags() to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_search_users(text) to authenticated;
grant execute on function public.admin_list_actions(jsonb, integer) to authenticated;
