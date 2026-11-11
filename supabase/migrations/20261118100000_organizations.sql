-- Phase 9 / M1: organizations, created on request and approved by an administrator (ADR-0030, docs/PHASE9_PLAN.md).
--
-- * request_organization writes a PENDING organization and its OWNER row; at most 2 per owner, pending ones included.
--   No threshold besides the review (founder, 2026-11-11); the onboarded-user guard requires a verified phone once
--   ADR-0029's switch is on.
-- * An administrator with the second factor approves (ACTIVE) or rejects with a reason (REJECTED); audited, and the
--   requester is notified. A pending request can be withdrawn (deleted: nothing depends on it yet).
-- * RLS on, no API grants on either table: every read and write is an RPC.
-- * Export: the person's memberships and requests. Purge: memberships go; an organization left without an owner or
--   administrator is dissolved, a pending one is deleted.

insert into public.app_config (key, value) values ('quota.max_owned_organizations', '2'::jsonb)
on conflict (key) do nothing;

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 40),
  description   text check (description is null or char_length(description) between 1 and 500),
  city_id       uuid not null references public.cities (id),
  sport_ids     uuid[] not null check (cardinality(sport_ids) between 1 and 5),
  status        text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'DISSOLVED')),
  created_by    uuid not null references public.profiles (id),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 1 and 500),
  created_at    timestamptz not null default pg_catalog.now(),
  constraint organizations_decided check ((status = 'PENDING') = (decided_at is null) or status = 'DISSOLVED'),
  constraint organizations_rejected check ((status = 'REJECTED') = (reject_reason is not null))
);
create index organizations_pending_idx on public.organizations (created_at) where status = 'PENDING';
create index organizations_creator_idx on public.organizations (created_by);
comment on table public.organizations is 'Teams and clubs (ADR-0030). Written and read only through RPCs.';

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id),
  role            text not null check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  created_at      timestamptz not null default pg_catalog.now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
create unique index organization_members_one_owner_uq on public.organization_members (organization_id) where role = 'OWNER';

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.organizations, public.organization_members from anon, authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER',
  'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED'));

alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'FEEDBACK_UPDATED', 'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED'));

-- A description: trimmed, at most 500 characters, and no links, e-mail addresses or phone numbers (as display names).
create function private.clean_organization_description(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(p_text), '');
begin
  if v is null then
    return null;
  end if;
  if pg_catalog.char_length(v) > 500
     or v ~* '(https?:|www\.|@|\.(com|net|org|ru|xyz|io|me|info|tr)\M)'
     or pg_catalog.regexp_replace(v, '[ ().-]', '', 'g') ~ '[0-9]{7,}' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- One organization as its member or requester sees it.
create function private.organization_json(o public.organizations, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', o.id, 'name', o.name, 'description', o.description, 'city_id', o.city_id, 'sport_ids', pg_catalog.to_jsonb(o.sport_ids),
    'status', o.status, 'role', p_role, 'reject_reason', o.reject_reason,
    'created_at', o.created_at, 'decided_at', o.decided_at,
    'member_count', (select pg_catalog.count(*) from public.organization_members m where m.organization_id = o.id));
$$;

-- Returns the new organization's id.
create function public.request_organization(p_name text, p_description text, p_city_id uuid, p_sport_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.assert_onboarded_user();
  v_name        text := private.clean_display_name(p_name);
  v_description text := private.clean_organization_description(p_description);
  v_sports      uuid[];
  v_id          uuid;
begin
  select pg_catalog.array_agg(distinct s) into v_sports from pg_catalog.unnest(p_sport_ids) s;
  if p_city_id is null or not exists (select 1 from public.cities c where c.id = p_city_id)
     or v_sports is null or pg_catalog.cardinality(v_sports) not between 1 and 5
     or exists (select 1 from pg_catalog.unnest(v_sports) s
                 where s is null or not exists (select 1 from public.sports sp where sp.id = s and sp.is_active)) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  -- The count reads what other calls just wrote: one requester at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organization:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.organization_members m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = v_uid and m.role = 'OWNER' and o.status in ('PENDING', 'ACTIVE'))
     >= private.config_int('quota.max_owned_organizations', 2) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.organizations (name, description, city_id, sport_ids, created_by)
  values (v_name, v_description, p_city_id, v_sports, v_uid)
  returning id into v_id;
  insert into public.organization_members (organization_id, user_id, role) values (v_id, v_uid, 'OWNER');
  return v_id;
end;
$$;

-- The requester withdraws a request that is still waiting.
create function public.cancel_organization_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  delete from public.organizations o
   where o.id = p_id and o.status = 'PENDING' and o.created_by = v_uid;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- The caller's organizations (any role) and their own requests, newest first. Rejected requests stay visible with the
-- reason; dissolved organizations are left out.
create function public.list_my_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(private.organization_json(o, m.role) order by o.created_at desc, o.id)
        from public.organization_members m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = v_uid and o.status <> 'DISSOLVED'), '[]'::jsonb),
    'max_owned', private.config_int('quota.max_owned_organizations', 2));
end;
$$;

