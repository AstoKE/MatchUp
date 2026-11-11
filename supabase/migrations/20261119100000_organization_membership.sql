-- Phase 9 / M2: the organization page and membership (ADR-0030, docs/PHASE9_PLAN.md).
--
-- * organization_members.status: ACTIVE, INVITED (an owner or administrator asked the person) or REQUESTED (the person
--   asked). Only ACTIVE rows count or carry authority; a waiting row is always a plain MEMBER.
-- * An invitation meets a request (or the other way round): the person is in, without a second step.
-- * Owner: everything, including roles and handing over ownership. Administrator: invites, decides requests, removes
--   plain members. Member: leaves. The owner leaves only after handing over.
-- * Blocks: a blocked pair cannot invite each other, and member lists leave out people the viewer blocked or is blocked by.
-- * Notifications carry the organization id only: ORGANIZATION_INVITED, ORGANIZATION_JOIN_REQUESTED,
--   ORGANIZATION_MEMBER_APPROVED.

alter table public.organization_members
  add column status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVITED', 'REQUESTED')),
  add column invited_by uuid references public.profiles (id),
  add constraint organization_members_waiting_member check (status = 'ACTIVE' or role = 'MEMBER');
create index organization_members_waiting_idx on public.organization_members (organization_id, status) where status <> 'ACTIVE';

insert into public.app_config (key, value) values
  ('quota.max_organization_invites_open', '50'::jsonb),
  ('quota.max_organization_requests_open', '20'::jsonb)
on conflict (key) do nothing;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER',
  'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED',
  'ORGANIZATION_INVITED', 'ORGANIZATION_JOIN_REQUESTED', 'ORGANIZATION_MEMBER_APPROVED'));

-- The caller's active role in an organization (null when none).
create function private.organization_role(p_org uuid, p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
   where m.organization_id = p_org and m.user_id = p_uid and m.status = 'ACTIVE';
$$;

-- Locks an active organization for a membership change; NOT_FOUND otherwise.
create function private.lock_active_organization(p_org uuid)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  select * into o from public.organizations x where x.id = p_org for update;
  if not found or o.status <> 'ACTIVE' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

-- Same as 20261118100000, with the member count over active members and the caller's membership state.
create or replace function private.organization_json(o public.organizations, p_role text)
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
    'member_count', (select pg_catalog.count(*) from public.organization_members m
                      where m.organization_id = o.id and m.status = 'ACTIVE'),
    'membership', (select m.status from public.organization_members m
                    where m.organization_id = o.id and m.user_id = (select auth.uid())));
$$;

