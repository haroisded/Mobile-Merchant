-- One store, no branches (2026-10-19).
--
-- What a person creates is one store: a single business with no branches. ERPNext's Company carries two
-- things that exist only to tell several companies or branches apart, and both go:
--
--   * Cost Centers (docs.frappe.io/erpnext/cost-center: "which team, branch, project, or business unit") — the
--     table, every column that names one, and every rule that fills or checks one. The General Ledger posts by
--     account alone; Profit and Loss rows no longer need a cost center.
--   * The Company Abbreviation (docs.frappe.io/erpnext/company: "short suffix used to distinguish
--     company-specific accounts, cost centers, and warehouses") — merchants.abbr and its check. Nothing in the
--     database read it; the app only displayed it after names.
--
-- And the words the database writes for a person say "store", not "system" or "company": the Store & Calendar
-- permission, the Store Manager role's description, the access-code refusal, the inventory-account refusal.
-- Identifiers stay (merchants, merchant_id, the doctype 'Company', error codes).
--
-- THIS DESTROYS DATA: every cost center, every cost center named on a GL entry, a document, a default, a POS
-- Profile or a tax row, and every store's abbreviation. Its revert (supabase/reverts/, same filename) brings the
-- structure back, not those values.
--
-- No function changes its signature, and every RPC still takes one jsonb payload: a build that still sends a
-- cost-center key is ignored, not refused (jsonb_to_recordset / jsonb_populate_record skip undeclared keys).
-- A build that still selects or inserts merchants.abbr or a cost-center column is refused by PostgREST, so the
-- app's change ships with this one. Re-runnable, like the rest of supabase/migrations.

set local lock_timeout = '10s';

create schema if not exists private;


-- 1. Every function that read or wrote a cost center, re-created from its latest definition without it. Each
-- keeps its language, security and search_path, and its revoke (and grant, for an RPC) is stated again.

-- 1.1 The General Ledger (20261011165554_ledgers.sql): rows merge per account only, and a Profit and Loss row
-- needs no cost center.

create or replace function private.post_gl(
  p_merchant uuid, p_voucher_type text, p_voucher_id uuid, p_voucher_no text, p_date date, p_rows jsonb, p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precision integer;
  v_method text;
  v_company public.merchants;
  v_rows jsonb;
  v_diff numeric;
  v_bad text;
begin
  select s.currency_precision, s.rounding_method into v_precision, v_method
  from public.system_settings s where s.merchant_id = p_merchant;
  v_precision := coalesce(v_precision, 2);

  select * into v_company from public.merchants m where m.id = p_merchant;

  select
    coalesce(jsonb_agg(jsonb_build_object('account_id', t.account_id, 'amount', t.amount)), '[]'::jsonb),
    coalesce(sum(t.amount), 0)
  into v_rows, v_diff
  from (
    select
      r.account_id,
      sum(private.money_round(r.amount, v_precision, coalesce(v_method, 'Banker''s Rounding'))) as amount
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (account_id uuid, amount numeric)
    group by 1
    having sum(private.money_round(r.amount, v_precision, coalesce(v_method, 'Banker''s Rounding'))) <> 0
  ) t;

  if v_rows = '[]'::jsonb then
    return;
  end if;

  perform private.assert_postable(p_merchant, p_date);

  select coalesce(a.account_name, 'An account') into v_bad
  from jsonb_to_recordset(v_rows) as r (account_id uuid, amount numeric)
  left join public.accounts a on a.id = r.account_id and a.merchant_id = p_merchant
  where a.id is null or a.is_group or a.disabled
  limit 1;
  if found then
    raise exception 'account_unusable' using errcode = '23514', detail = format('%s is missing, a group or disabled.', v_bad);
  end if;

  if v_diff <> 0 then
    if abs(v_diff) > 5 / power(10::numeric, v_precision) or v_company.round_off_account is null then
      raise exception 'gl_unbalanced' using errcode = '23514', detail = format('Debits and credits differ by %s.', v_diff);
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('account_id', v_company.round_off_account, 'amount', -v_diff));
  end if;

  insert into public.gl_entries (merchant_id, posting_date, account_id, debit, credit, voucher_type, voucher_id, voucher_no, remarks)
  select p_merchant, p_date, r.account_id, greatest(r.amount, 0), greatest(-r.amount, 0),
    p_voucher_type, p_voucher_id, p_voucher_no, p_remarks
  from jsonb_to_recordset(v_rows) as r (account_id uuid, amount numeric);
end;
$$;

revoke execute on function private.post_gl(uuid, text, uuid, text, date, jsonb, text) from public, anon, authenticated, service_role;

create or replace function private.cancel_gl(p_merchant uuid, p_voucher_type text, p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_immutable boolean;
  v_today date := private.merchant_today(p_merchant);
  v_date date;
begin
  select min(g.posting_date) into v_date
  from public.gl_entries g
  where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled;

  if v_date is null then
    return;
  end if;

  select s.enable_immutable_ledger into v_immutable from public.accounts_settings s where s.merchant_id = p_merchant;

  if coalesce(v_immutable, true) then
    perform private.assert_postable(p_merchant, v_today);

    insert into public.gl_entries (merchant_id, posting_date, account_id, debit, credit, voucher_type, voucher_id, voucher_no, remarks)
    select g.merchant_id, v_today, g.account_id, g.credit, g.debit, g.voucher_type, g.voucher_id, g.voucher_no,
      'On cancellation of ' || g.voucher_no
    from public.gl_entries g
    where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled
    order by g.id;
  else
    -- Rewriting entries of a day that is frozen, or outside every fiscal year, is refused like a posting.
    perform private.assert_postable(p_merchant, v_date);

    update public.gl_entries g set is_cancelled = true
    where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled;
  end if;
end;
$$;

revoke execute on function private.cancel_gl(uuid, text, uuid) from public, anon, authenticated, service_role;

-- 1.2 The tree rules (20261009171705_stock_building_blocks.sql): the only delete rule was the cost-center root's.

create or replace function private.validate_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_group boolean;
  v_parent_root text;
  v_cycle boolean;
  v_children boolean;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    execute format('select exists (select 1 from public.%I where parent_id = $1 and merchant_id = $2)', tg_table_name)
      into v_children using new.id, new.merchant_id;
  else
    v_children := false;
  end if;

  if new.parent_id is null then
    if not new.is_group then
      raise exception 'root_must_be_group' using errcode = '23514', detail = 'A root of the tree must be a group.';
    end if;
  else
    if tg_table_name = 'accounts' then
      execute 'select is_group, root_type from public.accounts where id = $1 and merchant_id = $2'
        into v_parent_group, v_parent_root using new.parent_id, new.merchant_id;
    else
      execute format('select is_group from public.%I where id = $1 and merchant_id = $2', tg_table_name)
        into v_parent_group using new.parent_id, new.merchant_id;
    end if;

    if not coalesce(v_parent_group, false) then
      raise exception 'parent_not_group' using errcode = '23514', detail = 'A parent must be a group.';
    end if;

    if tg_op = 'UPDATE' then
      execute format(
        'with recursive up (id, parent_id) as (
           select id, parent_id from public.%I where id = $1 and merchant_id = $3
           union
           select t.id, t.parent_id from public.%I t join up on t.id = up.parent_id and t.merchant_id = $3
         )
         select exists (select 1 from up where id = $2)',
        tg_table_name, tg_table_name
      ) into v_cycle using new.parent_id, new.id, new.merchant_id;
      if v_cycle then
        raise exception 'tree_cycle' using errcode = '23514', detail = 'A record cannot sit under itself.';
      end if;
    end if;

    if tg_table_name = 'accounts' then
      new.root_type := v_parent_root;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_children then
    if old.is_group and not new.is_group then
      raise exception 'group_has_children' using errcode = '23514', detail = 'A group with records under it cannot become a ledger.';
    end if;
    -- Nested, not `and`-ed: plpgsql may evaluate both sides, and a warehouse or item group row has no root_type
    -- (42703 "record new has no field root_type" on every edit of a group with children).
    if tg_table_name = 'accounts' then
      if new.root_type is distinct from old.root_type then
        raise exception 'root_type_locked' using errcode = '23514', detail = 'An account with accounts under it cannot move to another root type.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_tree() from public, anon, authenticated, service_role;

-- 1.3 The store's default accounts (20261009004357_accounting_defaults.sql): no cost center among them.

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
      ('expenses_included_in_valuation', 'type', 'Expenses Included In Valuation')
    ) as r (col, kind, want)
  loop
    execute format('select ($1).%I, ($2).%I', v_rule.col, v_rule.col) into v_new, v_old using new, old;
    continue when v_new is null or (tg_op = 'UPDATE' and v_new is not distinct from v_old);

    select not a.is_group and not a.disabled
      and (case v_rule.kind when 'type' then a.account_type = v_rule.want else a.root_type = v_rule.want end)
    into v_ok
    from public.accounts a where a.id = v_new and a.merchant_id = new.id;

    if not coalesce(v_ok, false) then
      raise exception 'company_account_invalid' using errcode = '23514',
        detail = format('%s cannot name that record.', v_rule.col);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_company_accounts() from public, anon, authenticated, service_role;

