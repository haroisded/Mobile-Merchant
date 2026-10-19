-- Revert of supabase/migrations/20261008101635_company_and_fiscal_year.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every fiscal year, and every system's abbreviation, country and default currency.
-- Regenerate src/lib/database.types.ts afterwards — Create System and Company still send those fields.

drop trigger if exists merchants_seed_10_company on public.merchants;
drop function if exists private.seed_company();

-- Its trigger and policies go with the table; the trigger's function after it.
drop table if exists public.fiscal_years;
drop function if exists private.fiscal_years_single_default();

alter table public.merchants
  drop constraint if exists merchants_default_currency_fk,
  drop constraint if exists merchants_country_fk,
  drop constraint if exists merchants_abbr_shape,
  drop column if exists default_currency,
  drop column if exists country_code,
  drop column if exists abbr;

drop table if exists public.countries;
drop table if exists public.currency_presets;

-- Created by the migration above, and used by nothing else: the no-overlap constraint went with
-- fiscal_years.
drop extension if exists btree_gist;
