-- Revert of supabase/migrations/20261008151723_defaults_and_money.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's System Settings, Global Defaults and Currency rows. Regenerate
-- src/lib/database.types.ts afterwards — the Defaults & Money screens read these tables.

drop trigger if exists merchants_seed_30_defaults on public.merchants;
drop function if exists private.seed_defaults();
drop function if exists private.seed_defaults_for(uuid);

drop trigger if exists merchants_company_currency on public.merchants;
drop function if exists private.company_currency();
drop function if exists private.ensure_currency(uuid, text);

-- Their policies go with the tables; their role permissions with their doctypes (on delete cascade).
drop table if exists public.currencies;
drop table if exists public.global_defaults;
drop table if exists public.system_settings;
drop function if exists private.validate_time_zone();
drop function if exists private.is_number_format(text);

delete from public.doctypes where name in ('Global Defaults', 'System Settings', 'Currency');
