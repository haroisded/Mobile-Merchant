-- Revert of supabase/migrations/20261010011005_tax_rules.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Tax Rules and their rules in role_permissions. Regenerate
-- src/lib/database.types.ts afterwards — the Tax Rules screen reads this table.

-- Policies and constraints go with the table.
drop table if exists public.tax_rules;

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'Tax Rule';
