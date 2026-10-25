-- Hosted Supabase projects ship their own `public.rls_auto_enable()` (the function behind the `ensure_rls`
-- event trigger that turns on RLS for new public tables). It is SECURITY DEFINER and granted to PUBLIC,
-- anon and authenticated, which the Supabase security advisor flags and which breaks our rule that
-- guests can execute no function (SECURITY §4). Event-trigger functions cannot be called directly, so
-- revoking EXECUTE changes nothing about the trigger; it only closes the grant.
-- The function does not exist on the local CLI stack, so this is a no-op there.
do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
