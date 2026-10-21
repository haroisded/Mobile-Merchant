-- Revert of the feature-preferences migration (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS EVERY PERSON'S HIDDEN SCREENS AND PAGES: the table goes with its rows, and every store shows everything
-- again. Regenerate src/lib/database.types.ts afterwards (feature_preferences goes), and the app's Features page
-- stops saving.

drop table if exists public.feature_preferences;
