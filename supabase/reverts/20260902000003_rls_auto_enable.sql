-- Reverts 20260902000003_rls_auto_enable.sql.
--
-- Destroys no data. Tables created afterwards stop getting RLS enabled automatically — which every
-- migration already does explicitly anyway (CLAUDE.md §6.1).
--
-- Run the reverts of every newer migration first; supabase/all-in-one/revert.sql already does.

-- Dropping an event trigger needs superuser, the same as creating one. On a hosted project where the
-- forward migration could not install it there is nothing to drop, so warn and continue rather than
-- stopping the rest of the revert.
do $$
begin
  execute 'drop event trigger if exists ensure_rls';
exception
  when insufficient_privilege then
    raise warning 'ensure_rls not dropped: dropping an event trigger needs superuser.';
end;
$$;

-- After the trigger, which depends on this function. If the trigger exists but could not be dropped
-- above, this fails — correctly, since the function is still in use.
drop function if exists private.rls_auto_enable();
