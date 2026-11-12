-- Phase 9 / M3: events as the organization (ADR-0030, docs/PHASE9_PLAN.md).
--
-- * events.organization_id (DATABASE §4 design seam). event_type stays COMMUNITY: no commercial tier (founder).
-- * The organizer links their own event to an organization they run (owner or administrator, active), or unlinks it,
--   while the event is a draft or published. A separate call, so create_event and update_event stay as they are.
-- * Shown only while the organization is active: a dissolved organization's events simply lose the link on screen.
-- * The organization page lists its upcoming public published events.

alter table public.events add column organization_id uuid references public.organizations (id);
create index events_organization_idx on public.events (organization_id, starts_at) where organization_id is not null;

-- Without an organization (or null), the event is unlinked.
create function public.set_event_organization(p_event_id uuid, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_onboarded_user();
  e     public.events;
begin
  select * into e from public.events x where x.id = p_event_id for update;
  if not found or e.organizer_id <> v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status not in ('DRAFT', 'PUBLISHED') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_org is not null and (
       not exists (select 1 from public.organizations o where o.id = p_org and o.status = 'ACTIVE')
       or private.organization_role(p_org, v_uid) is distinct from 'OWNER'
          and private.organization_role(p_org, v_uid) is distinct from 'ADMIN') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.events set organization_id = p_org where id = p_event_id;
end;
$$;

-- The organization an event is shown under: for anyone who can see the event (public and published, or involved).
create function public.get_event_organization(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', o.id, 'name', o.name)
    from public.events e
    join public.organizations o on o.id = e.organization_id and o.status = 'ACTIVE'
   where e.id = p_event_id
     and ((e.visibility = 'PUBLIC' and e.status in ('PUBLISHED', 'COMPLETED'))
          or e.organizer_id = (select auth.uid())
          or exists (select 1 from public.event_participations p where p.event_id = e.id and p.user_id = (select auth.uid())));
$$;

-- An active organization's upcoming public events, soonest first, at most 50.
create function public.list_organization_events(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org and o.status = 'ACTIVE') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(r.item order by r.starts_at, r.id)
      from (
        select e.id, e.starts_at, pg_catalog.jsonb_build_object(
                 'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'sport_id', e.sport_id,
                 'district_id', e.district_id, 'approved_count', e.approved_count, 'capacity', e.capacity) as item
          from public.events e
         where e.organization_id = p_org and e.status = 'PUBLISHED' and e.visibility = 'PUBLIC'
           and e.starts_at > pg_catalog.now()
           and not private.is_blocked_pair((select auth.uid()), e.organizer_id)
         order by e.starts_at, e.id
         limit 50
      ) r), '[]'::jsonb);
end;
$$;

revoke all on function public.set_event_organization(uuid, uuid), public.get_event_organization(uuid),
  public.list_organization_events(uuid) from public, anon, authenticated;
grant execute on function public.set_event_organization(uuid, uuid), public.get_event_organization(uuid),
  public.list_organization_events(uuid) to authenticated;
