-- Revert of supabase/migrations/20261010011013_stock_settings.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Stock Settings and their rules in role_permissions. Regenerate
-- src/lib/database.types.ts afterwards — the Stock Settings screen reads this table.

drop trigger if exists merchants_seed_92_stock_settings on public.merchants;
drop function if exists private.seed_stock_settings();
drop function if exists private.seed_stock_settings_for(uuid);

-- Policies and triggers go with the table.
drop table if exists public.stock_settings;

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'Stock Settings';
