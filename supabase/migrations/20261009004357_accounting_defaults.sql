-- Step 4 of the POS foundation, on ERPNext's model: Accounting Defaults & Inventory Accounting
-- (.claude/erpnext-docs/POS-System-Only-Features.md 4.1–4.4; docs.frappe.io/erpnext/company-accounting-defaults,
-- /perpetual-inventory, /accounting-of-inventory-stock, /accounts-settings).
--
-- 1. The Company's accounting defaults, as merchants columns (a system IS its company,
--    .claude/instruction-mds/tenancy.md rule 10): the fallback Cash, Bank, Income and Expense accounts, Cost
--    Center, Write Off and Round Off — used when an item, warehouse, mode of payment or row gives none.
-- 2. Perpetual Inventory, also on the Company: on by default, with the four accounts every stock movement
--    posts to. ERPNext only warns when it is on without a Default Inventory Account, and so does this app.
-- 3. private.validate_company_accounts(): each default is an enabled ledger of the kind its field takes —
--    ERPNext's own filters on the Company form.
-- 4. accounts_settings: a single per system — invoice cancellation, Immutable Ledger, discount accounting, item
--    tax templates, and the frozen-accounts date with the role allowed past it.
-- 5. The doctype, its permissions and policies, and the seed that fills a system's defaults from its chart.
--
-- Out of scope, so absent: receivable and payable (no Customer or Supplier), exchange gain/loss (one
-- currency), fixed-asset, deferred-accounting and budget defaults. Re-runnable, like the rest of
-- supabase/migrations.

create schema if not exists private;


-- 1–2. The Company's defaults. Each account column is held to an account of the same system by a composite
-- foreign key. NO ACTION, not RESTRICT: deleting a system removes its accounts and its row in one statement,
-- and NO ACTION checks only at the statement's end, after the row naming them is gone. Deleting an account a
-- default still names fails with 23503 — the Chart of Accounts says "in use".

alter table public.merchants
  add column if not exists default_cash_account uuid,
  add column if not exists default_bank_account uuid,
  add column if not exists default_income_account uuid,
  add column if not exists default_expense_account uuid,
  add column if not exists cost_center uuid,
  add column if not exists write_off_account uuid,
  add column if not exists round_off_account uuid,
  add column if not exists round_off_cost_center uuid,
  add column if not exists enable_perpetual_inventory boolean not null default true,
  add column if not exists default_inventory_account uuid,
  add column if not exists stock_adjustment_account uuid,
  add column if not exists stock_received_but_not_billed uuid,
  add column if not exists expenses_included_in_valuation uuid;

do $$
declare
  v_col text;
begin
  foreach v_col in array array[
    'default_cash_account', 'default_bank_account', 'default_income_account', 'default_expense_account',
    'write_off_account', 'round_off_account', 'default_inventory_account', 'stock_adjustment_account',
    'stock_received_but_not_billed', 'expenses_included_in_valuation'
  ] loop
    if not exists (select 1 from pg_catalog.pg_constraint where conname = 'merchants_' || v_col || '_fk') then
      execute format(
        'alter table public.merchants add constraint %I foreign key (%I, id) references public.accounts (id, merchant_id)',
        'merchants_' || v_col || '_fk', v_col
      );
    end if;
  end loop;

  foreach v_col in array array['cost_center', 'round_off_cost_center'] loop
    if not exists (select 1 from pg_catalog.pg_constraint where conname = 'merchants_' || v_col || '_fk') then
      execute format(
        'alter table public.merchants add constraint %I foreign key (%I, id) references public.cost_centers (id, merchant_id)',
        'merchants_' || v_col || '_fk', v_col
      );
    end if;
  end loop;
end;
$$;


-- 3. What each default may name: an enabled ledger, of the type (or root type) ERPNext's Company form filters
-- that field to. Security definer, as private.validate_tree is: a User Permission holding the writer to one
-- branch must not hide the account from the check. Only a changed column is checked, so renaming the company
-- never fails over an account disabled since it was picked.
create or replace function private.validate_company_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule record;
  v_new uuid;
  v_old uuid;
  v_ok boolean;
begin
  for v_rule in
    select * from (values
      ('default_cash_account', 'type', 'Cash'),
      ('default_bank_account', 'type', 'Bank'),
      ('default_income_account', 'root', 'Income'),
      ('default_expense_account', 'root', 'Expense'),
      ('write_off_account', 'root', 'Expense'),
      ('round_off_account', 'root', 'Expense'),
      ('default_inventory_account', 'type', 'Stock'),
      ('stock_adjustment_account', 'type', 'Stock Adjustment'),
      ('stock_received_but_not_billed', 'type', 'Stock Received But Not Billed'),
      ('expenses_included_in_valuation', 'type', 'Expenses Included In Valuation'),
      ('cost_center', 'cost_center', null),
      ('round_off_cost_center', 'cost_center', null)
    ) as r (col, kind, want)
  loop
    execute format('select ($1).%I, ($2).%I', v_rule.col, v_rule.col) into v_new, v_old using new, old;
    continue when v_new is null or (tg_op = 'UPDATE' and v_new is not distinct from v_old);

    if v_rule.kind = 'cost_center' then
      select not c.is_group and not c.disabled into v_ok
      from public.cost_centers c where c.id = v_new and c.merchant_id = new.id;
    else
      select not a.is_group and not a.disabled
        and (case v_rule.kind when 'type' then a.account_type = v_rule.want else a.root_type = v_rule.want end)
      into v_ok
      from public.accounts a where a.id = v_new and a.merchant_id = new.id;
    end if;

    if not coalesce(v_ok, false) then
      raise exception 'company_account_invalid' using errcode = '23514',
        detail = format('%s cannot name that record.', v_rule.col);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_company_accounts() from public, anon, authenticated, service_role;

