-- Revert of supabase/migrations/20261009091028_taxes.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Tax Categories, Sales Taxes and Charges Templates and Item Tax Templates, with
-- their rows, and their rules in role_permissions. The tax ledgers the seed added under Duties and Taxes stay
-- in the Chart of Accounts. Regenerate src/lib/database.types.ts afterwards — the tax screens read these
-- tables.

drop trigger if exists merchants_seed_70_taxes on public.merchants;
drop function if exists private.seed_taxes();
drop function if exists private.seed_taxes_for(uuid);
drop table if exists public.tax_presets;

drop function if exists public.save_item_tax_template(jsonb);
drop function if exists public.save_sales_tax_template(jsonb);

-- Policies and triggers go with their tables; role permissions with their doctypes (on delete cascade).
drop table if exists public.item_tax_template_rows;
drop table if exists public.item_tax_templates;
drop table if exists public.sales_tax_template_rows;
drop table if exists public.sales_tax_templates;
drop table if exists public.tax_categories;

drop function if exists private.validate_tax_row_references();
drop function if exists private.validate_tax_account();
drop function if exists private.sales_tax_templates_single_default();

delete from public.doctypes where name in ('Tax Category', 'Sales Taxes and Charges Template', 'Item Tax Template');
