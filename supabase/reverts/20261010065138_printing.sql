-- Revert of supabase/migrations/20261010065138_printing.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's print formats, letter heads and Print Settings, and their rules in
-- role_permissions. Regenerate src/lib/database.types.ts afterwards — the Print Formats, Letter Heads and
-- Print Settings screens read these tables.

drop trigger if exists merchants_seed_96_printing on public.merchants;
drop function if exists private.seed_printing();
drop function if exists private.seed_printing_for(uuid);

-- Policies, indexes and triggers go with the tables.
drop table if exists public.print_settings;
drop table if exists public.print_formats;
drop table if exists public.letter_heads;
drop function if exists private.single_default();

-- Cascades to the standard_role_permissions and role_permissions rows naming them.
delete from public.doctypes where name in ('Print Format', 'Letter Head', 'Print Settings');
