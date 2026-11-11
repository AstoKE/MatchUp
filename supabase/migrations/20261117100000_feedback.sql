-- ROADMAP P-22 (founder, 2026-11-10): an in-app place for requests, suggestions and complaints about the app.
--
-- * Different from reports (F-27): a report is about a person or an event and goes to moderation; feedback is about the
--   app and goes to the team. A complaint about a person still belongs in a report, and the form says so.
-- * Written only through submit_feedback (an onboarded account, 5 a day); nobody reads it through the API, not even the
--   writer. Administrators with a second factor list it and mark it seen or done; each change is in the audit trail
--   (without the text).
-- * The text is personal data: it is in the account export and deleted with the account. Never logged.

insert into public.app_config (key, value) values ('quota.max_feedback_per_day', '5'::jsonb)
on conflict (key) do nothing;

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id),
  kind       text not null check (kind in ('REQUEST', 'SUGGESTION', 'COMPLAINT')),
  body       text not null check (char_length(body) between 10 and 2000),
  -- Where it was sent from (a screen name chosen by the app, never a URL with ids or free text).
  context    text check (context is null or context ~ '^[a-z][a-z0-9-]{0,39}$'),
  status     text not null default 'NEW' check (status in ('NEW', 'SEEN', 'DONE')),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint feedback_handled check ((status = 'NEW') = (handled_at is null))
);
create index feedback_status_idx on public.feedback (status, created_at);
create index feedback_user_idx on public.feedback (user_id, created_at);
comment on table public.feedback is 'Requests, suggestions and complaints about the app. Written only through submit_feedback().';

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

alter table private.audit_logs drop constraint audit_logs_action_check;
alter table private.audit_logs add constraint audit_logs_action_check check (action in (
  'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELED', 'ACCOUNT_PURGED', 'ACCOUNT_PURGE_FAILED', 'DATA_EXPORTED',
  'ATTENDANCE_DISPUTE_RESOLVED', 'REPORT_RESOLVED', 'USER_SUSPENDED', 'USER_REINSTATED', 'EVENT_CANCELED_BY_ADMIN',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'VENUE_ADDED', 'VENUE_VERIFIED', 'VENUE_HIDDEN', 'VENUE_RESTORED', 'AVATAR_REMOVED',
  'FEEDBACK_UPDATED'));

-- Returns the new row's id.
create function public.submit_feedback(p_kind text, p_body text, p_context text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.assert_onboarded_user();
  v_body text := pg_catalog.btrim(p_body);
  v_id   uuid;
begin
  if p_kind is null or p_kind not in ('REQUEST', 'SUGGESTION', 'COMPLAINT')
     or v_body is null or char_length(v_body) not between 10 and 2000
     or (p_context is not null and p_context !~ '^[a-z][a-z0-9-]{0,39}$') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  -- The daily count reads what other calls just wrote: one writer at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('feedback:' || v_uid::text, 0));
  if (select pg_catalog.count(*) from public.feedback f
       where f.user_id = v_uid and f.created_at > pg_catalog.now() - interval '24 hours')
     >= private.config_int('quota.max_feedback_per_day', 5) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, kind, body, context)
  values (v_uid, p_kind, v_body, p_context)
  returning id into v_id;
  return v_id;
end;
$$;

-- The console: newest first, filtered by status (null = everything not done), at most 100.
create function public.admin_list_feedback(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  if p_status is not null and p_status not in ('NEW', 'SEEN', 'DONE') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(r.item order by r.created_at desc, r.id)
      from (
        select f.id, f.created_at,
               pg_catalog.jsonb_build_object(
                 'id', f.id, 'kind', f.kind, 'body', f.body, 'context', f.context, 'status', f.status,
                 'user_id', f.user_id, 'user_name', p.display_name,
                 'created_at', f.created_at, 'handled_at', f.handled_at) as item
          from public.feedback f
          join public.profiles p on p.id = f.user_id
         where (p_status is null and f.status <> 'DONE') or f.status = p_status
         order by f.created_at desc, f.id
         limit 100
      ) r), '[]'::jsonb);
end;
$$;

create function public.admin_set_feedback_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_admin_aal2();
begin
  if p_id is null or p_status is null or p_status not in ('NEW', 'SEEN', 'DONE') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.feedback
     set status = p_status,
         handled_by = case when p_status = 'NEW' then null else v_uid end,
         handled_at = case when p_status = 'NEW' then null else pg_catalog.now() end
   where id = p_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into private.audit_logs (actor_id, action, target_id, metadata)
  values (v_uid, 'FEEDBACK_UPDATED', p_id, pg_catalog.jsonb_build_object('status', p_status));
end;
$$;

-- ---- account export and purge (ADR-0017) ------------------------------------------------------------------------
create function private.export_feedback_data(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('feedback', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'kind', f.kind, 'body', f.body, 'context', f.context, 'status', f.status, 'created_at', f.created_at)
           order by f.created_at, f.id)
      from public.feedback f where f.user_id = p_uid), '[]'::jsonb));
$$;

-- Same as 20261114100000, plus the feedback.
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
    || private.export_push_data(v_uid) || private.export_feedback_data(v_uid) into v_result;

  insert into private.audit_logs (actor_id, action, target_id)
  values (v_uid, 'DATA_EXPORTED', v_uid);
  return v_result;
end;
$function$;

-- Same as 20261113100000, plus the feedback (its text is personal data; nothing of it is kept).
CREATE OR REPLACE FUNCTION private.purge_account(p_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status    public.account_status;
  v_requested timestamptz;
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

revoke all on function public.submit_feedback(text, text, text), public.admin_list_feedback(text),
  public.admin_set_feedback_status(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text), public.admin_list_feedback(text),
  public.admin_set_feedback_status(uuid, text) to authenticated;
revoke all on function private.export_feedback_data(uuid) from public, anon, authenticated;
