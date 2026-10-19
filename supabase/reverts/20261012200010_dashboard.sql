-- Revert of supabase/migrations/20261012200010_dashboard.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- Destroys no data: four read-only functions and nothing else. Regenerate src/lib/database.types.ts
-- afterwards — the Dashboard calls all four.

drop function if exists public.top_selling(uuid, date, date, text, boolean, integer);
drop function if exists public.sales_by_day(uuid, date, date);
-- Before stock_alerts, which it counts.
drop function if exists public.dashboard_cards(uuid, date, date);
drop function if exists public.stock_alerts(uuid, integer);