-- The page of an active organization, for any signed-in person. Members see the member list, the owner and
-- administrators also the waiting requests and invitations.
create function public.get_organization(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  o      public.organizations;
  v_role text;
  v_me   public.organization_members;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into o from public.organizations x where x.id = p_id;
  if not found or o.status <> 'ACTIVE' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_me from public.organization_members m where m.organization_id = p_id and m.user_id = v_uid;
  v_role := case when v_me.status = 'ACTIVE' then v_me.role end;
  return private.organization_json(o, v_role) || pg_catalog.jsonb_build_object(
    -- Owner and administrators: who runs it, visible to everyone (minus blocked pairs).
    'leaders', coalesce((
      select pg_catalog.jsonb_agg(private.organization_person(m, p) order by m.role desc, m.created_at)
        from public.organization_members m join public.profiles p on p.id = m.user_id
       where m.organization_id = p_id and m.status = 'ACTIVE' and m.role in ('OWNER', 'ADMIN')
         and p.account_status = 'ACTIVE' and not private.is_blocked_pair(v_uid, m.user_id)), '[]'::jsonb),
    'members', case when v_role is not null then coalesce((
      select pg_catalog.jsonb_agg(private.organization_person(m, p) order by m.created_at, m.user_id)
        from public.organization_members m join public.profiles p on p.id = m.user_id
       where m.organization_id = p_id and m.status = 'ACTIVE'
         and p.account_status = 'ACTIVE' and not private.is_blocked_pair(v_uid, m.user_id)), '[]'::jsonb) end,
    'waiting', case when v_role in ('OWNER', 'ADMIN') then coalesce((
      select pg_catalog.jsonb_agg(private.organization_person(m, p) order by m.created_at, m.user_id)
        from public.organization_members m join public.profiles p on p.id = m.user_id
       where m.organization_id = p_id and m.status <> 'ACTIVE'
         and p.account_status = 'ACTIVE' and not private.is_blocked_pair(v_uid, m.user_id)), '[]'::jsonb) end);
end;
$$;

-- One person in a member list: what the player card would show at most (name and avatar), plus role and state.
create function private.organization_person(m public.organization_members, p public.profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'user_id', p.id, 'display_name', p.display_name, 'avatar_key', p.avatar_key, 'avatar_path', p.avatar_path,
    'role', m.role, 'status', m.status, 'since', m.created_at);
$$;

-- Owner or administrator invites a person (from their player card). Meets a waiting request: the person is in.
create function public.invite_to_organization(p_org uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
  m     public.organization_members;
begin
  if private.organization_role(p_org, v_uid) is distinct from 'OWNER'
     and private.organization_role(p_org, v_uid) is distinct from 'ADMIN' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = v_uid
     or not exists (select 1 from public.profiles p where p.id = p_user and p.account_status = 'ACTIVE' and p.onboarded_at is not null)
     or private.is_blocked_pair(v_uid, p_user) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into m from public.organization_members x where x.organization_id = p_org and x.user_id = p_user;
  if found then
    if m.status = 'REQUESTED' then
      update public.organization_members set status = 'ACTIVE', invited_by = v_uid, created_at = pg_catalog.now()
       where organization_id = p_org and user_id = p_user;
      perform private.notify(p_user, 'ORGANIZATION_MEMBER_APPROVED', pg_catalog.jsonb_build_object('organization_id', p_org),
                             'ORGANIZATION_MEMBER_APPROVED:' || p_org || ':' || p_user || ':' || pg_catalog.now()::text);
      return 'ACTIVE';
    end if;
    return m.status;  -- already invited or a member: nothing to do
  end if;
  if (select pg_catalog.count(*) from public.organization_members x where x.organization_id = p_org and x.status = 'INVITED')
     >= private.config_int('quota.max_organization_invites_open', 50) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (p_org, p_user, 'MEMBER', 'INVITED', v_uid);
  perform private.notify(p_user, 'ORGANIZATION_INVITED', pg_catalog.jsonb_build_object('organization_id', p_org),
                         'ORGANIZATION_INVITED:' || p_org || ':' || p_user || ':' || pg_catalog.now()::text);
  return 'INVITED';
end;
$$;

-- A person asks to join. Meets a waiting invitation: the person is in.
create function public.request_to_join_organization(p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
  m     public.organization_members;
  r     record;
begin
  if exists (select 1 from public.organization_members x
              where x.organization_id = p_org and x.role = 'OWNER' and private.is_blocked_pair(v_uid, x.user_id)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into m from public.organization_members x where x.organization_id = p_org and x.user_id = v_uid;
  if found then
    if m.status = 'INVITED' then
      update public.organization_members set status = 'ACTIVE', created_at = pg_catalog.now()
       where organization_id = p_org and user_id = v_uid;
      return 'ACTIVE';
    end if;
    return m.status;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organization-request:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.organization_members x where x.user_id = v_uid and x.status = 'REQUESTED')
     >= private.config_int('quota.max_organization_requests_open', 20) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.organization_members (organization_id, user_id, role, status)
  values (p_org, v_uid, 'MEMBER', 'REQUESTED');
  for r in select x.user_id from public.organization_members x
            where x.organization_id = p_org and x.status = 'ACTIVE' and x.role in ('OWNER', 'ADMIN')
              and not private.is_blocked_pair(v_uid, x.user_id) loop
    perform private.notify(r.user_id, 'ORGANIZATION_JOIN_REQUESTED', pg_catalog.jsonb_build_object('organization_id', p_org),
                           'ORGANIZATION_JOIN_REQUESTED:' || p_org || ':' || v_uid || ':' || r.user_id || ':' || pg_catalog.now()::text);
  end loop;
  return 'REQUESTED';
end;
$$;

-- The invited person answers.
create function public.respond_to_organization_invite(p_org uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
begin
  if p_accept is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.organization_members set status = 'ACTIVE', created_at = pg_catalog.now()
     where organization_id = p_org and user_id = v_uid and status = 'INVITED';
  else
    delete from public.organization_members where organization_id = p_org and user_id = v_uid and status = 'INVITED';
  end if;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Owner or administrator decides a request.
create function public.decide_organization_request(p_org uuid, p_user uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
begin
  if private.organization_role(p_org, v_uid) is distinct from 'OWNER'
     and private.organization_role(p_org, v_uid) is distinct from 'ADMIN' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_accept is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.organization_members set status = 'ACTIVE', created_at = pg_catalog.now()
     where organization_id = p_org and user_id = p_user and status = 'REQUESTED';
  else
    delete from public.organization_members where organization_id = p_org and user_id = p_user and status = 'REQUESTED';
  end if;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_accept then
    perform private.notify(p_user, 'ORGANIZATION_MEMBER_APPROVED', pg_catalog.jsonb_build_object('organization_id', p_org),
                           'ORGANIZATION_MEMBER_APPROVED:' || p_org || ':' || p_user || ':' || pg_catalog.now()::text);
  end if;
end;
$$;

-- Leave, or withdraw one's own request or invitation. The owner hands over first.
create function public.leave_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
begin
  if private.organization_role(p_org, v_uid) = 'OWNER' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = v_uid;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- Remove a member or withdraw an invitation: the owner anyone but themself, an administrator plain members only.
create function public.remove_organization_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_onboarded_user();
  o        public.organizations := private.lock_active_organization(p_org);
  v_mine   text := private.organization_role(p_org, v_uid);
  m        public.organization_members;
begin
  select * into m from public.organization_members x where x.organization_id = p_org and x.user_id = p_user;
  if not found or p_user = v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (v_mine = 'OWNER' or (v_mine = 'ADMIN' and m.role = 'MEMBER')) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.organization_members where organization_id = p_org and user_id = p_user;
end;
$$;

-- The owner makes an active member an administrator, or back.
create function public.set_organization_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
begin
  if private.organization_role(p_org, v_uid) is distinct from 'OWNER' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_role is null or p_role not in ('ADMIN', 'MEMBER') or p_user = v_uid then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.organization_members set role = p_role
   where organization_id = p_org and user_id = p_user and status = 'ACTIVE';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- The owner hands over to an active member, and stays as an administrator.
create function public.transfer_organization_ownership(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  o     public.organizations := private.lock_active_organization(p_org);
begin
  if private.organization_role(p_org, v_uid) is distinct from 'OWNER' then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_user is null or p_user = v_uid or private.organization_role(p_org, p_user) is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.organization_members set role = 'ADMIN' where organization_id = p_org and user_id = v_uid;
  update public.organization_members set role = 'OWNER' where organization_id = p_org and user_id = p_user;
end;
$$;

-- For the player card: the active organizations the caller runs (owner or administrator), and where the person stands.
create function public.list_organizations_to_invite(p_user uuid)
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
  if p_user is null or p_user = v_uid or private.is_blocked_pair(v_uid, p_user) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', o.id, 'name', o.name,
             'membership', (select t.status from public.organization_members t where t.organization_id = o.id and t.user_id = p_user))
           order by o.name, o.id)
      from public.organization_members m join public.organizations o on o.id = m.organization_id
     where m.user_id = v_uid and m.status = 'ACTIVE' and m.role in ('OWNER', 'ADMIN') and o.status = 'ACTIVE'), '[]'::jsonb);
end;
$$;

revoke all on function public.get_organization(uuid), public.invite_to_organization(uuid, uuid),
  public.request_to_join_organization(uuid), public.respond_to_organization_invite(uuid, boolean),
  public.decide_organization_request(uuid, uuid, boolean), public.leave_organization(uuid),
  public.remove_organization_member(uuid, uuid), public.set_organization_role(uuid, uuid, text),
  public.transfer_organization_ownership(uuid, uuid), public.list_organizations_to_invite(uuid)
  from public, anon, authenticated;
grant execute on function public.get_organization(uuid), public.invite_to_organization(uuid, uuid),
  public.request_to_join_organization(uuid), public.respond_to_organization_invite(uuid, boolean),
  public.decide_organization_request(uuid, uuid, boolean), public.leave_organization(uuid),
  public.remove_organization_member(uuid, uuid), public.set_organization_role(uuid, uuid, text),
  public.transfer_organization_ownership(uuid, uuid), public.list_organizations_to_invite(uuid)
  to authenticated;
revoke all on function private.organization_role(uuid, uuid), private.lock_active_organization(uuid),
  private.organization_person(public.organization_members, public.profiles), private.organization_json(public.organizations, text)
  from public, anon, authenticated;
