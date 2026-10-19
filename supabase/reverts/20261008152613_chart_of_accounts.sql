-- Revert of supabase/migrations/20261008152613_chart_of_accounts.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Chart of Accounts and Cost Centers, and the Account and Cost Center
-- rules in role_permissions and user_permissions. Regenerate src/lib/database.types.ts afterwards — the
-- Accounting screens read these tables.

drop trigger if exists merchants_seed_40_accounting on public.merchants;
drop function if exists private.seed_accounting();
drop function if exists private.seed_chart_for(uuid);
drop function if exists private.seed_account(uuid, text, uuid, boolean, text, text);

drop table if exists public.cost_centers;
drop table if exists public.accounts;
drop function if exists private.validate_tree();

-- Cascades to the standard_role_permissions, role_permissions and user_permissions rows naming them.
delete from public.doctypes where name in ('Account', 'Cost Center');
