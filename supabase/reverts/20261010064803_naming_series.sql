-- Revert of supabase/migrations/20261010064803_naming_series.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's naming series and the counters behind them — the next document under a
-- series would start from 1 again — and their rules in role_permissions. Regenerate
-- src/lib/database.types.ts afterwards — Document Naming Settings reads these tables and both functions.

drop trigger if exists merchants_seed_94_naming on public.merchants;
drop function if exists private.seed_naming();
drop function if exists private.seed_naming_for(uuid);

drop function if exists public.update_series_counter(uuid, text, bigint);
drop function if exists public.naming_series_preview(uuid);
drop function if exists private.make_name(uuid, text, date);
drop function if exists private.series_prefix(uuid, text, date);

-- Policies, the check constraint and the trigger go with the tables.
drop table if exists public.naming_series_counters;
drop table if exists public.naming_series;
drop function if exists private.naming_series_unique();
drop function if exists private.are_naming_series(text[]);
drop function if exists private.is_naming_series(text);

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'Document Naming Settings';