-- 1.4 A tax row's account (20261009091028_taxes.sql): the account check alone.

create or replace function private.validate_tax_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select not a.is_group and not a.disabled
    and a.account_type = any (array['Tax', 'Chargeable', 'Income Account', 'Expense Account', 'Expenses Included In Valuation'])
  into v_ok
  from public.accounts a where a.id = new.account and a.merchant_id = new.merchant_id;

  if not coalesce(v_ok, false) then
    raise exception 'tax_account_invalid' using errcode = '23514',
      detail = 'A tax row''s account is an enabled ledger of type Tax, Chargeable, Income Account, Expense Account or Expenses Included In Valuation.';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_tax_account() from public, anon, authenticated, service_role;

-- 1.5 Every record's defaults (20261010011003_item_groups_and_selling_settings.sql): no Selling Cost Center.

create or replace function private.validate_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_column in array array['default_warehouse', 'default_price_list', 'income_account', 'expense_account', 'stock_uom'] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case v_column
      when 'default_warehouse' then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when 'default_price_list' then
        (select p.enabled from public.price_lists p where p.id = v_id and p.merchant_id = new.merchant_id)
      when 'income_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Income' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'expense_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'stock_uom' then
        (select u.enabled from public.uoms u where u.id = v_id and u.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'default_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_defaults() from public, anon, authenticated, service_role;

-- 1.6 What a new store starts with: no cost-center tree in its chart (20261008152613_chart_of_accounts.sql), no cost
-- center among its defaults (20261009004357_accounting_defaults.sql), none on its tax row (20261009091028_taxes.sql),
-- and the Store Manager described as the store's (20261014034106_employees_and_permissions.sql).

create or replace function private.seed_chart_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_root uuid;
  v_group uuid;
  v_sub uuid;
begin
  v_root := private.seed_account(p_merchant, 'Application of Funds (Assets)', null, true, 'Asset', null);
  v_group := private.seed_account(p_merchant, 'Current Assets', v_root, true, 'Asset', null);
  perform private.seed_account(p_merchant, 'Bank Accounts', v_group, true, 'Asset', 'Bank');
  v_sub := private.seed_account(p_merchant, 'Cash In Hand', v_group, true, 'Asset', 'Cash');
  perform private.seed_account(p_merchant, 'Cash', v_sub, false, 'Asset', 'Cash');
  v_sub := private.seed_account(p_merchant, 'Stock Assets', v_group, true, 'Asset', 'Stock');
  perform private.seed_account(p_merchant, 'Stock In Hand', v_sub, false, 'Asset', 'Stock');
  perform private.seed_account(p_merchant, 'Tax Assets', v_group, true, 'Asset', null);
  v_group := private.seed_account(p_merchant, 'Temporary Accounts', v_root, true, 'Asset', null);
  perform private.seed_account(p_merchant, 'Temporary Opening', v_group, false, 'Asset', 'Temporary');

  v_root := private.seed_account(p_merchant, 'Source of Funds (Liabilities)', null, true, 'Liability', null);
  v_group := private.seed_account(p_merchant, 'Current Liabilities', v_root, true, 'Liability', null);
  perform private.seed_account(p_merchant, 'Duties and Taxes', v_group, true, 'Liability', 'Tax');
  v_sub := private.seed_account(p_merchant, 'Stock Liabilities', v_group, true, 'Liability', null);
  perform private.seed_account(p_merchant, 'Stock Received But Not Billed', v_sub, false, 'Liability', 'Stock Received But Not Billed');

  v_root := private.seed_account(p_merchant, 'Equity', null, true, 'Equity', null);
  perform private.seed_account(p_merchant, 'Capital Stock', v_root, false, 'Equity', 'Equity');
  perform private.seed_account(p_merchant, 'Opening Balance Equity', v_root, false, 'Equity', 'Equity');
  perform private.seed_account(p_merchant, 'Retained Earnings', v_root, false, 'Equity', 'Equity');

  v_root := private.seed_account(p_merchant, 'Income', null, true, 'Income', null);
  v_group := private.seed_account(p_merchant, 'Direct Income', v_root, true, 'Income', null);
  perform private.seed_account(p_merchant, 'Sales', v_group, false, 'Income', 'Income Account');
  perform private.seed_account(p_merchant, 'Indirect Income', v_root, true, 'Income', null);

  v_root := private.seed_account(p_merchant, 'Expenses', null, true, 'Expense', null);
  v_group := private.seed_account(p_merchant, 'Direct Expenses', v_root, true, 'Expense', null);
  v_sub := private.seed_account(p_merchant, 'Stock Expenses', v_group, true, 'Expense', null);
  perform private.seed_account(p_merchant, 'Cost of Goods Sold', v_sub, false, 'Expense', 'Cost of Goods Sold');
  perform private.seed_account(p_merchant, 'Expenses Included In Valuation', v_sub, false, 'Expense', 'Expenses Included In Valuation');
  perform private.seed_account(p_merchant, 'Stock Adjustment', v_sub, false, 'Expense', 'Stock Adjustment');
  v_group := private.seed_account(p_merchant, 'Indirect Expenses', v_root, true, 'Expense', null);
  perform private.seed_account(p_merchant, 'Write Off', v_group, false, 'Expense', null);
  perform private.seed_account(p_merchant, 'Round Off', v_group, false, 'Expense', 'Round Off');

end;
$$;

revoke execute on function private.seed_chart_for(uuid) from public, anon, authenticated, service_role;

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
      (select a.id from public.accounts a where a.merchant_id = m.id and a.account_name = 'Expenses Included In Valuation' and a.account_type = 'Expenses Included In Valuation' and not a.is_group))
  where m.id = p_merchant;

  insert into public.accounts_settings (merchant_id) values (p_merchant) on conflict (merchant_id) do nothing;
$$;

revoke execute on function private.seed_accounting_defaults_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_taxes_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_country text;
  v_group uuid;
  v_preset record;
  v_account uuid;
  v_template uuid;
begin
  select m.country_code into v_country from public.merchants m where m.id = p_merchant;

  select a.id into v_group
  from public.accounts a
  where a.merchant_id = p_merchant and a.is_group and a.root_type = 'Liability' and a.account_type = 'Tax'
  order by a.created_at
  limit 1;

  if v_group is null then
    return;
  end if;

  for v_preset in
    select p.* from public.tax_presets p where p.country_code = v_country order by p.template
  loop
    v_account := private.seed_account(p_merchant, v_preset.account_name, v_group, false, 'Liability', 'Tax');

    if not exists (
      select 1 from public.accounts a where a.id = v_account and a.account_type = 'Tax' and not a.is_group and not a.disabled
    ) then
      continue;
    end if;

    insert into public.sales_tax_templates (merchant_id, title, is_default)
    values (p_merchant, v_preset.template, v_preset.is_default)
    on conflict (merchant_id, title) do nothing
    returning id into v_template;

    if v_template is not null then
      insert into public.sales_tax_template_rows (merchant_id, template_id, idx, charge_type, account, description, rate)
      values (
        p_merchant, v_template, 1, 'On Net Total', v_account,
        v_preset.account_name || ' @ ' || trim_scale(v_preset.tax_rate)::text, v_preset.tax_rate
      );
    end if;

    insert into public.item_tax_templates (merchant_id, title)
    values (p_merchant, v_preset.template)
    on conflict (merchant_id, title) do nothing
    returning id into v_template;

    if v_template is not null then
      insert into public.item_tax_template_rows (merchant_id, template_id, idx, account, tax_rate)
      values (p_merchant, v_template, 1, v_account, v_preset.tax_rate);
    end if;
  end loop;
end;
$$;

