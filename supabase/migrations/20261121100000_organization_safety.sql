-- Phase 9 / M4: organizations and safety (ADR-0030, docs/PHASE9_PLAN.md).
--
-- * Report an organization (a new report target, with the same daily limit and "one open report per target").
-- * Administrators with the second factor see an organization with its members and reports, and hide or restore it.
--   A hidden organization is like a dissolved one everywhere else (every read and write requires ACTIVE): its page,
--   its events' link and its membership changes stop; nothing is deleted.
-- * Names and descriptions already follow the display-name filter (M1); blocks already apply to invitations, requests
--   and lists (M2).

alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'DISSOLVED', 'HIDDEN'));

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('USER', 'EVENT', 'VENUE', 'ORGANIZATION'));

alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
  check (target_type in ('USER', 'EVENT', 'REVIEW', 'VENUE', 'ORGANIZATION'));
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
  'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'ORGANIZATION_HIDDEN', 'ORGANIZATION_RESTORED'));

alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'FEEDBACK_UPDATED', 'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED', 'ORGANIZATION_HIDDEN', 'ORGANIZATION_RESTORED'));

-- Same as 20261107100000, plus ORGANIZATION: an active organization, not one's own (as owner).
create or replace function public.report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null,
                                         p_invite_token text default null)
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
  if p_target_type is null or p_target_type not in ('USER', 'EVENT', 'VENUE', 'ORGANIZATION') or p_target_id is null
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
  elsif p_target_type = 'VENUE' then
    if not exists (select 1 from public.venues v where v.id = p_target_id and v.listing_status = 'ACTIVE') then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
  elsif p_target_type = 'ORGANIZATION' then
    if private.organization_role(p_target_id, v_uid) = 'OWNER' then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';  -- one's own organization
    end if;
    if not exists (select 1 from public.organizations o where o.id = p_target_id and o.status = 'ACTIVE') then
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

-- Same as 20261107100000, plus the organization's name as the label.
create or replace function private.report_item(r public.reports)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'target_label', case r.target_type
      when 'USER' then (select p.display_name from public.profiles p where p.id = r.target_id)
      when 'VENUE' then (select v.name from public.venues v where v.id = r.target_id)
      when 'ORGANIZATION' then (select o.name from public.organizations o where o.id = r.target_id)
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

-- Same as 20261107100000, plus the organization as a target.
create or replace function public.admin_get_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  elsif r.target_type = 'VENUE' then
    select pg_catalog.jsonb_build_object(
             'id', v.id, 'name', v.name, 'listing_status', v.listing_status,
             'verified', v.verification_status = 'VERIFIED')
      into v_target from public.venues v where v.id = r.target_id;
  elsif r.target_type = 'ORGANIZATION' then
    select pg_catalog.jsonb_build_object(
             'id', o.id, 'name', o.name, 'status', o.status,
             'member_count', (select pg_catalog.count(*) from public.organization_members m
                               where m.organization_id = o.id and m.status = 'ACTIVE'))
      into v_target from public.organizations o where o.id = r.target_id;
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
$function$;

-- The console: one organization with its members, open reports and moderation history.
create function public.admin_get_organization(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  perform private.assert_admin_aal2();
  select * into o from public.organizations x where x.id = p_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', o.id, 'name', o.name, 'description', o.description, 'status', o.status, 'created_at', o.created_at,
    'members', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'user_id', p.id, 'display_name', p.display_name, 'role', m.role, 'status', m.status)
             order by m.role desc, m.created_at, p.id)
        from public.organization_members m join public.profiles p on p.id = m.user_id
       where m.organization_id = o.id), '[]'::jsonb),
    'open_reports', (select pg_catalog.count(*) from public.reports r
                      where r.target_type = 'ORGANIZATION' and r.target_id = o.id and r.status = 'OPEN'),
    'history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'action', h.action, 'note', h.note, 'created_at', h.created_at) order by h.id desc)
        from (select * from public.moderation_actions m
               where m.target_type = 'ORGANIZATION' and m.target_id = o.id order by m.id desc limit 20) h), '[]'::jsonb));
end;
$$;

-- Hide (with a required note) or restore an active or hidden organization. Recorded as a moderation action.
create function public.admin_set_organization_hidden(p_id uuid, p_hidden boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, true);
  o      public.organizations;
begin
  if p_hidden is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into o from public.organizations x where x.id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if (p_hidden and o.status <> 'ACTIVE') or (not p_hidden and o.status <> 'HIDDEN') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.organizations set status = case when p_hidden then 'HIDDEN' else 'ACTIVE' end where id = p_id;
  perform private.record_moderation(v_uid, case when p_hidden then 'ORGANIZATION_HIDDEN' else 'ORGANIZATION_RESTORED' end,
                                    'ORGANIZATION', p_id, null, null, v_note);
end;
$$;

revoke all on function public.admin_get_organization(uuid), public.admin_set_organization_hidden(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_get_organization(uuid), public.admin_set_organization_hidden(uuid, boolean, text)
  to authenticated;
