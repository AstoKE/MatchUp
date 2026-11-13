-- ROADMAP P-23: one read-only snapshot of the administrator's waiting work.
create index attendance_disputes_open_idx on public.attendance_disputes (created_at) where status = 'OPEN';
create index moderation_actions_created_idx on public.moderation_actions (created_at desc, id desc);

create function public.admin_dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin_aal2();
  return pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'reports', (select pg_catalog.jsonb_build_object(
      'count', pg_catalog.count(*), 'oldest_at', pg_catalog.min(r.created_at),
      'by_type', pg_catalog.jsonb_build_object(
        'USER', pg_catalog.count(*) filter (where r.target_type = 'USER'),
        'EVENT', pg_catalog.count(*) filter (where r.target_type = 'EVENT'),
        'VENUE', pg_catalog.count(*) filter (where r.target_type = 'VENUE'),
        'ORGANIZATION', pg_catalog.count(*) filter (where r.target_type = 'ORGANIZATION')))
      from public.reports r where r.status = 'OPEN'),
    'organization_requests', (select pg_catalog.jsonb_build_object(
      'count', pg_catalog.count(*), 'oldest_at', pg_catalog.min(o.created_at))
      from public.organizations o where o.status = 'PENDING'),
    'business_requests', (select pg_catalog.jsonb_build_object(
      'count', pg_catalog.count(*), 'oldest_at', pg_catalog.min(b.created_at))
      from public.businesses b where b.status = 'PENDING'),
    'feedback', (select pg_catalog.jsonb_build_object(
      'count', pg_catalog.count(*), 'oldest_at', pg_catalog.min(f.created_at))
      from public.feedback f where f.status = 'NEW'),
    'disputes', (select pg_catalog.jsonb_build_object(
      'count', pg_catalog.count(*), 'oldest_at', pg_catalog.min(d.created_at))
      from public.attendance_disputes d where d.status = 'OPEN'),
    'flags', pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(public.admin_list_flags())),
    'recent_actions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'action', a.action, 'target_type', a.target_type, 'note', a.note, 'created_at', a.created_at)
      order by a.created_at desc, a.id desc)
      from (select m.id, m.action, m.target_type, m.note, m.created_at
        from public.moderation_actions m order by m.created_at desc, m.id desc limit 10) a), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
