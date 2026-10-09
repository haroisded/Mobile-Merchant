-- Revert of supabase/migrations/20261009004357_accounting_defaults.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Accounts Settings, and the Company's accounting defaults and Perpetual
-- Inventory switch. Regenerate src/lib/database.types.ts afterwards — the Company and Accounts Settings
-- screens read them.

drop trigger if exists merchants_seed_50_accounting_defaults on public.merchants;
drop function if exists private.seed_accounting_defaults();
drop function if exists private.seed_accounting_defaults_for(uuid);

-- Its policies go with the table; its role permissions with its doctype (on delete cascade).
drop table if exists public.accounts_settings;
delete from public.doctypes where name = 'Accounts Settings';

-- The All role's select on Role, added for the frozen-accounts role picker.
delete from public.role_permissions rp using public.roles r
where r.id = rp.role_id and r.role_name = 'All' and rp.doctype = 'Role';
delete from public.standard_role_permissions where role_name = 'All' and doctype = 'Role';

drop trigger if exists merchants_validate_accounts on public.merchants;
drop function if exists private.validate_company_accounts();

alter table public.merchants
  drop constraint if exists merchants_default_cash_account_fk,
  drop constraint if exists merchants_default_bank_account_fk,
  drop constraint if exists merchants_default_income_account_fk,
  drop constraint if exists merchants_default_expense_account_fk,
  drop constraint if exists merchants_cost_center_fk,
  drop constraint if exists merchants_write_off_account_fk,
  drop constraint if exists merchants_round_off_account_fk,
  drop constraint if exists merchants_round_off_cost_center_fk,
  drop constraint if exists merchants_default_inventory_account_fk,
  drop constraint if exists merchants_stock_adjustment_account_fk,
  drop constraint if exists merchants_stock_received_but_not_billed_fk,
  drop constraint if exists merchants_expenses_included_in_valuation_fk;

alter table public.merchants
  drop column if exists default_cash_account,
  drop column if exists default_bank_account,
  drop column if exists default_income_account,
  drop column if exists default_expense_account,
  drop column if exists cost_center,
  drop column if exists write_off_account,
  drop column if exists round_off_account,
  drop column if exists round_off_cost_center,
  drop column if exists enable_perpetual_inventory,
  drop column if exists default_inventory_account,
  drop column if exists stock_adjustment_account,
  drop column if exists stock_received_but_not_billed,
  drop column if exists expenses_included_in_valuation;
