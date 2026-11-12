-- Phase 10 / M1: businesses, approved by an administrator (ADR-0031, docs/PHASE10_PLAN.md).
--
-- * request_business writes a PENDING business, its OWNER row and the claimed venues (COMMERCIAL_FACILITY only, one
--   business per venue, at most 10). At most 3 businesses per person, waiting ones included.
-- * Ownership is the administrator's decision (founder, 2026-11-12): approve, or reject with a reason; audited; the
--   requester is notified. A rejected or withdrawn request releases its claims. Verification of a venue never changes.
-- * Contact phone and e-mail (at least one) are for administrators only; exported and purged.
-- * RLS on, no API grants on the three tables: every read and write is an RPC.

insert into public.app_config (key, value) values
  ('quota.max_owned_businesses', '3'::jsonb),
  ('quota.max_business_venues_per_request', '10'::jsonb)
on conflict (key) do nothing;

create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 80),
  city_id       uuid not null references public.cities (id),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{10,13}$'),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 200 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message       text check (message is null or char_length(message) between 1 and 500),
  status        text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'DISSOLVED')),
  created_by    uuid not null references public.profiles (id),
  decided_by    uuid references public.profiles (id),
  decided_at    timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 1 and 500),
  created_at    timestamptz not null default pg_catalog.now(),
  constraint businesses_rejected check ((status = 'REJECTED') = (reject_reason is not null))
);
create index businesses_pending_idx on public.businesses (created_at) where status = 'PENDING';
create index businesses_creator_idx on public.businesses (created_by);
comment on table public.businesses is 'Operators of commercial venues (ADR-0031). Written and read only through RPCs.';

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  role        text not null check (role in ('OWNER', 'STAFF')),
  created_at  timestamptz not null default pg_catalog.now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.business_venues (
  business_id uuid not null references public.businesses (id) on delete cascade,
  venue_id    uuid not null unique references public.venues (id),
  created_at  timestamptz not null default pg_catalog.now(),
  primary key (business_id, venue_id)
);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_venues enable row level security;
revoke all on public.businesses, public.business_members, public.business_venues from anon, authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'JOIN_REQUESTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED', 'PARTICIPANT_CANCELED', 'SPOT_OPENED',
  'EVENT_CANCELED', 'EVENT_CHANGED', 'ATTENDANCE_FINALIZED',
  'REPORT_OUTCOME', 'ACCOUNT_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'ATTENDANCE_REMINDER',
  'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED',
  'ORGANIZATION_INVITED', 'ORGANIZATION_JOIN_REQUESTED', 'ORGANIZATION_MEMBER_APPROVED',
  'BUSINESS_APPROVED', 'BUSINESS_REJECTED'));

alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'FEEDBACK_UPDATED', 'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED', 'ORGANIZATION_HIDDEN', 'ORGANIZATION_RESTORED',
  'BUSINESS_APPROVED', 'BUSINESS_REJECTED'));

-- A business name: trimmed, 2-80 characters, no links, e-mail addresses or phone numbers (as display names).
create function private.clean_business_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := pg_catalog.btrim(p_name);
begin
  if v is null or pg_catalog.char_length(v) not between 2 and 80 or v ~ '[[:cntrl:]]'
     or v ~* '(https?:|www\.|@|\.(com|net|org|ru|xyz|io|me|info|tr)\M)'
     or pg_catalog.regexp_replace(v, '[ ().-]', '', 'g') ~ '[0-9]{7,}' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- One business as its requester sees it (with the claimed venues). Contact details stay out: they are for administrators.
create function private.business_json(b public.businesses, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', b.id, 'name', b.name, 'city_id', b.city_id, 'status', b.status, 'role', p_role,
    'reject_reason', b.reject_reason, 'created_at', b.created_at, 'decided_at', b.decided_at,
    'venues', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id, 'name', v.name) order by v.name, v.id)
        from public.business_venues bv join public.venues v on v.id = bv.venue_id
       where bv.business_id = b.id), '[]'::jsonb));
$$;

-- Returns the new business's id.
create function public.request_business(p_name text, p_city_id uuid, p_contact_phone text, p_contact_email text,
                                        p_message text, p_venue_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  v_name    text := private.clean_business_name(p_name);
  v_phone   text := nullif(pg_catalog.regexp_replace(coalesce(p_contact_phone, ''), '[ ()-]', '', 'g'), '');
  v_email   text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_contact_email, ''))), '');
  v_message text := nullif(pg_catalog.btrim(p_message), '');
  v_venues  uuid[];
  v_id      uuid;
begin
  select coalesce(pg_catalog.array_agg(distinct x), '{}') into v_venues from pg_catalog.unnest(p_venue_ids) x where x is not null;
  if p_city_id is null or not exists (select 1 from public.cities c where c.id = p_city_id)
     or (v_phone is null and v_email is null)
     or (v_phone is not null and v_phone !~ '^\+?[0-9]{10,13}$')
     or (v_email is not null and (pg_catalog.char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
     or pg_catalog.char_length(coalesce(v_message, '')) > 500
     or pg_catalog.cardinality(v_venues) > private.config_int('quota.max_business_venues_per_request', 10)
     or exists (select 1 from pg_catalog.unnest(v_venues) x
                 where not exists (select 1 from public.venues v
                                    where v.id = x and v.listing_status = 'ACTIVE' and v.kind = 'COMMERCIAL_FACILITY')) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  -- The count reads what other calls just wrote: one requester at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.business_members m join public.businesses b on b.id = m.business_id
       where m.user_id = v_uid and m.role = 'OWNER' and b.status in ('PENDING', 'ACTIVE'))
     >= private.config_int('quota.max_owned_businesses', 3) then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.business_venues bv where bv.venue_id = any (v_venues)) then
    raise exception 'VENUE_CLAIMED' using errcode = 'P0001';  -- a venue already has (or waits for) a business
  end if;
  insert into public.businesses (name, city_id, contact_phone, contact_email, message, created_by)
  values (v_name, p_city_id, v_phone, v_email, v_message, v_uid)
  returning id into v_id;
  insert into public.business_members (business_id, user_id, role) values (v_id, v_uid, 'OWNER');
  insert into public.business_venues (business_id, venue_id) select v_id, x from pg_catalog.unnest(v_venues) x;
  return v_id;
