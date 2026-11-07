-- Local and CI stacks only (supabase/config.toml [db.seed]; `db push` never seeds the hosted project).
-- The push sender (pg_cron, every minute) must not call the real Expo service from a developer's machine or CI with
-- test tokens. Tests switch it on inside their own transaction (packages/db-tests/src/push.test.ts).
update public.app_config set value = 'false'::jsonb where key = 'push.enabled';