drop trigger if exists merchants_validate_accounts on public.merchants;
create trigger merchants_validate_accounts
  before insert or update of
    default_cash_account, default_bank_account, default_income_account, default_expense_account, cost_center,
    write_off_account, round_off_account, round_off_cost_center, default_inventory_account,
    stock_adjustment_account, stock_received_but_not_billed, expenses_included_in_valuation
  on public.merchants
  for each row execute function private.validate_company_accounts();


-- 4. Accounts Settings.

create table if not exists public.accounts_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- Cancelling an invoice turns the payments made against it into unallocated amounts.
  unlink_payment_on_cancellation boolean not null default true,
  -- Deleting a cancelled document also removes its ledger rows. Off: the audit trail stays.
  delete_linked_ledger_entries boolean not null default false,
  -- Cancelling posts reversal rows instead of rewriting history — the docs' "safer choice".
  enable_immutable_ledger boolean not null default true,
  -- Discounts post to a discount account rather than reducing revenue.
  enable_discount_accounting boolean not null default false,
  -- A missing tax row is added from an item's Item Tax Template.
  add_taxes_from_item_tax_template boolean not null default true,
  -- No accounting entry on or before this date, except by the role below.
  accounts_frozen_till_date date,
  frozen_accounts_modifier uuid,

  -- A role of the same system. Deleting that role clears the field rather than refusing the delete.
  constraint accounts_settings_modifier_fk foreign key (frozen_accounts_modifier, merchant_id)
    references public.roles (id, merchant_id) on delete set null (frozen_accounts_modifier)
);

alter table public.accounts_settings enable row level security;
create index if not exists accounts_settings_modifier_idx on public.accounts_settings (frozen_accounts_modifier, merchant_id);


-- 5. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Accounts Settings', 'accounts_settings', 'single', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('System Manager', 'Accounts Settings', true, true, true, false, false),
  ('Accounts Manager', 'Accounts Settings', true, true, true, false, false),
  ('Accounts User', 'Accounts Settings', true, true, false, false, false),
  -- Select only, ERPNext's permission for a link field: whoever edits Accounts Settings can pick the frozen-
  -- accounts role without being able to open Roles.
  ('All', 'Role', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('accounts_settings', 'Accounts Settings');


-- 6. Seeding: a system's defaults from the chart merchants_seed_40_accounting made, found by name and kind so
-- a renamed or retyped account is left alone. Only empty defaults are filled. No Bank default: the standard
-- chart has no bank ledger until the owner adds one.

create or replace function private.seed_accounting_defaults_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  update public.merchants m set
    default_cash_account = coalesce(m.default_cash_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Cash' and a.account_type = 'Cash' and not a.is_group)),
    default_income_account = coalesce(m.default_income_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Sales' and a.root_type = 'Income' and not a.is_group)),
    default_expense_account = coalesce(m.default_expense_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Cost of Goods Sold' and a.root_type = 'Expense' and not a.is_group)),
    write_off_account = coalesce(m.write_off_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Write Off' and a.root_type = 'Expense' and not a.is_group)),
    round_off_account = coalesce(m.round_off_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Round Off' and a.root_type = 'Expense' and not a.is_group)),
    default_inventory_account = coalesce(m.default_inventory_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Stock In Hand' and a.account_type = 'Stock' and not a.is_group)),
    stock_adjustment_account = coalesce(m.stock_adjustment_account,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Stock Adjustment' and a.account_type = 'Stock Adjustment' and not a.is_group)),
    stock_received_but_not_billed = coalesce(m.stock_received_but_not_billed,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Stock Received But Not Billed' and a.account_type = 'Stock Received But Not Billed' and not a.is_group)),
    expenses_included_in_valuation = coalesce(m.expenses_included_in_valuation,
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Expenses Included In Valuation' and a.account_type = 'Expenses Included In Valuation' and not a.is_group)),
    cost_center = coalesce(m.cost_center,
      (select c.id from public.cost_centers c where c.merchant_id = m.id and c.cost_center_name = 'Main' and not c.is_group)),
    round_off_cost_center = coalesce(m.round_off_cost_center,
      (select c.id from public.cost_centers c where c.merchant_id = m.id and c.cost_center_name = 'Main' and not c.is_group))
  where m.id = p_merchant;

  insert into public.accounts_settings (merchant_id) values (p_merchant) on conflict (merchant_id) do nothing;
$$;

revoke execute on function private.seed_accounting_defaults_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_accounting_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_accounting_defaults_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_accounting_defaults() from public, anon, authenticated, service_role;

-- After merchants_seed_40_accounting, by name: the chart exists when this runs.
drop trigger if exists merchants_seed_50_accounting_defaults on public.merchants;
create trigger merchants_seed_50_accounting_defaults
  after insert on public.merchants
  for each row execute function private.seed_accounting_defaults();

-- The systems that already exist.
select private.seed_accounting_defaults_for(m.id) from public.merchants m;