-- The console: requests by status (default: waiting, oldest first), with what helps judge the requester.
create function public.admin_list_organization_requests(p_status text default 'PENDING')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  if p_status is null or p_status not in ('PENDING', 'ACTIVE', 'REJECTED') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(r.item order by r.ord)
      from (
        select pg_catalog.row_number() over (
                 order by case when p_status = 'PENDING' then o.created_at end,
                          case when p_status <> 'PENDING' then o.decided_at end desc, o.id) as ord,
               private.organization_json(o, 'OWNER') || pg_catalog.jsonb_build_object(
                 'requester_id', p.id, 'requester_name', p.display_name, 'requester_since', p.created_at,
                 'requester_status', p.account_status,
                 'requester_events_organized', (select pg_catalog.count(*) from public.events e
                                                 where e.organizer_id = p.id and e.status = 'COMPLETED'),
                 'requester_open_reports', (select pg_catalog.count(*) from public.reports rp
                                             where rp.target_type = 'USER' and rp.target_id = p.id and rp.status = 'OPEN')) as item
          from public.organizations o
          join public.profiles p on p.id = o.created_by
         where o.status = p_status
         limit 200
      ) r), '[]'::jsonb);
end;
$$;

create function public.admin_decide_organization(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  o        public.organizations;
begin
  if p_id is null or p_approve is null or (not p_approve and v_reason is null)
     or pg_catalog.char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into o from public.organizations x where x.id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if o.status <> 'PENDING' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.organizations
     set status = case when p_approve then 'ACTIVE' else 'REJECTED' end,
         decided_by = v_uid, decided_at = pg_catalog.now(),
         reject_reason = case when p_approve then null else v_reason end
   where id = p_id;
  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, case when p_approve then 'ORGANIZATION_APPROVED' else 'ORGANIZATION_REJECTED' end, p_id);
  perform private.notify(o.created_by,
                         case when p_approve then 'ORGANIZATION_APPROVED' else 'ORGANIZATION_REJECTED' end,
                         pg_catalog.jsonb_build_object('organization_id', p_id),
                         'ORGANIZATION_DECIDED:' || p_id);
end;
$$;

-- ---- account export and purge (ADR-0017) ------------------------------------------------------------------------
create function private.export_organization_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('organizations', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'name', o.name, 'description', o.description, 'status', o.status, 'role', m.role,
             'requested_by_me', o.created_by = p_uid, 'joined_at', m.created_at, 'reject_reason', o.reject_reason)
           order by m.created_at, o.id)
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
     where m.user_id = p_uid), '[]'::jsonb));
$$;

-- Same as 20261117100000, plus the organizations.
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
    into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

-- Same as 20261117100000, plus the organizations: pending requests are deleted; an active organization keeps going if an
-- administrator remains (the longest-standing one becomes the owner), else it is dissolved; memberships go.
CREATE OR REPLACE FUNCTION private.purge_account(p_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status    public.account_status;
  v_requested timestamptz;
  r           record;
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
  delete from private.avatar_uploads where user_id = p_uid;
  delete from public.push_devices where user_id = p_uid;
  delete from public.push_outbox where user_id = p_uid;  -- deliveries cascade
  delete from private.push_recommended where user_id = p_uid;
  delete from public.feedback where user_id = p_uid;
  update public.feedback set handled_by = null where handled_by = p_uid;
  delete from public.organizations where created_by = p_uid and status = 'PENDING';  -- members cascade
  -- Active ones only: a rejected request stays as the record it is (its membership row goes below).
  for r in select m.organization_id from public.organization_members m
             join public.organizations o on o.id = m.organization_id
            where m.user_id = p_uid and m.role = 'OWNER' and o.status = 'ACTIVE' loop
    delete from public.organization_members where organization_id = r.organization_id and user_id = p_uid;
    update public.organization_members set role = 'OWNER'
     where (organization_id, user_id) = (
       select a.organization_id, a.user_id from public.organization_members a
        where a.organization_id = r.organization_id and a.role = 'ADMIN'
        order by a.created_at, a.user_id limit 1);
    if not found then
      update public.organizations set status = 'DISSOLVED' where id = r.organization_id;
    end if;
  end loop;
  delete from public.organization_members where user_id = p_uid;
  update public.organizations set decided_by = null where decided_by = p_uid;
  update public.profiles
     set display_name = null, avatar_path = null, avatar_key = null, gender = null, bio = null,
         city_id = null, district_id = null, account_status = 'DELETED'
   where id = p_uid;
  delete from auth.users where id = p_uid;

  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (null, 'ACCOUNT_PURGED', p_uid, jsonb_build_object('requested_at', v_requested));
  return true;
end;
$function$;

revoke all on function public.request_organization(text, text, uuid, uuid[]), public.cancel_organization_request(uuid),
  public.list_my_organizations(), public.admin_list_organization_requests(text),
  public.admin_decide_organization(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.request_organization(text, text, uuid, uuid[]), public.cancel_organization_request(uuid),
  public.list_my_organizations(), public.admin_list_organization_requests(text),
  public.admin_decide_organization(uuid, boolean, text) to authenticated;
revoke all on function private.clean_organization_description(text), private.organization_json(public.organizations, text),
  private.export_organization_data(uuid) from public, anon, authenticated;