revoke execute on function private.seed_taxes_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_roles(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  with made as (
    insert into public.roles (merchant_id, role_name, description, color)
    values
      (p_merchant, 'Cashier', 'Rings up sales and opens and closes their register.', 'green'),
      (p_merchant, 'Stock Clerk', 'Sees stock levels and receives shipments.', 'orange'),
      (p_merchant, 'Store Manager', 'Every permission in the store.', 'maroon')
    on conflict (merchant_id, role_name) do nothing
    returning id, role_name
  )
  insert into public.role_grants (merchant_id, role_id, permission)
  select p_merchant, r.id, p.key
  from made r
  join public.permissions p on case r.role_name
    when 'Cashier' then p.key in ('process_sales', 'open_close_register')
    when 'Stock Clerk' then p.key in ('view_stock', 'move_stock')
    else true
  end;
$$;

revoke execute on function private.seed_roles(uuid) from public, anon, authenticated, service_role;

-- 1.7 A stock document's links (20261011170112_stock_in_and_adjustments.sql) and a POS Profile's
-- (20261011233916_pos_profiles.sql): no cost center among them.

create or replace function private.validate_stock_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.difference_account is null then
      new.difference_account := case
        when to_jsonb(new) ->> 'purpose' = 'Opening Stock' then (
          select a.id from public.accounts a
          where a.merchant_id = new.merchant_id and a.account_type = 'Temporary' and not a.is_group and not a.disabled
          order by a.account_name limit 1
        )
        else (select m.stock_adjustment_account from public.merchants m where m.id = new.merchant_id)
      end;
    end if;
  end if;

  v_new := to_jsonb(new);

  foreach v_column in array array['from_warehouse', 'to_warehouse', 'difference_account'] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case
      when v_column in ('from_warehouse', 'to_warehouse') then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when v_column = 'difference_account' then
        (select not a.is_group and not a.disabled from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'document_link_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  if v_new ->> 'purpose' = 'Opening Stock' and (
    select a.root_type in ('Income', 'Expense') from public.accounts a where a.id = new.difference_account
  ) then
    raise exception 'opening_account_invalid' using errcode = '23514',
      detail = 'An Opening Stock''s Difference Account is an asset or liability account.';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_stock_document() from public, anon, authenticated, service_role;

create or replace function private.validate_pos_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_column in array array[
    'warehouse', 'selling_price_list', 'taxes_and_charges', 'tax_category', 'print_format', 'letter_head',
    'account_for_change_amount', 'write_off_account', 'income_account', 'expense_account'
  ] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case v_column
      when 'warehouse' then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when 'selling_price_list' then
        (select p.enabled from public.price_lists p where p.id = v_id and p.merchant_id = new.merchant_id)
      when 'taxes_and_charges' then
        (select not t.disabled from public.sales_tax_templates t where t.id = v_id and t.merchant_id = new.merchant_id)
      when 'tax_category' then
        (select not c.disabled from public.tax_categories c where c.id = v_id and c.merchant_id = new.merchant_id)
      when 'print_format' then
        (select not f.disabled from public.print_formats f where f.id = v_id and f.merchant_id = new.merchant_id)
      when 'letter_head' then
        (select not h.disabled from public.letter_heads h where h.id = v_id and h.merchant_id = new.merchant_id)
      -- Change is handed back out of a cash or bank ledger.
      when 'account_for_change_amount' then
        (select not a.is_group and not a.disabled and a.account_type in ('Cash', 'Bank')
         from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'income_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Income' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'write_off_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'expense_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'default_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_pos_profile() from public, anon, authenticated, service_role;

-- 1.8 The posters (20261011170112_stock_in_and_adjustments.sql, 20261014034106_employees_and_permissions.sql): no
-- cost center on a GL row, and the store named where an inventory account is missing.

create or replace function private.submit_stock_reconciliations(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_reconciliations;
  v_row public.stock_reconciliation_items;
  v_perpetual boolean;
  v_account uuid;
  v_bin record;
  v_value numeric;
  v_gl jsonb := '[]'::jsonb;
  v_changed boolean := false;
begin
  select * into v_doc from public.stock_reconciliations d where d.id = p_id;
  select m.enable_perpetual_inventory into v_perpetual from public.merchants m where m.id = v_doc.merchant_id;

  if v_perpetual and v_doc.difference_account is null then
    raise exception 'difference_account_required' using errcode = '23514',
      detail = 'With Perpetual Inventory on, the change in stock value needs a Difference Account.';
  end if;

  for v_row in
    select * from public.stock_reconciliation_items r where r.stock_reconciliation_id = p_id order by r.idx
  loop
    if v_row.qty > 0 and v_row.valuation_rate <= 0 then
      raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Stock on hand needs a valuation rate above zero.';
    end if;

    select b.actual_qty, b.valuation_rate into v_bin
    from public.bins b where b.item_id = v_row.item_id and b.warehouse_id = v_row.warehouse_id;

    v_value := private.reconcile_sle(
      v_doc.merchant_id, 'Stock Reconciliation', p_id, v_doc.name, v_doc.posting_date,
      v_row.item_id, v_row.warehouse_id, v_row.qty, v_row.valuation_rate
    );

    update public.stock_reconciliation_items r set
      current_qty = coalesce(v_bin.actual_qty, 0),
      current_valuation_rate = coalesce(v_bin.valuation_rate, 0),
      amount_difference = coalesce(v_value, 0)
    where r.id = v_row.id;

    continue when v_value is null;
    v_changed := true;

    if v_perpetual then
      v_account := private.warehouse_account(v_row.warehouse_id);
      if v_account is null then
        raise exception 'no_inventory_account' using errcode = '23514',
          detail = 'Neither the warehouse, its parents nor the store names an inventory account.';
      end if;

      v_gl := v_gl || jsonb_build_array(
        jsonb_build_object('account_id', v_account, 'amount', v_value),
        jsonb_build_object('account_id', v_doc.difference_account, 'amount', -v_value)
      );
    end if;
  end loop;

  if not v_changed then
    raise exception 'nothing_to_reconcile' using errcode = '23514', detail = 'None of the items have any change in quantity or value.';
  end if;

  perform private.post_gl(v_doc.merchant_id, 'Stock Reconciliation', p_id, v_doc.name, v_doc.posting_date, v_gl);
end;
$$;

revoke execute on function private.submit_stock_reconciliations(uuid) from public, anon, authenticated, service_role;

create or replace function private.submit_stock_entries(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_entries;
  v_row public.stock_entry_items;
  v_perpetual boolean;
  v_from uuid;
  v_to uuid;
  v_out numeric;
  v_in numeric;
  v_gl jsonb := '[]'::jsonb;
  v_rows integer := 0;
begin
  select * into v_doc from public.stock_entries d where d.id = p_id;
  select m.enable_perpetual_inventory into v_perpetual from public.merchants m where m.id = v_doc.merchant_id;

  if v_perpetual then
    v_from := private.warehouse_account(v_doc.from_warehouse);
    v_to := private.warehouse_account(v_doc.to_warehouse);

    if (v_doc.from_warehouse is not null and v_from is null) or (v_doc.to_warehouse is not null and v_to is null) then
      raise exception 'no_inventory_account' using errcode = '23514',
        detail = 'Neither the warehouse, its parents nor the store names an inventory account.';
    end if;
    if v_doc.difference_account is null then
      raise exception 'difference_account_required' using errcode = '23514',
        detail = 'With Perpetual Inventory on, the change in stock value needs a Difference Account.';
    end if;
  end if;

  for v_row in
    select * from public.stock_entry_items r where r.stock_entry_id = p_id order by r.idx
  loop
    v_rows := v_rows + 1;
    v_out := 0;
    v_in := 0;

    if v_doc.purpose = 'Material Receipt' then
      if coalesce(v_row.basic_rate, 0) <= 0 then
        raise exception 'rate_required' using errcode = '23514', detail = 'A receipt needs each row''s rate.';
      end if;
      v_in := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, v_row.basic_rate
      );
    else
      v_out := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.from_warehouse, -v_row.qty
      );
      if v_doc.purpose = 'Material Transfer' then
        v_in := private.post_sle(
          v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, -v_out / v_row.qty
        );
      end if;
    end if;

    -- What the row moved, for the page: the rate it came in at, or the valuation it left at.
    update public.stock_entry_items r set
      basic_rate = case when v_doc.purpose = 'Material Receipt' then r.basic_rate else -v_out / r.qty end,
      amount = case when v_doc.purpose = 'Material Receipt' then v_in else -v_out end
    where r.id = v_row.id;

    v_gl := v_gl || jsonb_build_array(
      jsonb_build_object('account_id', v_from, 'amount', v_out),
      jsonb_build_object('account_id', v_to, 'amount', v_in),
      -- The stock value that came or went with no warehouse on the other side.
      jsonb_build_object('account_id', v_doc.difference_account, 'amount', -(v_out + v_in))
    );
  end loop;

  if v_rows = 0 then
    raise exception 'no_rows' using errcode = '23514', detail = 'A stock entry needs at least one item.';
  end if;

  if v_perpetual then
    perform private.post_gl(v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_gl);
  end if;
end;
$$;

revoke execute on function private.submit_stock_entries(uuid) from public, anon, authenticated, service_role;

create or replace function private.submit_pos_invoices(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.pos_invoices;
  v_profile public.pos_profiles;
  v_company public.merchants;
  v_session public.pos_opening_entries;
  -- The sale a return is made against.
  v_original public.pos_invoices;
  v_rule public.pricing_rules;
  v_row record;
  v_today date;
  v_precision integer;
  -- One unit of the currency's smallest decimal: what two roundings of the same figure may differ by.
  v_unit numeric;
  v_price_list uuid;
  v_auto_price boolean;
  v_validate_price boolean;
  v_discounts boolean;
  v_discount_accounting boolean;
  v_warehouse uuid;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  -- Where a line's own discount posts, and the sale's additional one. Null: it only reduces the sale.
  v_discount_account uuid;
  v_additional_account uuid;
  v_cost numeric;
  v_item_discount numeric;
  v_additional numeric;
  v_rows integer := 0;
  v_tax_rows integer := 0;
  v_net numeric := 0;
  v_distributed numeric := 0;
  v_tax numeric := 0;
  v_paid numeric := 0;
  v_change numeric := 0;
  v_write_off numeric := 0;
  v_gl jsonb := '[]'::jsonb;
begin
  select * into v_doc from public.pos_invoices d where d.id = p_id;
  select * into v_profile from public.pos_profiles p where p.id = v_doc.pos_profile_id;
  select * into v_company from public.merchants m where m.id = v_doc.merchant_id;
  select * into v_session from public.pos_opening_entries s where s.id = v_doc.pos_opening_entry_id;
  v_today := private.merchant_today(v_doc.merchant_id);
  select s.currency_precision into v_precision from public.system_settings s where s.merchant_id = v_doc.merchant_id;
  v_precision := coalesce(v_precision, 2);
  v_unit := 1 / power(10::numeric, v_precision);

  -- "No sale without an open session": the caller's own, on this profile. A refund comes out of that drawer.
  if v_doc.user_id is distinct from (select auth.uid())
    or v_session.docstatus is distinct from 1 or v_session.status is distinct from 'Open'
    or v_session.user_id is distinct from (select auth.uid())
    or v_session.pos_profile_id is distinct from v_doc.pos_profile_id then
    raise exception 'no_open_session' using errcode = '23514', detail = 'A sale needs the cashier''s own open session on that POS Profile.';
  end if;
  if not private.pos_profile_usable(v_doc.pos_profile_id) then
    raise exception 'pos_profile_unusable' using errcode = '23514', detail = 'The POS Profile is disabled, or not applicable for this user.';
  end if;
  -- Employees & permissions: a sale needs Process Sales, a return Process Refunds.
  if v_doc.is_return and not private.has_permission(v_doc.merchant_id, 'process_refunds') then
    raise exception 'refunds_not_permitted' using errcode = '42501';
  end if;
  if not v_doc.is_return and not private.has_permission(v_doc.merchant_id, 'process_sales') then
    raise exception 'sales_not_permitted' using errcode = '42501';
  end if;

  -- 19.1: "the original Delivery Note or Sales Invoice is submitted". Locked: two returns cannot both take
  -- the last unit, and a void of the sale waits for this one.
  if v_doc.is_return then
    select * into v_original from public.pos_invoices o where o.id = v_doc.return_against for update;
    if v_original.docstatus is distinct from 1 or v_original.is_return then
      raise exception 'return_original_invalid' using errcode = '23514',
        detail = 'A return is made against a submitted sale that is not itself a return.';
    end if;
  end if;

  -- "Stock back into the warehouse": the one it was sold from.
  v_warehouse := case when v_doc.is_return then v_original.warehouse else v_profile.warehouse end;

  select coalesce(v_profile.selling_price_list, s.default_price_list), s.validate_selling_price into v_price_list, v_validate_price
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;
  select a.enable_discount_accounting into v_discount_accounting
  from public.accounts_settings a where a.merchant_id = v_doc.merchant_id;

  if v_company.enable_perpetual_inventory then
    v_inventory := private.warehouse_account(v_warehouse);
  end if;

  -- 20.5, Discount Accounting: "additional discounts [post] to the POS Profile's, falling back to the
  -- Company's Default Discount Account". A return posts back where its sale posted.
  v_additional_account := case
    when v_doc.is_return then v_original.additional_discount_account
    when v_discount_accounting then coalesce(v_profile.discount_account, v_company.default_discount_account)
  end;

  -- 20.3, Allow User to Edit Discount.
  if not v_doc.is_return and v_doc.discount_amount > 0 and not v_profile.allow_discount_change then
    raise exception 'discount_locked' using errcode = '23514', detail = 'This POS Profile does not allow a discount on the sale.';
  end if;
  -- Apply Discounts: a discount on the sale, or a line priced by hand away from its Price List Rate (below).
  v_discounts := private.has_permission(v_doc.merchant_id, 'apply_discounts');
  if not v_doc.is_return and v_doc.discount_amount > 0 and not v_discounts then
    raise exception 'discounts_not_permitted' using errcode = '42501';
  end if;

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom, i.max_discount,
      i.item_group_id as item_group, i.brand_id as brand,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      -- 20.5: "item discounts post to the Item's Discount Account … falling back to the Company's".
      coalesce(i.discount_account, v_company.default_discount_account) as item_discount_account,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor,
      -- The line of the sale a return's line takes back, and what earlier returns took of it (below zero).
      o.pos_invoice_id as o_invoice, o.item_id as o_item, o.item_name as o_name, o.uom_id as o_uom, o.conversion_factor as o_factor,
      o.qty as o_qty, o.price_list_rate as o_price_list_rate, o.rate as o_rate, o.amount as o_amount, o.net_amount as o_net_amount,
      o.income_account as o_income, o.expense_account as o_expense, o.valuation_rate as o_valuation,
      o.discount_percentage as o_discount_percentage, o.discount_amount as o_discount_amount,
      o.distributed_discount_amount as o_distributed, o.pricing_rule_id as o_rule, o.discount_account as o_discount_account,
      coalesce((
        select sum(x.qty) from public.pos_invoice_items x
        join public.pos_invoices xi on xi.id = x.pos_invoice_id
        where x.return_against_item = o.id and xi.docstatus = 1
      ), 0) as o_returned
    from public.pos_invoice_items r
    join public.items i on i.id = r.item_id
    join public.item_groups g on g.id = i.item_group_id
    left join public.brands b on b.id = i.brand_id
    left join public.pos_invoice_items o on o.id = r.return_against_item
    where r.pos_invoice_id = p_id
    order by r.idx
  loop
    v_rows := v_rows + 1;

    if v_doc.is_return then
      -- "Rate: Original selling rate used to calculate the returned value." The line is the sale's own, in
      -- the unit it was sold in, under the discount it was sold at, with a quantity below zero.
      if v_row.o_invoice is distinct from v_doc.return_against or v_row.qty > 0
        or v_row.item_id <> v_row.o_item or v_row.uom_id <> v_row.o_uom or v_row.conversion_factor <> v_row.o_factor
        or v_row.rate <> v_row.o_rate or v_row.price_list_rate <> v_row.o_price_list_rate
        or abs(v_row.discount_percentage - v_row.o_discount_percentage) > 0.000001
        or v_row.discount_amount <> v_row.o_discount_amount or v_row.pricing_rule_id is distinct from v_row.o_rule
        or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
        raise exception 'return_line_invalid' using errcode = '23514',
          detail = 'A returned line names a line of the sale, with its item, unit, rate and discount, and a quantity below zero.';
      end if;
      -- "Returned quantity is rejected: confirm it does not exceed the quantity available to return."
      if -v_row.qty > v_row.o_qty + v_row.o_returned then
        raise exception 'return_qty_exceeds' using errcode = '23514',
          detail = format('%s sold, %s already returned.', v_row.o_qty, -v_row.o_returned);
      end if;
      if abs(v_row.amount - v_row.o_amount * v_row.qty / v_row.o_qty) > v_unit
        or abs(v_row.net_amount - v_row.o_net_amount * v_row.qty / v_row.o_qty) > v_unit
        or abs(v_row.distributed_discount_amount - v_row.o_distributed * v_row.qty / v_row.o_qty) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned line is not its share of the line sold.';
      end if;

      -- Where the sale posted, the return posts back.
      v_income := v_row.o_income;
      v_discount_account := v_row.o_discount_account;
    else
      if v_row.qty < 0 or v_row.return_against_item is not null then
        raise exception 'return_line_invalid' using errcode = '23514', detail = 'A sale''s lines are sold, not returned.';
      end if;
      if v_row.disabled then
        raise exception 'item_unusable' using errcode = '23514', detail = 'A disabled item cannot be sold.';
      end if;
      -- 13.4: sold in the stock unit, or in one of the item's units at its conversion factor.
      if v_row.conversion_factor is distinct from (case when v_row.uom_id = v_row.stock_uom then 1 else v_row.unit_factor end)
        or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
        raise exception 'uom_not_on_item' using errcode = '23514', detail = 'A line is sold in a unit its item does not have, or at another conversion factor.';
      end if;
      -- 20.1: "calculated against the Price List Rate". The discount is what the rate is under the list's,
      -- per unit, and the percentage says the same; a typed lower rate is a discount too.
      if abs(v_row.discount_amount - greatest(v_row.price_list_rate - v_row.rate, 0)) > v_unit
        or abs(v_row.discount_amount - v_row.price_list_rate * v_row.discount_percentage / 100) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s discount is not its Price List Rate less its rate.';
      end if;
      if abs(v_row.amount - v_row.qty * v_row.rate) > v_unit or v_row.net_amount < 0 or v_row.distributed_discount_amount < 0
        or v_row.net_amount + v_row.distributed_discount_amount > v_row.amount + v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s amount is not its quantity times its rate.';
      end if;

      if v_row.pricing_rule_id is not null then
        -- 20.4: the rule the line claims is enabled, valid today, for this price list, covers the item — by
        -- itself, its brand, or its item group or one above it — within its quantity and amount, and gives
        -- this rate. "POS Profile Ignore Pricing Rule switches it off for a register."
        select * into v_rule from public.pricing_rules p where p.id = v_row.pricing_rule_id;
        if v_profile.ignore_pricing_rule or v_rule.disable is distinct from false
          or v_rule.valid_from > v_today or v_rule.valid_upto < v_today
          or (v_rule.for_price_list is not null and v_rule.for_price_list is distinct from v_price_list)
          or v_row.stock_qty < v_rule.min_qty or (v_rule.max_qty > 0 and v_row.stock_qty > v_rule.max_qty)
          or v_row.qty * v_row.price_list_rate < v_rule.min_amt
          or (v_rule.max_amt > 0 and v_row.qty * v_row.price_list_rate > v_rule.max_amt)
          or not exists (
            select 1 from public.pricing_rule_targets t
            where t.pricing_rule_id = v_rule.id
              and (t.item_id = v_row.item_id or t.brand_id = v_row.brand or t.item_group_id in (
                with recursive up as (
                  select g.id, g.parent_id from public.item_groups g where g.id = v_row.item_group
                  union all
                  select g.id, g.parent_id from public.item_groups g join up on g.id = up.parent_id
                )
                select up.id from up
              ))
          )
          or abs(v_row.rate - case v_rule.rate_or_discount
            when 'Rate' then v_rule.rate * v_row.conversion_factor
            when 'Discount Percentage' then v_row.price_list_rate * (1 - v_rule.discount_percentage / 100)
            else greatest(v_row.price_list_rate - v_rule.discount_amount, 0)
          end) > v_unit then
          raise exception 'pricing_rule_mismatch' using errcode = '23514', detail = 'A line''s Pricing Rule does not apply to it, or gives another rate.';
        end if;
      elsif v_row.rate > v_row.price_list_rate and not v_profile.allow_rate_change then
        raise exception 'rate_locked' using errcode = '23514', detail = 'This POS Profile does not allow a line''s rate to be changed.';
      elsif v_row.discount_amount > 0 and not (v_profile.allow_discount_change or v_profile.allow_rate_change) then
        -- 20.3, Allow User to Edit Discount.
        raise exception 'discount_locked' using errcode = '23514', detail = 'This POS Profile does not allow a discount on a line.';
      elsif abs(v_row.rate - v_row.price_list_rate) > v_unit and not v_discounts then
        raise exception 'discounts_not_permitted' using errcode = '42501';
      end if;
      -- 20.3, Item Max Discount (%), whoever gave the discount.
      if v_row.max_discount > 0 and v_row.discount_percentage > v_row.max_discount then
        raise exception 'max_discount_exceeded' using errcode = '23514',
          detail = format('%s takes at most %s%%.', v_row.current_name, v_row.max_discount);
      end if;

      v_income := v_row.income;
      v_discount_account := case when v_discount_accounting then v_row.item_discount_account end;
    end if;

    v_net := v_net + v_row.net_amount;
    v_distributed := v_distributed + v_row.distributed_discount_amount;
    v_expense := null;
    v_cost := null;

    -- 20.5, Discount Accounting: "Sales shows the full price." Each discount is debited to its account net
    -- of tax and income credited by as much more, so the taxes stay what the customer was charged.
    -- Rejected: ERPNext's Grand Total variant, which credits tax at the amount before the discount.
    -- With no account for it, a discount only reduces the sale.
    v_item_discount := case when v_discount_account is null then 0 else round(
      v_row.qty * v_row.discount_amount
        * case when v_row.amount = 0 then 1 else (v_row.net_amount + v_row.distributed_discount_amount) / v_row.amount end,
      v_precision) end;
    v_additional := case when v_additional_account is null then 0 else v_row.distributed_discount_amount end;
    v_gl := v_gl
      || jsonb_build_object('account_id', v_income, 'amount', -(v_row.net_amount + v_item_discount + v_additional))
      || jsonb_build_object('account_id', v_discount_account, 'amount', v_item_discount)
      || jsonb_build_object('account_id', v_additional_account, 'amount', v_additional);

    -- "Posts at once: stock out and Cost of Goods Sold." A service moves no stock. Negative stock, a
    -- fraction in a whole-number unit and a backdated posting are the engine's to refuse. A return brings
    -- back what the sale moved, at the valuation it left at.
    if (v_doc.is_return and v_row.o_valuation is not null) or (not v_doc.is_return and v_row.is_stock_item) then
      v_cost := -private.post_sle(
        v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_row.item_id, v_warehouse, -v_row.stock_qty,
        case when v_doc.is_return then v_row.o_valuation end
      );
      -- 20.3, Selling Settings' Validate Selling Price: the line sells for no less than it is valued at.
      if not v_doc.is_return and v_validate_price and v_row.net_amount < v_cost - v_unit then
        raise exception 'below_valuation' using errcode = '23514',
          detail = format('%s sells for %s and is valued at %s.', v_row.current_name, v_row.net_amount, v_cost);
      end if;
      if v_company.enable_perpetual_inventory then
        if v_inventory is null then
          raise exception 'no_inventory_account' using errcode = '23514',
            detail = 'Neither the warehouse, its parents nor the store names an inventory account.';
        end if;
        v_expense := case when v_doc.is_return then coalesce(v_row.o_expense, v_row.expense) else v_row.expense end;
        v_gl := v_gl
          || jsonb_build_object('account_id', v_expense, 'amount', v_cost)
          || jsonb_build_object('account_id', v_inventory, 'amount', -v_cost);
      end if;
    end if;

    update public.pos_invoice_items r set
      item_name = case when v_doc.is_return then v_row.o_name else v_row.current_name end,
      income_account = v_income, expense_account = v_expense,
      discount_account = case when v_item_discount <> 0 then v_discount_account end,
      valuation_rate = v_cost / v_row.stock_qty
    where r.id = v_row.id;

    -- 14.1, Stock Settings' Auto Insert Price List Rate if Missing: the item's first sale in this unit
    -- writes its rate into the sale's price list.
    if not v_doc.is_return and v_auto_price and v_row.price_list_rate > 0
      and exists (select 1 from public.price_lists p where p.id = v_price_list and p.enabled)
      and not exists (
        select 1 from public.item_prices p
        where p.item_id = v_row.item_id and p.price_list_id = v_price_list and p.uom_id = v_row.uom_id
      ) then
      insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
      values (v_doc.merchant_id, v_row.item_id, v_price_list, v_row.uom_id, v_row.price_list_rate);
    end if;
  end loop;

  if v_rows = 0 then
    raise exception 'no_rows' using errcode = '23514', detail = 'A sale needs at least one item.';
  end if;

  for v_row in
    select
      t.*, o.account_head as o_account,
      -- The sale's row, line by line, for the share of each line this return takes back.
      (
        select sum((o.item_wise_tax_detail ->> (l.pos - 1))::numeric * r.qty / l.qty)
        from public.pos_invoice_items r
        join (
          select x.id, x.qty, (row_number() over (order by x.idx))::integer as pos
          from public.pos_invoice_items x where x.pos_invoice_id = v_doc.return_against
        ) l on l.id = r.return_against_item
        where r.pos_invoice_id = p_id
      ) as o_share
    from public.pos_invoice_taxes t
    left join public.pos_invoice_taxes o on o.pos_invoice_id = v_doc.return_against and o.idx = t.idx
    where t.pos_invoice_id = p_id
    order by t.idx
  loop
    v_tax_rows := v_tax_rows + 1;

    if v_doc.is_return then
      if v_row.o_account is distinct from v_row.account_head or abs(v_row.tax_amount - coalesce(v_row.o_share, 0)) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned tax is not its share of the tax charged.';
      end if;
    elsif jsonb_array_length(v_row.item_wise_tax_detail) <> v_rows
      or abs(v_row.tax_amount - coalesce((select sum(d.value::numeric) from jsonb_array_elements_text(v_row.item_wise_tax_detail) as d (value)), 0)) > v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A tax row''s amounts per line do not add up to it.';
    end if;

    v_tax := v_tax + v_row.tax_amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount);
  end loop;

  if v_doc.is_return and v_tax_rows <> (select count(*) from public.pos_invoice_taxes o where o.pos_invoice_id = v_doc.return_against) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'A return carries every tax row of its sale.';
  end if;

  -- 20.2: the additional discount. Its lines' shares are all of it when it was taken from the Net Total,
  -- and the net part of it from the Grand Total (the rest is tax); a percentage is of that total before it.
  -- A return's is the share of the sale's that its lines took.
  if v_doc.is_return then
    if v_doc.apply_discount_on <> v_original.apply_discount_on
      or v_doc.additional_discount_percentage <> v_original.additional_discount_percentage
      or abs(v_doc.discount_amount - coalesce(v_original.discount_amount * v_distributed / nullif((
        select sum(o.distributed_discount_amount) from public.pos_invoice_items o where o.pos_invoice_id = v_doc.return_against
      ), 0), 0)) > v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A return''s discount is not its share of the sale''s.';
    end if;
  elsif v_distributed > v_doc.discount_amount + v_unit
    or (v_doc.apply_discount_on = 'Net Total' and abs(v_distributed - v_doc.discount_amount) > v_unit)
    or (v_doc.additional_discount_percentage > 0 and abs(v_doc.discount_amount - v_doc.additional_discount_percentage / 100
      * case when v_doc.apply_discount_on = 'Net Total' then v_net + v_distributed else v_doc.grand_total + v_doc.discount_amount end) > v_unit) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'The additional discount does not add up.';
  end if;

  -- The totals add up. An inclusive tax, or a discount off the Grand Total, can leave the grand total a few
  -- units off net + tax (the entered prices are kept); the Rounded Total is the grand total at the
  -- currency's smallest coin, or itself.
  if abs(v_doc.net_total - v_net) > v_unit or abs(v_doc.total_taxes_and_charges - v_tax) > v_unit
    or abs(v_doc.grand_total - v_net - v_tax) > 5 * v_unit
    or abs(v_doc.rounding_adjustment - (v_doc.rounded_total - v_doc.grand_total)) > v_unit
    or abs(v_doc.rounding_adjustment) > greatest(1, coalesce((
      select c.smallest_currency_fraction_value from public.currencies c
      where c.merchant_id = v_doc.merchant_id and c.code = v_company.default_currency
    ), 0)) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'The sale''s totals do not add up.';
  end if;

  -- "Only the modes set here will be available when using POS", and for a refund only those with
  -- "Allow in Returns".
  for v_row in
    select r.id, r.amount, m.default_account, pp.id as offered, pp.allow_in_returns
    from public.pos_invoice_payments r
    join public.modes_of_payment m on m.id = r.mode_of_payment_id
    left join public.pos_profile_payments pp on pp.pos_profile_id = v_doc.pos_profile_id and pp.mode_of_payment_id = r.mode_of_payment_id
    where r.pos_invoice_id = p_id
  loop
    if v_row.offered is null then
      raise exception 'payment_method_not_offered' using errcode = '23514', detail = 'The POS Profile does not offer that mode of payment.';
    end if;
    if v_doc.is_return and not v_row.allow_in_returns then
      raise exception 'refund_method_not_allowed' using errcode = '23514', detail = 'That mode of payment is not marked Allow in Returns on the POS Profile.';
    end if;
    if (v_row.amount < 0) is distinct from v_doc.is_return then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A sale is paid in; a return is paid out.';
    end if;
    v_paid := v_paid + v_row.amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.default_account, 'amount', v_row.amount);
    update public.pos_invoice_payments r set account = v_row.default_account where r.id = v_row.id;
  end loop;

  if v_doc.is_return then
    -- The refund is the whole of the return: nothing to hand back, nothing to write off.
    if abs(v_paid - v_doc.rounded_total) > v_unit then
      raise exception 'refund_mismatch' using errcode = '23514', detail = 'The refund is not the return''s total.';
    end if;
  else
    -- "Paid in full, change returned, a small difference written off within the limit."
    v_change := greatest(v_paid - v_doc.rounded_total, 0);
    v_write_off := greatest(v_doc.rounded_total - v_paid, 0);
    if v_write_off > v_profile.write_off_limit then
      raise exception 'underpaid' using errcode = '23514', detail = 'The payments do not cover the total, and the shortfall is over the Write Off Limit.';
    end if;
  end if;
  if abs(v_doc.paid_amount - v_paid) > v_unit or abs(v_doc.change_amount - v_change) > v_unit
    or abs(v_doc.write_off_amount - v_write_off) > v_unit then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'Paid, change and write-off do not match the payments.';
  end if;

  v_gl := v_gl
    -- Change goes back out of the till.
    || jsonb_build_object('account_id', coalesce(v_profile.account_for_change_amount, v_company.default_cash_account), 'amount', -v_change)
    || jsonb_build_object(
      'account_id', coalesce(v_profile.write_off_account, v_company.write_off_account), 'amount', v_write_off)
    -- What rounding added or took: the Rounded Total less net and taxes.
    || jsonb_build_object(
      'account_id', v_company.round_off_account, 'amount', -(v_doc.rounded_total - v_net - v_tax));

  -- An account still missing here is refused by private.post_gl (account_unusable), as an unbalanced voucher is.
  perform private.post_gl(v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_gl);

  update public.pos_invoices set
    posting_date = v_today,
    warehouse = v_warehouse,
    selling_price_list = case when v_doc.is_return then v_original.selling_price_list else v_price_list end,
    tax_category = case when v_doc.is_return then v_original.tax_category else v_profile.tax_category end,
    additional_discount_account = case when v_doc.discount_amount <> 0 then v_additional_account end
  where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_invoices(uuid) from public, anon, authenticated, service_role;

-- 1.9 The RPCs that wrote a cost center (20261012085548_pos_invoice_discounts.sql, 20261014170428_backend_performance.sql,
-- 20261015000059_item_barcodes.sql): the key is no longer read.

create or replace function public.pos_checkout(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_doc public.pos_invoices := jsonb_populate_record(null::public.pos_invoices, payload);
begin
  insert into public.pos_invoices (
    merchant_id, posting_date, pos_profile_id, pos_opening_entry_id, taxes_and_charges, net_total, total_taxes_and_charges,
    grand_total, rounding_adjustment, rounded_total, paid_amount, change_amount, write_off_amount, is_return, return_against,
    apply_discount_on, additional_discount_percentage, discount_amount
  )
  values (
    v_merchant, private.merchant_today(v_merchant), v_doc.pos_profile_id, v_doc.pos_opening_entry_id, v_doc.taxes_and_charges,
    coalesce(v_doc.net_total, 0), coalesce(v_doc.total_taxes_and_charges, 0), coalesce(v_doc.grand_total, 0),
    coalesce(v_doc.rounding_adjustment, 0), coalesce(v_doc.rounded_total, 0), coalesce(v_doc.paid_amount, 0),
    coalesce(v_doc.change_amount, 0), coalesce(v_doc.write_off_amount, 0), v_doc.return_against is not null, v_doc.return_against,
    coalesce(v_doc.apply_discount_on, 'Grand Total'), coalesce(v_doc.additional_discount_percentage, 0),
    coalesce(v_doc.discount_amount, 0)
  )
  returning id into v_id;

  insert into public.pos_invoice_items (
    merchant_id, pos_invoice_id, idx, item_id, qty, uom_id, conversion_factor, stock_qty, price_list_rate, rate, amount,
    net_rate, net_amount, item_tax_template_id, return_against_item,
    discount_percentage, discount_amount, distributed_discount_amount, pricing_rule_id
  )
  select
    v_merchant, v_id, t.ordinality, t.item_id, t.qty, t.uom_id, t.conversion_factor, t.stock_qty, coalesce(t.price_list_rate, 0),
    t.rate, t.amount, t.net_rate, t.net_amount, t.item_tax_template_id, t.return_against_item,
    coalesce(t.discount_percentage, 0), coalesce(t.discount_amount, 0), coalesce(t.distributed_discount_amount, 0), t.pricing_rule_id
  from jsonb_populate_recordset(null::public.pos_invoice_items, coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_taxes (
    merchant_id, pos_invoice_id, idx, charge_type, account_head, description, rate, row_id, included_in_print_rate,
    tax_amount, total, item_wise_tax_detail
  )
  select
    v_merchant, v_id, t.ordinality, t.charge_type, t.account_head, t.description, coalesce(t.rate, 0), t.row_id,
    coalesce(t.included_in_print_rate, false), coalesce(t.tax_amount, 0), coalesce(t.total, 0),
    coalesce(t.item_wise_tax_detail, '[]'::jsonb)
  from jsonb_populate_recordset(null::public.pos_invoice_taxes, coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_payments (merchant_id, pos_invoice_id, idx, mode_of_payment_id, amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, t.amount
  from jsonb_populate_recordset(null::public.pos_invoice_payments, coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Invoice', v_id);
  return v_id;
end;
$$;

revoke execute on function public.pos_checkout(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pos_checkout(jsonb) to authenticated;

create or replace function public.save_item(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_rate numeric := nullif(payload ->> 'standard_rate', '')::numeric;
  v_list uuid;
begin
  if v_id is null then
    insert into public.items (
      merchant_id, item_code, item_name, item_group_id, stock_uom, description, brand_id, disabled, is_stock_item,
      valuation_method, allow_negative_stock, reorder_level, sales_uom,
      default_warehouse, default_price_list, income_account, expense_account,
      max_discount, discount_account, barcode
    )
    values (
      v_merchant,
      payload ->> 'item_code',
      payload ->> 'item_name',
      (payload ->> 'item_group_id')::uuid,
      (payload ->> 'stock_uom')::uuid,
      nullif(btrim(payload ->> 'description'), ''),
      nullif(payload ->> 'brand_id', '')::uuid,
      coalesce((payload ->> 'disabled')::boolean, false),
      coalesce((payload ->> 'is_stock_item')::boolean, true),
      nullif(payload ->> 'valuation_method', ''),
      coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      nullif(payload ->> 'reorder_level', '')::numeric,
      nullif(payload ->> 'sales_uom', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid,
      coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      nullif(payload ->> 'discount_account', '')::uuid,
      nullif(btrim(payload ->> 'barcode'), '')
    )
    returning id into v_id;

    if coalesce(v_rate, 0) > 0 then
      select s.default_price_list into v_list from public.selling_settings s where s.merchant_id = v_merchant;
      if v_list is null then
        raise exception 'no_default_price_list' using errcode = '23514',
          detail = 'Selling Settings names no default price list for the Standard Selling Rate.';
      end if;

      insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
      values (v_merchant, v_id, v_list, (payload ->> 'stock_uom')::uuid, v_rate);
    end if;
  else
    update public.items set
      item_name = payload ->> 'item_name',
      item_group_id = (payload ->> 'item_group_id')::uuid,
      stock_uom = (payload ->> 'stock_uom')::uuid,
      description = nullif(btrim(payload ->> 'description'), ''),
      brand_id = nullif(payload ->> 'brand_id', '')::uuid,
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      is_stock_item = coalesce((payload ->> 'is_stock_item')::boolean, true),
      valuation_method = nullif(payload ->> 'valuation_method', ''),
      allow_negative_stock = coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      reorder_level = nullif(payload ->> 'reorder_level', '')::numeric,
      sales_uom = nullif(payload ->> 'sales_uom', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid,
      max_discount = coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      discount_account = nullif(payload ->> 'discount_account', '')::uuid,
      -- A payload without the key (a build from before the column) keeps the saved one.
      barcode = case when payload ? 'barcode' then nullif(btrim(payload ->> 'barcode'), '') else barcode end
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;

    -- A saved item's rows are replaced; a new one has none to clear.
    delete from public.item_uoms where item_id = v_id;
    delete from public.item_taxes where item_id = v_id;
  end if;

  insert into public.item_uoms (merchant_id, item_id, idx, uom_id, conversion_factor)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'uom_id')::uuid, (r.value ->> 'conversion_factor')::numeric
  from jsonb_array_elements(coalesce(payload -> 'uoms', '[]'::jsonb)) with ordinality as r (value, idx);

  insert into public.item_taxes (merchant_id, item_id, idx, item_tax_template_id, tax_category_id, valid_from)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item(jsonb) to authenticated;

create or replace function public.save_item_group(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.item_groups (
      merchant_id, item_group_name, parent_id, is_group,
      default_price_list, default_warehouse, income_account, expense_account
    )
    values (
      v_merchant,
      btrim(payload ->> 'item_group_name'),
      nullif(payload ->> 'parent_id', '')::uuid,
      coalesce((payload ->> 'is_group')::boolean, false),
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid
    )
    returning id into v_id;
  else
    update public.item_groups set
      item_group_name = btrim(payload ->> 'item_group_name'),
      parent_id = nullif(payload ->> 'parent_id', '')::uuid,
      is_group = coalesce((payload ->> 'is_group')::boolean, false),
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_group_not_found' using errcode = 'P0002';
    end if;

    delete from public.item_group_taxes where item_group_id = v_id;
  end if;

  insert into public.item_group_taxes (
    merchant_id, item_group_id, idx, item_tax_template_id, tax_category_id, valid_from, minimum_net_rate, maximum_net_rate
  )
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date,
    coalesce(nullif(r.value ->> 'minimum_net_rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'maximum_net_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item_group(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_group(jsonb) to authenticated;

create or replace function public.save_pos_profile(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_row public.pos_profiles;
begin
  v_row := jsonb_populate_record(null::public.pos_profiles, jsonb_strip_nulls(jsonb_build_object(
    'pos_profile_name', btrim(payload ->> 'pos_profile_name'),
    'disabled', coalesce((payload ->> 'disabled')::boolean, false),
    'warehouse', nullif(payload ->> 'warehouse', ''),
    'selling_price_list', nullif(payload ->> 'selling_price_list', ''),
    'taxes_and_charges', nullif(payload ->> 'taxes_and_charges', ''),
    'tax_category', nullif(payload ->> 'tax_category', ''),
    'print_format', nullif(payload ->> 'print_format', ''),
    'letter_head', nullif(payload ->> 'letter_head', ''),
    'account_for_change_amount', nullif(payload ->> 'account_for_change_amount', ''),
    'write_off_account', nullif(payload ->> 'write_off_account', ''),
    'write_off_limit', coalesce(nullif(payload ->> 'write_off_limit', '')::numeric, 0),
    'income_account', nullif(payload ->> 'income_account', ''),
    'expense_account', nullif(payload ->> 'expense_account', ''),
    'hide_unavailable_items', coalesce((payload ->> 'hide_unavailable_items')::boolean, false),
    'allow_rate_change', coalesce((payload ->> 'allow_rate_change')::boolean, false),
    'set_grand_total_to_default_mop', coalesce((payload ->> 'set_grand_total_to_default_mop')::boolean, true),
    'print_receipt_on_order_complete', coalesce((payload ->> 'print_receipt_on_order_complete')::boolean, false),
    'apply_discount_on', coalesce(nullif(payload ->> 'apply_discount_on', ''), 'Grand Total'),
    'allow_discount_change', coalesce((payload ->> 'allow_discount_change')::boolean, false),
    'ignore_pricing_rule', coalesce((payload ->> 'ignore_pricing_rule')::boolean, false),
    'discount_account', nullif(payload ->> 'discount_account', '')
  )));

  if v_id is null then
    insert into public.pos_profiles (
      merchant_id, pos_profile_name, disabled, warehouse, selling_price_list, taxes_and_charges, tax_category, print_format,
      letter_head, account_for_change_amount, write_off_account, write_off_limit, income_account,
      expense_account, hide_unavailable_items, allow_rate_change, set_grand_total_to_default_mop,
      print_receipt_on_order_complete, apply_discount_on, allow_discount_change, ignore_pricing_rule, discount_account
    )
    values (
      v_merchant, v_row.pos_profile_name, v_row.disabled, v_row.warehouse, v_row.selling_price_list, v_row.taxes_and_charges,
      v_row.tax_category, v_row.print_format, v_row.letter_head, v_row.account_for_change_amount, v_row.write_off_account,
      v_row.write_off_limit, v_row.income_account, v_row.expense_account,
      v_row.hide_unavailable_items, v_row.allow_rate_change, v_row.set_grand_total_to_default_mop,
      v_row.print_receipt_on_order_complete, v_row.apply_discount_on, v_row.allow_discount_change, v_row.ignore_pricing_rule,
      v_row.discount_account
    )
    returning id into v_id;
  else
    update public.pos_profiles set
      pos_profile_name = v_row.pos_profile_name,
      disabled = v_row.disabled,
      warehouse = v_row.warehouse,
      selling_price_list = v_row.selling_price_list,
      taxes_and_charges = v_row.taxes_and_charges,
      tax_category = v_row.tax_category,
      print_format = v_row.print_format,
      letter_head = v_row.letter_head,
      account_for_change_amount = v_row.account_for_change_amount,
      write_off_account = v_row.write_off_account,
      write_off_limit = v_row.write_off_limit,
      income_account = v_row.income_account,
      expense_account = v_row.expense_account,
      hide_unavailable_items = v_row.hide_unavailable_items,
      allow_rate_change = v_row.allow_rate_change,
      set_grand_total_to_default_mop = v_row.set_grand_total_to_default_mop,
      print_receipt_on_order_complete = v_row.print_receipt_on_order_complete,
      apply_discount_on = v_row.apply_discount_on,
      allow_discount_change = v_row.allow_discount_change,
      ignore_pricing_rule = v_row.ignore_pricing_rule,
      discount_account = v_row.discount_account
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'pos_profile_not_found' using errcode = 'P0002';
    end if;

    delete from public.pos_profile_users where pos_profile_id = v_id;
    delete from public.pos_profile_payments where pos_profile_id = v_id;
    delete from public.pos_profile_item_groups where pos_profile_id = v_id;
  end if;

  insert into public.pos_profile_users (merchant_id, pos_profile_id, idx, member_id, is_default)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'member_id')::uuid, coalesce((r.value ->> 'is_default')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'users', '[]'::jsonb)) with ordinality as r (value, idx);

  insert into public.pos_profile_payments (merchant_id, pos_profile_id, idx, mode_of_payment_id, is_default, allow_in_returns)
  select
    v_merchant, v_id, r.idx::integer, (r.value ->> 'mode_of_payment_id')::uuid,
    coalesce((r.value ->> 'is_default')::boolean, false), coalesce((r.value ->> 'allow_in_returns')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as r (value, idx);

  insert into public.pos_profile_item_groups (merchant_id, pos_profile_id, idx, item_group_id)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'item_group_id')::uuid
  from jsonb_array_elements(coalesce(payload -> 'item_groups', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_pos_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_pos_profile(jsonb) to authenticated;

create or replace function public.save_sales_tax_template(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.sales_tax_templates (merchant_id, title, is_default, disabled, tax_category_id)
    values (
      v_merchant,
      btrim(payload ->> 'title'),
      coalesce((payload ->> 'is_default')::boolean, false),
      coalesce((payload ->> 'disabled')::boolean, false),
      nullif(payload ->> 'tax_category_id', '')::uuid
    )
    returning id into v_id;
  else
    update public.sales_tax_templates set
      title = btrim(payload ->> 'title'),
      is_default = coalesce((payload ->> 'is_default')::boolean, false),
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      tax_category_id = nullif(payload ->> 'tax_category_id', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;

    delete from public.sales_tax_template_rows where template_id = v_id;
  end if;

  insert into public.sales_tax_template_rows (
    merchant_id, template_id, idx, charge_type, account, description, rate, tax_amount, row_id, included_in_print_rate
  )
  select
    v_merchant, v_id, r.idx::integer,
    r.value ->> 'charge_type',
    (r.value ->> 'account')::uuid,
    btrim(r.value ->> 'description'),
    coalesce(nullif(r.value ->> 'rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'tax_amount', '')::numeric, 0),
    nullif(r.value ->> 'row_id', '')::integer,
    coalesce((r.value ->> 'included_in_print_rate')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_sales_tax_template(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_sales_tax_template(jsonb) to authenticated;

create or replace function public.save_stock_entry(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_entries (merchant_id, posting_date, purpose, from_warehouse, to_warehouse, difference_account)
    values (
      v_merchant,
      v_date,
      payload ->> 'purpose',
      nullif(payload ->> 'from_warehouse', '')::uuid,
      nullif(payload ->> 'to_warehouse', '')::uuid,
      nullif(payload ->> 'difference_account', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_entries set
      posting_date = v_date,
      purpose = payload ->> 'purpose',
      from_warehouse = nullif(payload ->> 'from_warehouse', '')::uuid,
      to_warehouse = nullif(payload ->> 'to_warehouse', '')::uuid,
      difference_account = nullif(payload ->> 'difference_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'stock_entry_not_found' using errcode = 'P0002';
    end if;

    delete from public.stock_entry_items where stock_entry_id = v_id;
  end if;

  insert into public.stock_entry_items (merchant_id, stock_entry_id, idx, item_id, qty, basic_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'qty')::numeric,
    nullif(r.value ->> 'basic_rate', '')::numeric
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_stock_entry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stock_entry(jsonb) to authenticated;

create or replace function public.save_stock_reconciliation(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_reconciliations (merchant_id, posting_date, purpose, difference_account)
    values (
      v_merchant,
      v_date,
      coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      nullif(payload ->> 'difference_account', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_reconciliations set
      posting_date = v_date,
      purpose = coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      difference_account = nullif(payload ->> 'difference_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'stock_reconciliation_not_found' using errcode = 'P0002';
    end if;

    delete from public.stock_reconciliation_items where stock_reconciliation_id = v_id;
  end if;

  insert into public.stock_reconciliation_items (merchant_id, stock_reconciliation_id, idx, item_id, warehouse_id, qty, valuation_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'warehouse_id')::uuid,
    (r.value ->> 'qty')::numeric,
    coalesce(nullif(r.value ->> 'valuation_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_stock_reconciliation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stock_reconciliation(jsonb) to authenticated;

-- 1.10 Joining someone else's store (20261013213537_access_codes.sql) — invoker, as before: it tests current_user.

create or replace function private.require_access_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    raise exception 'access_code_required' using errcode = '42501',
      detail = 'People join a store by using one of its access codes.';
  end if;

  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.merchant_id is distinct from old.merchant_id) then
    raise exception 'member_locked' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.require_access_request() from public, anon, authenticated, service_role;


-- 2. The triggers whose UPDATE OF lists name a column that goes: Postgres records a dependency on each listed
-- column, so the column cannot be dropped while they name it.

drop trigger if exists merchants_validate_accounts on public.merchants;
create trigger merchants_validate_accounts
  before insert or update of
    default_cash_account, default_bank_account, default_income_account, default_expense_account,
    write_off_account, round_off_account, default_inventory_account,
    stock_adjustment_account, stock_received_but_not_billed, expenses_included_in_valuation
  on public.merchants
  for each row execute function private.validate_company_accounts();

drop trigger if exists sales_tax_template_rows_validate_account on public.sales_tax_template_rows;
create trigger sales_tax_template_rows_validate_account
  before insert or update of account on public.sales_tax_template_rows
  for each row execute function private.validate_tax_account();

drop trigger if exists brands_validate_defaults on public.brands;
create trigger brands_validate_defaults
  before insert or update of default_warehouse, default_price_list, income_account on public.brands
  for each row execute function private.validate_defaults();

drop trigger if exists item_groups_validate_defaults on public.item_groups;
create trigger item_groups_validate_defaults
  before insert or update of default_price_list, default_warehouse, income_account, expense_account on public.item_groups
  for each row execute function private.validate_defaults();

drop trigger if exists items_validate_defaults on public.items;
create trigger items_validate_defaults
  before insert or update of stock_uom, default_warehouse, default_price_list, income_account, expense_account on public.items
  for each row execute function private.validate_defaults();


-- 3. Every column that names a cost center: its foreign key, its index, then the column.

alter table public.merchants
  drop constraint if exists merchants_cost_center_fk,
  drop constraint if exists merchants_round_off_cost_center_fk,
  drop column if exists cost_center,
  drop column if exists round_off_cost_center;

alter table public.sales_tax_template_rows drop constraint if exists sales_tax_template_rows_cost_center_fk;
drop index if exists public.sales_tax_template_rows_cost_center_idx;
alter table public.sales_tax_template_rows drop column if exists cost_center;

alter table public.brands drop constraint if exists brands_cost_center_fk;
drop index if exists public.brands_cost_center_idx;
alter table public.brands drop column if exists selling_cost_center;

alter table public.item_groups drop constraint if exists item_groups_cost_center_fk;
drop index if exists public.item_groups_cost_center_idx;
alter table public.item_groups drop column if exists selling_cost_center;

alter table public.items drop constraint if exists items_cost_center_fk;
drop index if exists public.items_cost_center_idx;
alter table public.items drop column if exists selling_cost_center;

alter table public.gl_entries drop constraint if exists gl_entries_cost_center_fk;
drop index if exists public.gl_entries_cost_center_idx;
alter table public.gl_entries drop column if exists cost_center_id;

alter table public.stock_reconciliations drop constraint if exists stock_reconciliations_cost_center_fk;
drop index if exists public.stock_reconciliations_cost_center_idx;
alter table public.stock_reconciliations drop column if exists cost_center;

alter table public.stock_entries drop constraint if exists stock_entries_cost_center_fk;
drop index if exists public.stock_entries_cost_center_idx;
alter table public.stock_entries drop column if exists cost_center;

alter table public.pos_profiles
  drop constraint if exists pos_profiles_write_off_cost_center_fk,
  drop constraint if exists pos_profiles_cost_center_fk;
drop index if exists public.pos_profiles_write_off_cost_center_idx;
drop index if exists public.pos_profiles_cost_center_idx;
alter table public.pos_profiles
  drop column if exists write_off_cost_center,
  drop column if exists cost_center;

alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_cost_center_fk;
drop index if exists public.pos_invoice_items_cost_center_idx;
alter table public.pos_invoice_items drop column if exists cost_center;

alter table public.pos_invoice_taxes drop constraint if exists pos_invoice_taxes_cost_center_fk;
drop index if exists public.pos_invoice_taxes_cost_center_idx;
alter table public.pos_invoice_taxes drop column if exists cost_center;


-- 4. The Cost Center doctype: what each permission reached on it, then its registry row.

delete from public.permission_rules where doctype = 'Cost Center';
delete from public.doctypes where name = 'Cost Center';


-- 5. The table itself — its policies, its tree trigger, its indexes and its own parent key go with it.

drop table if exists public.cost_centers;


-- 6. The Abbreviation.

alter table public.merchants
  drop constraint if exists merchants_abbr_shape,
  drop column if exists abbr;


-- 7. What the database tells a person: a store, not a system or a company.

update public.permissions
set label = 'Store & Calendar', description = 'The store, its fiscal years, currency and defaults.'
where key = 'manage_company';

update public.permissions
set description = 'Chart of accounts, modes of payment and Accounts Settings.'
where key = 'manage_accounting';

-- Only the description the seed wrote: one the owner has edited stays theirs.
update public.roles
set description = 'Every permission in the store.'
where role_name = 'Store Manager' and description = 'Every permission in the system.';
