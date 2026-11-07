-- Phase 8 / M3: avatars and profile photos (ADR-0027). The Storage API itself is exercised in db-tests/avatars.test.ts;
-- this file checks the schema, the grants and the policy functions directly.
begin;
select plan(26);

create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000029' || lpad(n::text, 2, '0'))::uuid;
$$;
create function pg_temp.photo(n int, k int default 1) returns text language sql as $$
  select pg_temp.u(n)::text || '/00000000-0000-4000-8000-0000000000' || lpad(k::text, 2, '0') || '.jpg';
$$;

-- 01 owner (private profile) · 02 stranger · 03 admin · 04 blocked by 01 · 05 not onboarded
insert into auth.users (id, email, email_confirmed_at, aud, role, created_at, updated_at)
select pg_temp.u(n), 'u29-' || n || '@test.invalid', now(), 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 5) n;
update public.profiles set display_name = 'Kişi ' || right(id::text, 2), adult_confirmed_at = now(), onboarded_at = now()
 where id::text like '00000000-0000-4000-8000-0000000029%' and id <> pg_temp.u(5);
insert into public.platform_admins (user_id) values (pg_temp.u(3));
insert into public.user_blocks (blocker_id, blocked_id) values (pg_temp.u(1), pg_temp.u(4));
insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', pg_temp.photo(1, 1), pg_temp.u(1)::text),
  ('avatars', pg_temp.photo(1, 2), pg_temp.u(1)::text);
update public.profiles set avatar_path = pg_temp.photo(1, 1) where id = pg_temp.u(1);

-- ---- schema --------------------------------------------------------------------------------------------------------------
select has_column('public', 'profiles', 'gender', 'profiles has a gender');
select has_column('public', 'profiles', 'avatar_key', 'profiles has an avatar key');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'gender', 'select'),
  'gender is not a readable column');
select ok(has_column_privilege('authenticated', 'public.profiles', 'avatar_key', 'select'),
  'the avatar key is readable like the display name');
select throws_ok($$ update public.profiles set avatar_key = 'x-football' where id = pg_temp.u(1) $$, '23514', null,
  'an unknown drawing is refused by the table');
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars' $$,
  $$ values (false, 1048576::bigint, array['image/jpeg']::text[]) $$, 'a private bucket, 1 MB, JPEG only');
select policies_are('storage', 'objects', array['avatars_insert', 'avatars_select', 'avatars_delete'],
  'insert, select and delete on avatars; no update (never overwritten)');
select ok(not has_table_privilege('authenticated', 'private.avatar_uploads', 'select'), 'the upload log is private');

-- ---- the name rule ----------------------------------------------------------------------------------------------------------
select is(private.avatar_owner(pg_temp.photo(1)), pg_temp.u(1), 'the owner is the folder');
select is(private.avatar_owner(pg_temp.u(1)::text || '/x.png'), null, 'any other name has no owner');
select is(private.avatar_owner('../' || pg_temp.photo(1)), null, 'no path tricks');

-- ---- read -------------------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select ok(private.can_read_avatar(pg_temp.photo(1, 2)), 'the owner reads their whole folder');
reset role;
select pg_temp.act_as(pg_temp.u(2));
select ok(not private.can_read_avatar(pg_temp.photo(1, 1)), 'a stranger does not see a private profile''s photo');
reset role;
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(1);
select pg_temp.act_as(pg_temp.u(2));
select ok(private.can_read_avatar(pg_temp.photo(1, 1)), 'a public profile''s photo is visible to a signed-in stranger');
select ok(not private.can_read_avatar(pg_temp.photo(1, 2)), 'but never a photo the profile does not point at');
reset role;
select pg_temp.act_as(pg_temp.u(4));
select ok(not private.can_read_avatar(pg_temp.photo(1, 1)), 'a blocked person never sees it');
reset role;
update public.user_settings set profile_visibility = 'EVENT_PEERS' where user_id = pg_temp.u(1);
select pg_temp.act_as(pg_temp.u(3), 'aal1');
select ok(not private.can_read_avatar(pg_temp.photo(1, 1)), 'an administrator without a second factor does not');
reset role;
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select ok(private.can_read_avatar(pg_temp.photo(1, 1)), 'an administrator with a second factor does');
reset role;
update public.profiles set account_status = 'SUSPENDED' where id = pg_temp.u(1);
update public.user_settings set profile_visibility = 'EVERYONE' where user_id = pg_temp.u(1);
select pg_temp.act_as(pg_temp.u(2));
select ok(not private.can_read_avatar(pg_temp.photo(1, 1)), 'a suspended person''s photo is not shown');
reset role;
update public.profiles set account_status = 'ACTIVE' where id = pg_temp.u(1);

-- ---- upload and delete ---------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u(1));
select ok(private.can_upload_avatar(pg_temp.photo(1, 3)), 'one more object fits (two of three)');
select ok(not private.can_upload_avatar(pg_temp.photo(2, 1)), 'never into someone else''s folder');
reset role;
select pg_temp.act_as(pg_temp.u(5));
select ok(not private.can_upload_avatar(pg_temp.photo(5, 1)), 'not before onboarding');
reset role;
select pg_temp.act_as(pg_temp.u(2));
select ok(not private.can_delete_avatar(pg_temp.photo(1, 1)), 'a stranger cannot delete');
reset role;
select pg_temp.act_as(pg_temp.u(3), 'aal2');
select ok(private.can_delete_avatar(pg_temp.photo(1, 1)), 'a second-factor administrator can (moderation)');
reset role;

-- ---- RPC grants ----------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.get_my_avatar()', 'execute')
      and not has_function_privilege('anon', 'public.set_my_avatar_photo(text)', 'execute'),
  'guests cannot call the avatar functions');
select pg_temp.act_as(pg_temp.u(2));
select throws_ok($$ select public.admin_remove_avatar_photo(pg_temp.u(1), 'not mine') $$, 'P0001', 'NOT_ALLOWED',
  'only an administrator removes someone''s photo');
reset role;

select * from finish();
rollback;
