-- Revert of supabase/migrations/20261012204315_import_items.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- Destroys no data: one function and nothing else — the items, prices and opening stock an import already
-- made stay. Regenerate src/lib/database.types.ts afterwards — Import Items calls it.

drop function if exists public.import_items(uuid, jsonb);
