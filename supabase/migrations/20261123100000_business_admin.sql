-- Phase 10 / M2: administrators add businesses; hide and restore; businesses shown with their venues (ADR-0031).
--
-- * admin_create_business (P-19): an administrator with the second factor creates an ACTIVE business for an onboarded
--   person (its owner) with its venues, audited; the owner is told.
-- * HIDDEN: an administrator hides a business (note required, moderation action) and can restore it. A hidden business
--   is not shown with its venues and cannot be requested again for those venues until released.
-- * get_venue_business: the active business that runs a venue, for anyone signed in (venues are a public directory).

alter table public.businesses drop constraint businesses_status_check;
alter table public.businesses add constraint businesses_status_check
  check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'DISSOLVED', 'HIDDEN'));

alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
  check (target_type in ('USER', 'EVENT', 'REVIEW', 'VENUE', 'ORGANIZATION', 'BUSINESS'));
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
  'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'ORGANIZATION_HIDDEN', 'ORGANIZATION_RESTORED', 'BUSINESS_HIDDEN', 'BUSINESS_RESTORED'));

alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'FEEDBACK_UPDATED', 'ORGANIZATION_APPROVED', 'ORGANIZATION_REJECTED', 'ORGANIZATION_HIDDEN', 'ORGANIZATION_RESTORED',
  'BUSINESS_APPROVED', 'BUSINESS_REJECTED', 'BUSINESS_ADDED', 'BUSINESS_HIDDEN', 'BUSINESS_RESTORED'));

-- Returns the new business's id.
create function public.admin_create_business(p_name text, p_city_id uuid, p_owner uuid, p_venue_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.assert_admin_aal2();
  v_name   text := private.clean_business_name(p_name);
  v_venues uuid[];
  v_id     uuid;
begin
  select coalesce(pg_catalog.array_agg(distinct x), '{}') into v_venues from pg_catalog.unnest(p_venue_ids) x where x is not null;
  if p_city_id is null or not exists (select 1 from public.cities c where c.id = p_city_id)
     or pg_catalog.cardinality(v_venues) > private.config_int('quota.max_business_venues_per_request', 10)
     or exists (select 1 from pg_catalog.unnest(v_venues) x
                 where not exists (select 1 from public.venues v
                                    where v.id = x and v.listing_status = 'ACTIVE' and v.kind = 'COMMERCIAL_FACILITY')) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  if p_owner is null or not exists (select 1 from public.profiles p
                                     where p.id = p_owner and p.account_status = 'ACTIVE' and p.onboarded_at is not null) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.business_venues bv where bv.venue_id = any (v_venues)) then
    raise exception 'VENUE_CLAIMED' using errcode = 'P0001';
  end if;
  insert into public.businesses (name, city_id, status, created_by, decided_by, decided_at)
  values (v_name, p_city_id, 'ACTIVE', p_owner, v_uid, pg_catalog.now())
  returning id into v_id;
  insert into public.business_members (business_id, user_id, role) values (v_id, p_owner, 'OWNER');
  insert into public.business_venues (business_id, venue_id) select v_id, x from pg_catalog.unnest(v_venues) x;
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'BUSINESS_ADDED', v_id, pg_catalog.jsonb_build_object('owner', p_owner));
  perform private.notify(p_owner, 'BUSINESS_APPROVED', pg_catalog.jsonb_build_object('business_id', v_id),
                         'BUSINESS_DECIDED:' || v_id);
  return v_id;
end;
$$;

-- Hide (note required) or restore. Recorded as a moderation action.
create function public.admin_set_business_hidden(p_id uuid, p_hidden boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_admin_aal2();
  v_note text := private.admin_note(p_note, true);
  b      public.businesses;
begin
  if p_hidden is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  select * into b from public.businesses x where x.id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if (p_hidden and b.status <> 'ACTIVE') or (not p_hidden and b.status <> 'HIDDEN') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.businesses set status = case when p_hidden then 'HIDDEN' else 'ACTIVE' end where id = p_id;
  perform private.record_moderation(v_uid, case when p_hidden then 'BUSINESS_HIDDEN' else 'BUSINESS_RESTORED' end,
                                    'BUSINESS', p_id, null, null, v_note);
end;
$$;

-- The active business that runs a venue (null when none).
create function public.get_venue_business(p_venue_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', b.id, 'name', b.name)
    from public.business_venues bv
    join public.businesses b on b.id = bv.business_id and b.status = 'ACTIVE'
   where bv.venue_id = p_venue_id and (select auth.uid()) is not null;
$$;

-- Same as 20261122100000, and the console lists hidden businesses too.
create or replace function public.admin_list_business_requests(p_status text default 'PENDING')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  if p_status is null or p_status not in ('PENDING', 'ACTIVE', 'REJECTED', 'HIDDEN') then
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

revoke all on function public.admin_create_business(text, uuid, uuid, uuid[]),
  public.admin_set_business_hidden(uuid, boolean, text), public.get_venue_business(uuid) from public, anon, authenticated;
grant execute on function public.admin_create_business(text, uuid, uuid, uuid[]),
  public.admin_set_business_hidden(uuid, boolean, text), public.get_venue_business(uuid) to authenticated;
