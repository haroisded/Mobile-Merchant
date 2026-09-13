-- Reverts 20260902000002_profiles.sql — the oldest migration, so its revert runs last.
--
-- DESTROYS DATA: every profile row goes with the table. The accounts in auth.users are NOT deleted —
-- this migration never created them — but new signups stop getting a profile, and the RPC behind the
-- Delete account button stops existing.
--
-- Every newer revert must run first. The final `drop schema` fails while any object is still in
-- `private`, and that failure is the check that they did.

drop trigger if exists on_auth_user_created on auth.users;

-- After the trigger that calls it.
drop function if exists private.handle_new_user();

drop function if exists public.delete_current_user();

-- Its three policies and primary key go with it. The foreign key lives on this side, so auth.users
-- itself is untouched.
drop table if exists public.profiles;

-- No `cascade`: if the rls_auto_enable or merchants revert was skipped, their functions are still in
-- here and this fails instead of dropping them unnamed.
drop schema if exists private;
