-- Phase 10 / M4: staff members of a business (ADR-0031, docs/PHASE10_PLAN.md M3 "staff members").
--
-- * The owner invites a person from their player card; the person accepts (or declines) and becomes STAFF.
-- * Staff edit the business's venues (name, address, sports) like the owner; only the owner edits the business itself
--   (name, contact), sees the contact details and manages staff. Staff leave on their own; the owner removes them.
-- * business_members.status: ACTIVE or INVITED; a waiting row is always STAFF. Blocked pairs cannot invite each other.

alter table public.business_members
  add column status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVITED')),
  add column invited_by uuid references public.profiles (id),
  add constraint business_members_waiting_staff check (status = 'ACTIVE' or role = 'STAFF');

insert into public.app_config (key, value) values ('quota.max_business_staff', '20'::jsonb)
on conflict (key) do nothing;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER',
  'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED',
  'ORGANIZATION_INVITED', 'ORGANIZATION_JOIN_REQUESTED', 'ORGANIZATION_MEMBER_APPROVED',
  'BUSINESS_APPROVED', 'BUSINESS_REJECTED', 'BUSINESS_STAFF_INVITED'));

-- Locks an active business the caller is an active member of (the owner only, when asked); NOT_FOUND otherwise.
create function private.lock_business_member(p_id uuid, p_uid uuid, p_owner_only boolean)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.businesses;
begin
  select * into b from public.businesses x where x.id = p_id for update;
  if not found or b.status <> 'ACTIVE'
     or not exists (select 1 from public.business_members m
                     where m.business_id = p_id and m.user_id = p_uid and m.status = 'ACTIVE'
                       and (m.role = 'OWNER' or not p_owner_only)) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return b;
end;
$$;

-- Same as 20261124100000, for active staff too.
create or replace function public.update_business_venue(p_business uuid, p_venue uuid, p_name text, p_address text, p_sport_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  b         public.businesses := private.lock_business_member(p_business, v_uid, false);
  v_name    text := pg_catalog.btrim(p_name);
  v_address text := nullif(pg_catalog.btrim(p_address), '');
  v_sports  uuid[];
begin
  if not exists (select 1 from public.business_venues bv join public.venues v on v.id = bv.venue_id
                  where bv.business_id = p_business and bv.venue_id = p_venue and v.listing_status = 'ACTIVE') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select coalesce(pg_catalog.array_agg(distinct s), '{}') into v_sports from pg_catalog.unnest(p_sport_ids) s where s is not null;
  if v_name is null or pg_catalog.char_length(v_name) not between 3 and 80 or v_name ~ '[[:cntrl:]]'
     or v_name ~* '(https?:|www\.|@|\.(com|net|org|ru|xyz|io|me|info|tr)\M)'
     or pg_catalog.regexp_replace(v_name, '[ ().-]', '', 'g') ~ '[0-9]{7,}'
     or (v_address is not null and (pg_catalog.char_length(v_address) not between 3 and 300
                                    or v_address ~* '(https?:|www\.|@)'))
     or pg_catalog.cardinality(v_sports) not between 1 and 10
     or exists (select 1 from pg_catalog.unnest(v_sports) s
                 where not exists (select 1 from public.sports sp where sp.id = s and sp.is_active)) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.venues set name = v_name, address_text = v_address where id = p_venue;
  delete from public.venue_sports where venue_id = p_venue and sport_id <> all (v_sports);
  insert into public.venue_sports (venue_id, sport_id) select p_venue, s from pg_catalog.unnest(v_sports) s
  on conflict do nothing;
end;
$$;

-- Same as 20261124100000, for active staff too: staff see the venues; the owner also sees the contact and the staff.
create or replace function public.get_my_business(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  b      public.businesses;
  v_role text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into b from public.businesses x where x.id = p_id;
  select m.role into v_role from public.business_members m
   where m.business_id = p_id and m.user_id = v_uid and m.status = 'ACTIVE';
  if not found or b.status is distinct from 'ACTIVE' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', b.id, 'name', b.name, 'city_id', b.city_id, 'role', v_role,
    'contact_phone', case when v_role = 'OWNER' then b.contact_phone end,
    'contact_email', case when v_role = 'OWNER' then b.contact_email end,
    'venues', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', v.id, 'name', v.name, 'address_text', v.address_text, 'verified', v.verification_status = 'VERIFIED',
               'listed', v.listing_status = 'ACTIVE',
               'sport_ids', coalesce((select pg_catalog.jsonb_agg(s.sport_id order by s.sport_id)
                                        from public.venue_sports s where s.venue_id = v.id), '[]'::jsonb))
             order by v.name, v.id)
        from public.business_venues bv join public.venues v on v.id = bv.venue_id
       where bv.business_id = b.id), '[]'::jsonb),
    'staff', case when v_role = 'OWNER' then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'user_id', p.id, 'display_name', p.display_name, 'status', m.status) order by m.created_at, p.id)
        from public.business_members m join public.profiles p on p.id = m.user_id
       where m.business_id = b.id and m.role = 'STAFF' and p.account_status = 'ACTIVE'), '[]'::jsonb) end);