end;
$$;

create function public.cancel_business_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
begin
  delete from public.businesses b where b.id = p_id and b.status = 'PENDING' and b.created_by = v_uid;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- The caller's businesses and requests, newest first (dissolved ones left out).
create function public.list_my_businesses()
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
      select pg_catalog.jsonb_agg(private.business_json(b, m.role) order by b.created_at desc, b.id)
        from public.business_members m join public.businesses b on b.id = m.business_id
       where m.user_id = v_uid and b.status <> 'DISSOLVED'), '[]'::jsonb),
    'max_owned', private.config_int('quota.max_owned_businesses', 3));
end;
$$;

-- The console: requests by status (waiting: oldest first), with the contact details and what helps judge the requester.
create function public.admin_list_business_requests(p_status text default 'PENDING')
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
                 order by case when p_status = 'PENDING' then b.created_at end,
                          case when p_status <> 'PENDING' then b.decided_at end desc, b.id) as ord,
               private.business_json(b, 'OWNER') || pg_catalog.jsonb_build_object(
                 'contact_phone', b.contact_phone, 'contact_email', b.contact_email, 'message', b.message,
                 'requester_id', p.id, 'requester_name', p.display_name, 'requester_since', p.created_at,
                 'requester_open_reports', (select pg_catalog.count(*) from public.reports rp
                                             where rp.target_type = 'USER' and rp.target_id = p.id and rp.status = 'OPEN')) as item
          from public.businesses b join public.profiles p on p.id = b.created_by
         where b.status = p_status
         limit 200
      ) r), '[]'::jsonb);
end;
$$;

create function public.admin_decide_business(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  b        public.businesses;
begin
  if p_id is null or p_approve is null or (not p_approve and v_reason is null)
     or pg_catalog.char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into b from public.businesses x where x.id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if b.status <> 'PENDING' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.businesses
     set status = case when p_approve then 'ACTIVE' else 'REJECTED' end,
         decided_by = v_uid, decided_at = pg_catalog.now(),
         reject_reason = case when p_approve then null else v_reason end
   where id = p_id;
  if not p_approve then
    delete from public.business_venues where business_id = p_id;  -- the claims are released
  end if;
  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, case when p_approve then 'BUSINESS_APPROVED' else 'BUSINESS_REJECTED' end, p_id);
  perform private.notify(b.created_by, case when p_approve then 'BUSINESS_APPROVED' else 'BUSINESS_REJECTED' end,
                         pg_catalog.jsonb_build_object('business_id', p_id), 'BUSINESS_DECIDED:' || p_id);
end;
$$;

-- ---- account export and purge (ADR-0017) ------------------------------------------------------------------------
create function private.export_business_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('businesses', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'name', b.name, 'status', b.status, 'role', m.role, 'requested_by_me', b.created_by = p_uid,
             'contact_phone', case when b.created_by = p_uid then b.contact_phone end,
             'contact_email', case when b.created_by = p_uid then b.contact_email end,
             'message', case when b.created_by = p_uid then b.message end,
             'reject_reason', b.reject_reason, 'joined_at', m.created_at)
           order by m.created_at, b.id)
      from public.business_members m join public.businesses b on b.id = m.business_id
     where m.user_id = p_uid), '[]'::jsonb));
$$;

-- Same as 20261118100000, plus the businesses.
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
    || private.export_business_data(v_uid)
    into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

-- Same as 20261118100000, plus the businesses.
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
  -- Businesses (ADR-0031): waiting requests go with their claims; an active business the person owned alone is
  -- dissolved and its venues released; their contact details go either way.
  delete from public.businesses where created_by = p_uid and status = 'PENDING';  -- members and claims cascade
  update public.businesses b set status = 'DISSOLVED', contact_phone = null, contact_email = null, message = null
   where b.status = 'ACTIVE'
     and exists (select 1 from public.business_members m where m.business_id = b.id and m.user_id = p_uid and m.role = 'OWNER')
     and not exists (select 1 from public.business_members m where m.business_id = b.id and m.user_id <> p_uid and m.role = 'OWNER');
  delete from public.business_venues v using public.businesses b where b.id = v.business_id and b.status = 'DISSOLVED';
  update public.businesses set contact_phone = null, contact_email = null, message = null where created_by = p_uid;
  delete from public.business_members where user_id = p_uid;
  update public.businesses set decided_by = null where decided_by = p_uid;
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

revoke all on function public.request_business(text, uuid, text, text, text, uuid[]), public.cancel_business_request(uuid),
  public.list_my_businesses(), public.admin_list_business_requests(text), public.admin_decide_business(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.request_business(text, uuid, text, text, text, uuid[]), public.cancel_business_request(uuid),
  public.list_my_businesses(), public.admin_list_business_requests(text), public.admin_decide_business(uuid, boolean, text)
  to authenticated;
revoke all on function private.clean_business_name(text), private.business_json(public.businesses, text),
  private.export_business_data(uuid) from public, anon, authenticated;
