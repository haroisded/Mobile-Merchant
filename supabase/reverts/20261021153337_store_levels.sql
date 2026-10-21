-- Revert of the store-levels migration (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS EVERY STORE'S LEVEL: the column goes, and every store reads as it did before levels (the whole menu, the
-- full New Item form). What a level set up STAYS — a Main Register, items numbered by the Item series, selling past
-- zero stock — as records and settings the owner can change in Setup. Regenerate src/lib/database.types.ts
-- afterwards (merchants.level goes), and the app's Create Store step 2 and Features' level box stop working.

drop trigger if exists merchants_level_changed on public.merchants;
drop function if exists private.level_changed();

drop trigger if exists merchants_guard_level on public.merchants;
drop function if exists private.guard_merchant_level();

drop trigger if exists merchants_seed_98_level on public.merchants;
drop function if exists private.seed_level();

drop function if exists private.apply_level(uuid, smallint);

alter table public.merchants drop constraint if exists merchants_level_range;
alter table public.merchants drop column if exists level;