end;
$$;

-- Same as 20261122100000, with the caller's membership state (an invitation shows here too).
create or replace function public.list_my_businesses()
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
      select pg_catalog.jsonb_agg(private.business_json(b, m.role) || pg_catalog.jsonb_build_object('membership', m.status)
                                  order by b.created_at desc, b.id)
        from public.business_members m join public.businesses b on b.id = m.business_id
       where m.user_id = v_uid and b.status <> 'DISSOLVED'
         and (m.status = 'ACTIVE' or b.status = 'ACTIVE')), '[]'::jsonb),
    'max_owned', private.config_int('quota.max_owned_businesses', 3));
end;
$$;

-- The owner invites a person as staff.
create function public.invite_business_staff(p_business uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  b     public.businesses := private.lock_business_member(p_business, v_uid, true);
  m     public.business_members;
begin
  if p_user is null or p_user = v_uid
     or not exists (select 1 from public.profiles p where p.id = p_user and p.account_status = 'ACTIVE' and p.onboarded_at is not null)
     or private.is_blocked_pair(v_uid, p_user) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into m from public.business_members x where x.business_id = p_business and x.user_id = p_user;
  if found then
    return m.status;  -- already invited or a member
  end if;
  if (select pg_catalog.count(*) from public.business_members x where x.business_id = p_business and x.role = 'STAFF')
     >= private.config_int('quota.max_business_staff', 20) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  insert into public.business_members (business_id, user_id, role, status, invited_by)
  values (p_business, p_user, 'STAFF', 'INVITED', v_uid);
  perform private.notify(p_user, 'BUSINESS_STAFF_INVITED', pg_catalog.jsonb_build_object('business_id', p_business),
                         'BUSINESS_STAFF_INVITED:' || p_business || ':' || p_user || ':' || pg_catalog.now()::text);
  return 'INVITED';
end;
$$;

create function public.respond_business_invite(p_business uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if p_accept is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business and b.status = 'ACTIVE') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.business_members set status = 'ACTIVE', created_at = pg_catalog.now()
     where business_id = p_business and user_id = v_uid and status = 'INVITED';
  else
    delete from public.business_members where business_id = p_business and user_id = v_uid and status = 'INVITED';
  end if;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- The owner removes a staff member or withdraws an invitation.
create function public.remove_business_staff(p_business uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  b     public.businesses := private.lock_business_member(p_business, v_uid, true);
begin
  delete from public.business_members where business_id = p_business and user_id = p_user and role = 'STAFF';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- A staff member leaves. The owner cannot leave (a business without an owner is dissolved by an administrator instead).
create function public.leave_business(p_business uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  if exists (select 1 from public.business_members m
              where m.business_id = p_business and m.user_id = v_uid and m.role = 'OWNER') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.business_members where business_id = p_business and user_id = v_uid and role = 'STAFF';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- For a player card: the active businesses the caller owns, and where the person stands in each.
create function public.list_businesses_to_invite(p_user uuid)
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
             'id', b.id, 'name', b.name,
             'membership', (select t.status from public.business_members t where t.business_id = b.id and t.user_id = p_user))
           order by b.name, b.id)
      from public.business_members m join public.businesses b on b.id = m.business_id
     where m.user_id = v_uid and m.role = 'OWNER' and m.status = 'ACTIVE' and b.status = 'ACTIVE'), '[]'::jsonb);
end;
$$;

revoke all on function public.invite_business_staff(uuid, uuid), public.respond_business_invite(uuid, boolean),
  public.remove_business_staff(uuid, uuid), public.leave_business(uuid), public.list_businesses_to_invite(uuid)
  from public, anon, authenticated;
grant execute on function public.invite_business_staff(uuid, uuid), public.respond_business_invite(uuid, boolean),
  public.remove_business_staff(uuid, uuid), public.leave_business(uuid), public.list_businesses_to_invite(uuid)
  to authenticated;
revoke all on function private.lock_business_member(uuid, uuid, boolean) from public, anon, authenticated;
