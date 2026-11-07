-- Phase 8 / M4: the push foundation (ADR-0028). The sender itself is exercised in db-tests/push.test.ts.
begin;
select plan(20);

select has_table('public', 'push_devices', 'devices table');
select has_table('public', 'push_outbox', 'outbox table');
select has_table('public', 'push_deliveries', 'deliveries table');
select ok((select bool_and(c.relrowsecurity) from pg_class c
            where c.oid in ('public.push_devices'::regclass, 'public.push_outbox'::regclass,
                            'public.push_deliveries'::regclass)),
  'RLS is on for all three');
select ok(not has_table_privilege('authenticated', 'public.push_devices', 'select')
      and not has_table_privilege('authenticated', 'public.push_outbox', 'select')
      and not has_table_privilege('authenticated', 'public.push_deliveries', 'select')
      and not has_table_privilege('anon', 'public.push_devices', 'select'),
  'no API role reads them');
select has_column('public', 'user_settings', 'push_recommendations_at', 'consent: events for you');
select has_column('public', 'user_settings', 'push_reminders_at', 'consent: reminders');
select has_column('public', 'user_settings', 'push_prompted_at', 'asked once');
select throws_ok($$ insert into public.push_devices (user_id, token, platform)
                    values (gen_random_uuid(), 'not a token', 'ios') $$, '23514', null,
  'a malformed token is refused by the table');
select ok(not has_function_privilege('anon', 'public.register_push_device(text, text)', 'execute')
      and not has_function_privilege('anon', 'public.send_test_push()', 'execute')
      and not has_function_privilege('anon', 'public.set_push_consents(boolean, boolean)', 'execute'),
  'guests cannot call the push functions');
select ok(not has_function_privilege('authenticated', 'private.push_dispatch()', 'execute')
      and not has_function_privilege('authenticated', 'private.push_collect()', 'execute'),
  'nobody but the scheduler runs the sender');
select results_eq($$ select jobname::text from cron.job where jobname like 'push-%' order by jobname $$,
  $$ values ('push-collect'), ('push-dispatch'), ('push-prune'), ('push-recommendations'), ('push-reminders') $$,
  'the sender and the producers run on schedule');
select is(private.push_text('TEST', 'en', '{}') ->> 'title', 'Notifications are on', 'English text for English speakers');
select is(private.push_text('TEST', 'tr', '{}') ->> 'title', 'Bildirimler açık', 'Turkish otherwise');

-- Phase 8 / M5
select is(private.push_text('REMINDER', 'tr', '{"city": {"tr": "Ankara", "en": "Ankara"}, "count": 3}') ->> 'body',
  'Ankara: yaklaşan 3 etkinlik seni bekliyor.', 'a reminder names the province and a count');
select is(private.push_text('REMINDER', 'en', '{"city": {"tr": "Ankara", "en": "Ankara"}, "count": 1}') ->> 'body',
  'Ankara: 1 upcoming event is waiting.', 'singular in English');
select ok(private.push_quiet('2026-11-10 20:30:00+00'::timestamptz), '23:30 in Istanbul is quiet');
select ok(not private.push_quiet('2026-11-10 09:00:00+00'::timestamptz), '12:00 in Istanbul is not');
select ok(not has_table_privilege('authenticated', 'private.push_recommended', 'select'), 'what was recommended is private');
select throws_ok($$ insert into public.push_outbox (user_id, kind) values (gen_random_uuid(), 'SPAM') $$, '23514', null,
  'only known kinds are queued');

select * from finish();
rollback;
