-- Revert of supabase/migrations/20261011233916_pos_profiles.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's POS Profiles with their users, payment methods and item groups, and their
-- rules in role_permissions. Regenerate src/lib/database.types.ts afterwards — the POS Profiles screens read
-- these tables.

drop function if exists public.save_pos_profile(jsonb);

-- Policies and triggers go with their tables. Fails while a newer migration's table still names a profile
-- (the POS entries and invoices): revert that one first.
drop table if exists public.pos_profile_item_groups;
drop table if exists public.pos_profile_payments;
drop table if exists public.pos_profile_users;
drop table if exists public.pos_profiles;

drop function if exists private.validate_pos_profile_payments();
drop function if exists private.validate_pos_profile();

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'POS Profile';
