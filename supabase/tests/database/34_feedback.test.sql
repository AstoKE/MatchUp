-- ROADMAP P-22: requests, suggestions and complaints about the app. Who writes, who reads, limits, export and purge.
begin;
select plan(22);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000034' || lpad(n::text, 2, '0'))::uuid;
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1; $$;

-- 01 writer · 02 administrator · 03 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u34-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 3) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), created_at = now() - interval '30 days', onboarded_at = now()
 where id in (pg_temp.u(1), pg_temp.u(2));
insert into public.user_consents (user_id, kind, version)
select p.id, k.kind::public.consent_kind, (select c.value #>> '{}' from public.app_config c where c.key = k.key)
  from public.profiles p
 cross join (values ('TERMS', 'legal.terms_version'), ('PRIVACY_NOTICE', 'legal.privacy_version')) k(kind, key)
 where p.id in (pg_temp.u(1), pg_temp.u(2));
insert into public.platform_admins (user_id) values (pg_temp.u(2));

select ok((select relrowsecurity from pg_class where oid = 'public.feedback'::regclass), 'RLS is on');
select table_privs_are('public', 'feedback', 'authenticated', array[]::text[], 'nobody reads or writes it through the API');
select table_privs_are('public', 'feedback', 'anon', array[]::text[], 'nor do guests');
select ok(not has_function_privilege('anon', 'public.submit_feedback(text, text, text)', 'execute'), 'guests cannot send any');

select pg_temp.act_as(pg_temp.u(1));
insert into ids values ('f1', public.submit_feedback('SUGGESTION', '  Takvime ekle düğmesi olsa iyi olur.  ', 'settings'));
reset role;
select is((select body from public.feedback where id = pg_temp.id('f1')), 'Takvime ekle düğmesi olsa iyi olur.', 'saved, trimmed');
select is((select status from public.feedback where id = pg_temp.id('f1')), 'NEW', 'it starts as new');

select pg_temp.act_as(pg_temp.u(1));
select throws_ok($$select public.submit_feedback('PRAISE', 'Bu uygulama harika olmuş.')$$, 'P0001', 'VALIDATION_FAILED', 'only the three kinds');
select throws_ok($$select public.submit_feedback('REQUEST', 'kısa')$$, 'P0001', 'VALIDATION_FAILED', 'at least 10 characters');
select throws_ok($$select public.submit_feedback('REQUEST', repeat('a', 2001))$$, 'P0001', 'VALIDATION_FAILED', 'at most 2000');
select throws_ok($$select public.submit_feedback('REQUEST', 'Geçerli bir metin burada.', 'https://x.example/e/1')$$, 'P0001', 'VALIDATION_FAILED',
  'the context is a screen name, never a URL');
select public.submit_feedback('REQUEST', 'İstek numarası ' || n || ' burada.') from generate_series(2, 5) n;
select throws_ok($$select public.submit_feedback('REQUEST', 'Altıncı istek bugün.')$$, 'P0001', 'RATE_LIMITED', 'at most five a day');
select throws_ok($$select public.admin_list_feedback()$$, 'P0001', 'NOT_ALLOWED', 'a player cannot list it');

select pg_temp.act_as(pg_temp.u(3));
select throws_ok($$select public.submit_feedback('COMPLAINT', 'Henüz kaydı bitmemiş biri.')$$, 'P0001', null,
  'an account that has not finished onboarding cannot send any');

select pg_temp.act_as(pg_temp.u(2), 'aal1');
select throws_ok($$select public.admin_list_feedback()$$, 'P0001', 'MFA_REQUIRED', 'an administrator needs the second factor');
select pg_temp.act_as(pg_temp.u(2), 'aal2');
select is((select count(*) from jsonb_array_elements(public.admin_list_feedback()) i
            where (i ->> 'user_id')::uuid = pg_temp.u(1))::int, 5, 'the administrator sees what is not done');
select public.admin_set_feedback_status(pg_temp.id('f1'), 'DONE');
select is((select count(*) from jsonb_array_elements(public.admin_list_feedback()) i
            where (i ->> 'user_id')::uuid = pg_temp.u(1))::int, 4, 'done leaves the default list');
select is((select count(*) from jsonb_array_elements(public.admin_list_feedback('DONE')) i where (i ->> 'id')::uuid = pg_temp.id('f1'))::int, 1,
  'and is under "done"');
select throws_ok($$select public.admin_set_feedback_status(gen_random_uuid(), 'SEEN')$$, 'P0001', 'NOT_FOUND', 'an unknown id');
reset role;
select ok(exists (select 1 from private.audit_logs a where a.action = 'FEEDBACK_UPDATED' and a.target_id = pg_temp.id('f1')
                  and a.metadata::text !~ 'Takvim'),
  'the change is audited, without the text');

-- Export and purge.
select ok(private.export_feedback_data(pg_temp.u(1)) -> 'feedback' @> '[{"kind": "SUGGESTION", "status": "DONE"}]'::jsonb,
  'the writer''s export has it');
update public.profiles set account_status = 'PENDING_DELETION', deletion_requested_at = now() - interval '31 days' where id = pg_temp.u(1);
select is(private.purge_account(pg_temp.u(1)), true, 'the account is purged');
select is((select count(*)::int from public.feedback where user_id = pg_temp.u(1)), 0, 'and its feedback with it');

select * from finish();
rollback;
