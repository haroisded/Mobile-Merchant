-- Revert of supabase/migrations/20261011134250_items.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Items with their UOMs and Item Tax rows, and their rules in role_permissions.
-- Regenerate src/lib/database.types.ts afterwards — the Items screens read these tables.

drop function if exists public.save_item(jsonb);

-- Policies, triggers and indexes go with their tables.
drop table if exists public.item_taxes;
drop table if exists public.item_uoms;
drop table if exists public.items;

drop function if exists private.prepare_item();

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'Item';
