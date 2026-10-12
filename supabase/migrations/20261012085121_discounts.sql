-- Step 20 of the ERPNext rebuild, part 1 — what a discount is set up from
-- (.claude/erpnext-docs/POS-System-Added-Features.md 20.3–20.5; docs.frappe.io/erpnext/pricing-rule,
-- /discount_accounting, /pos-profile, /applying-discount): the discount accounts, the Item's and the POS
-- Profile's discount fields, and Pricing Rules. The sale that uses them is the next migration,
-- pos_invoice_discounts.

create schema if not exists private;


-- 1. The new fields.

-- 20.5: "falling back to the Company's Default Discount Account".
alter table public.merchants add column if not exists default_discount_account uuid;

alter table public.merchants drop constraint if exists merchants_default_discount_account_fk;
alter table public.merchants add constraint merchants_default_discount_account_fk
  foreign key (default_discount_account, id) references public.accounts (id, merchant_id);

alter table public.items
  -- 20.3, Max Discount (%): the most any line of this item may be discounted. 0: no limit.
  add column if not exists max_discount numeric not null default 0,
  -- 20.5: where this item's discounts post under Discount Accounting.
  add column if not exists discount_account uuid;

alter table public.items drop constraint if exists items_max_discount;
alter table public.items add constraint items_max_discount check (max_discount between 0 and 100);
alter table public.items drop constraint if exists items_discount_account_fk;
alter table public.items add constraint items_discount_account_fk
  foreign key (discount_account, merchant_id) references public.accounts (id, merchant_id);
create index if not exists items_discount_account_idx on public.items (discount_account, merchant_id);

alter table public.pos_profiles
  -- 20.2: what an additional discount is taken from, to start with.
  add column if not exists apply_discount_on text not null default 'Grand Total',
  -- 20.3, Allow User to Edit Discount: a cashier may discount a line, and the sale.
  add column if not exists allow_discount_change boolean not null default false,
  -- 20.4: no Pricing Rule applies at this register.
  add column if not exists ignore_pricing_rule boolean not null default false,
  -- 20.5: where this register's additional discounts post under Discount Accounting.
  add column if not exists discount_account uuid;

alter table public.pos_profiles drop constraint if exists pos_profiles_apply_discount_on;
alter table public.pos_profiles add constraint pos_profiles_apply_discount_on check (apply_discount_on in ('Grand Total', 'Net Total'));
alter table public.pos_profiles drop constraint if exists pos_profiles_discount_account_fk;
alter table public.pos_profiles add constraint pos_profiles_discount_account_fk
  foreign key (discount_account, merchant_id) references public.accounts (id, merchant_id);
create index if not exists pos_profiles_discount_account_idx on public.pos_profiles (discount_account, merchant_id);


-- 2. One check for every discount account — the Company's, an Item's, a POS Profile's: an enabled Income
-- or Expense ledger of the same system. The column is the trigger's argument; the system is `merchant_id`,
-- or `id` on merchants itself.
-- Rejected: a branch in private.validate_company_accounts(), validate_defaults() and validate_pos_profile()
-- each — three functions re-created for one column.
create or replace function private.validate_discount_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text := tg_argv[0];
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_id uuid := (v_new ->> v_column)::uuid;
begin
  if v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column) then
    return new;
  end if;

  if not exists (
    select 1 from public.accounts a
    where a.id = v_id and a.merchant_id = coalesce(v_new ->> 'merchant_id', v_new ->> 'id')::uuid
      and not a.is_group and not a.disabled and a.root_type in ('Income', 'Expense')
  ) then
    raise exception 'default_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_discount_account() from public, anon, authenticated, service_role;

drop trigger if exists merchants_validate_discount_account on public.merchants;
create trigger merchants_validate_discount_account
  before insert or update of default_discount_account on public.merchants
  for each row execute function private.validate_discount_account('default_discount_account');

drop trigger if exists items_validate_discount_account on public.items;
create trigger items_validate_discount_account
  before insert or update of discount_account on public.items
  for each row execute function private.validate_discount_account('discount_account');

drop trigger if exists pos_profiles_validate_discount_account on public.pos_profiles;
create trigger pos_profiles_validate_discount_account
  before insert or update of discount_account on public.pos_profiles
  for each row execute function private.validate_discount_account('discount_account');


-- 3. 20.5: "A new system gets a Sales Discounts Allowed ledger under Indirect Expenses as that default."
-- After the chart (merchants_seed_40_accounting) and the other default accounts (…_50_…), so 52.
create or replace function private.seed_discounts_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_parent uuid;
  v_account uuid;
begin
  select a.id into v_parent from public.accounts a
  where a.merchant_id = p_merchant and a.account_name = 'Indirect Expenses' and a.is_group and a.root_type = 'Expense';
  -- A chart that no longer has that group keeps the default it has, or none.
  if v_parent is null then
    return;
  end if;

  v_account := private.seed_account(p_merchant, 'Sales Discounts Allowed', v_parent, false, 'Expense', null);

  -- An account of that name the system already made, and made a group or disabled, is not forced in.
  update public.merchants m set default_discount_account = v_account
  where m.id = p_merchant and m.default_discount_account is null
    and exists (select 1 from public.accounts a where a.id = v_account and not a.is_group and not a.disabled and a.root_type = 'Expense');
end;
$$;

revoke execute on function private.seed_discounts_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_discounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_discounts_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_discounts() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_52_discounts on public.merchants;
create trigger merchants_seed_52_discounts
  after insert on public.merchants
  for each row execute function private.seed_discounts();

-- The systems that exist.
select private.seed_discounts_for(m.id) from public.merchants m;


-- 4. An item with its rows (20261011134357_item_prices.sql), now with Max Discount and its Discount Account.
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
      default_warehouse, default_price_list, selling_cost_center, income_account, expense_account,
      max_discount, discount_account
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
      nullif(payload ->> 'selling_cost_center', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid,
      coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      nullif(payload ->> 'discount_account', '')::uuid
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
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid,
      max_discount = coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      discount_account = nullif(payload ->> 'discount_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_uoms where item_id = v_id;

  insert into public.item_uoms (merchant_id, item_id, idx, uom_id, conversion_factor)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'uom_id')::uuid, (r.value ->> 'conversion_factor')::numeric
  from jsonb_array_elements(coalesce(payload -> 'uoms', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.item_taxes where item_id = v_id;

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


-- 5. A POS Profile with its rows (20261011233916_pos_profiles.sql), now with its four discount fields.
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
    'write_off_cost_center', nullif(payload ->> 'write_off_cost_center', ''),
    'write_off_limit', coalesce(nullif(payload ->> 'write_off_limit', '')::numeric, 0),
    'income_account', nullif(payload ->> 'income_account', ''),
    'expense_account', nullif(payload ->> 'expense_account', ''),
    'cost_center', nullif(payload ->> 'cost_center', ''),
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
      letter_head, account_for_change_amount, write_off_account, write_off_cost_center, write_off_limit, income_account,
      expense_account, cost_center, hide_unavailable_items, allow_rate_change, set_grand_total_to_default_mop,
      print_receipt_on_order_complete, apply_discount_on, allow_discount_change, ignore_pricing_rule, discount_account
    )
    values (
      v_merchant, v_row.pos_profile_name, v_row.disabled, v_row.warehouse, v_row.selling_price_list, v_row.taxes_and_charges,
      v_row.tax_category, v_row.print_format, v_row.letter_head, v_row.account_for_change_amount, v_row.write_off_account,
      v_row.write_off_cost_center, v_row.write_off_limit, v_row.income_account, v_row.expense_account, v_row.cost_center,
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
      write_off_cost_center = v_row.write_off_cost_center,
      write_off_limit = v_row.write_off_limit,
      income_account = v_row.income_account,
      expense_account = v_row.expense_account,
      cost_center = v_row.cost_center,
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
  end if;

  delete from public.pos_profile_users where pos_profile_id = v_id;
  insert into public.pos_profile_users (merchant_id, pos_profile_id, idx, member_id, is_default)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'member_id')::uuid, coalesce((r.value ->> 'is_default')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'users', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.pos_profile_payments where pos_profile_id = v_id;
  insert into public.pos_profile_payments (merchant_id, pos_profile_id, idx, mode_of_payment_id, is_default, allow_in_returns)
  select
    v_merchant, v_id, r.idx::integer, (r.value ->> 'mode_of_payment_id')::uuid,
    coalesce((r.value ->> 'is_default')::boolean, false), coalesce((r.value ->> 'allow_in_returns')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.pos_profile_item_groups where pos_profile_id = v_id;
  insert into public.pos_profile_item_groups (merchant_id, pos_profile_id, idx, item_group_id)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'item_group_id')::uuid
  from jsonb_array_elements(coalesce(payload -> 'item_groups', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_pos_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_pos_profile(jsonb) to authenticated;


-- 6. Pricing Rule (20.4): "Automatic price discount." A rule names what it applies on in its rows — items,
-- item groups (a group covers the groups under it) or brands — and gives one of three results.
-- Out of scope: Apply On Transaction, a customer or territory, free items, margins, coupons, promotional
-- schemes, mixed conditions.

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  title text not null,
  -- What its rows in pricing_rule_targets are.
  apply_on text not null default 'Item Code',
  -- A line's quantity in the item's stock unit, as ERPNext counts it. A max of 0 is no upper limit.
  min_qty numeric not null default 0,
  max_qty numeric not null default 0,
  -- A line's quantity × Price List Rate. A max of 0 is no upper limit.
  min_amt numeric not null default 0,
  max_amt numeric not null default 0,
  valid_from date,
  valid_upto date,
  -- Empty: any price list.
  for_price_list uuid,
  -- 1 is the highest, as a Tax Rule's reads (the human's decision of 2026-10-12). Rejected: ERPNext's
  -- "higher the number, higher the priority" — two screens of one app reading opposite ways.
  priority integer not null default 1,
  disable boolean not null default false,
  -- Which of the three below the rule gives. A Rate is per stock unit; a Discount Amount is per unit sold.
  rate_or_discount text not null default 'Discount Percentage',
  rate numeric not null default 0,
  discount_percentage numeric not null default 0,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now(),

  constraint pricing_rules_id_merchant unique (id, merchant_id),
  constraint pricing_rules_title_unique unique (merchant_id, title),
  constraint pricing_rules_title_length check (length(btrim(title)) between 1 and 140),
  constraint pricing_rules_apply_on check (apply_on in ('Item Code', 'Item Group', 'Brand')),
  constraint pricing_rules_ranges check (
    min_qty >= 0 and max_qty >= 0 and min_amt >= 0 and max_amt >= 0
    and (max_qty = 0 or max_qty >= min_qty) and (max_amt = 0 or max_amt >= min_amt)
  ),
  constraint pricing_rules_dates check (valid_from is null or valid_upto is null or valid_from <= valid_upto),
  constraint pricing_rules_priority check (priority >= 1),
  constraint pricing_rules_result check (
    rate_or_discount in ('Rate', 'Discount Percentage', 'Discount Amount')
    and rate >= 0 and discount_percentage between 0 and 100 and discount_amount >= 0
  ),
  constraint pricing_rules_price_list_fk foreign key (for_price_list, merchant_id) references public.price_lists (id, merchant_id)
);

alter table public.pricing_rules enable row level security;
create index if not exists pricing_rules_price_list_idx on public.pricing_rules (for_price_list, merchant_id);

-- What a rule applies on: exactly one of the three per row. public.save_pricing_rule keeps only the kind the
-- rule's Apply On names.
create table if not exists public.pricing_rule_targets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pricing_rule_id uuid not null,
  idx integer not null,
  item_id uuid,
  item_group_id uuid,
  brand_id uuid,

  constraint pricing_rule_targets_one check (num_nonnulls(item_id, item_group_id, brand_id) = 1),
  constraint pricing_rule_targets_rule_fk foreign key (pricing_rule_id, merchant_id)
    references public.pricing_rules (id, merchant_id) on delete cascade,
  constraint pricing_rule_targets_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id),
  constraint pricing_rule_targets_item_group_fk foreign key (item_group_id, merchant_id) references public.item_groups (id, merchant_id),
  constraint pricing_rule_targets_brand_fk foreign key (brand_id, merchant_id) references public.brands (id, merchant_id)
);

alter table public.pricing_rule_targets enable row level security;
create index if not exists pricing_rule_targets_rule_idx on public.pricing_rule_targets (pricing_rule_id, merchant_id);
create index if not exists pricing_rule_targets_item_idx on public.pricing_rule_targets (item_id, merchant_id);
create index if not exists pricing_rule_targets_item_group_idx on public.pricing_rule_targets (item_group_id, merchant_id);
create index if not exists pricing_rule_targets_brand_idx on public.pricing_rule_targets (brand_id, merchant_id);

-- A rule with its rows, in one transaction. Security invoker: the caller's own Pricing Rule policies decide.
create or replace function public.save_pricing_rule(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_row public.pricing_rules := jsonb_populate_record(null::public.pricing_rules, payload - 'id');
begin
  if v_id is null then
    insert into public.pricing_rules (
      merchant_id, title, apply_on, min_qty, max_qty, min_amt, max_amt, valid_from, valid_upto, for_price_list, priority,
      disable, rate_or_discount, rate, discount_percentage, discount_amount
    )
    values (
      v_merchant, btrim(v_row.title), v_row.apply_on, coalesce(v_row.min_qty, 0), coalesce(v_row.max_qty, 0),
      coalesce(v_row.min_amt, 0), coalesce(v_row.max_amt, 0), v_row.valid_from, v_row.valid_upto, v_row.for_price_list,
      coalesce(v_row.priority, 1), coalesce(v_row.disable, false), v_row.rate_or_discount, coalesce(v_row.rate, 0),
      coalesce(v_row.discount_percentage, 0), coalesce(v_row.discount_amount, 0)
    )
    returning id into v_id;
  else
    update public.pricing_rules set
      title = btrim(v_row.title),
      apply_on = v_row.apply_on,
      min_qty = coalesce(v_row.min_qty, 0),
      max_qty = coalesce(v_row.max_qty, 0),
      min_amt = coalesce(v_row.min_amt, 0),
      max_amt = coalesce(v_row.max_amt, 0),
      valid_from = v_row.valid_from,
      valid_upto = v_row.valid_upto,
      for_price_list = v_row.for_price_list,
      priority = coalesce(v_row.priority, 1),
      disable = coalesce(v_row.disable, false),
      rate_or_discount = v_row.rate_or_discount,
      rate = coalesce(v_row.rate, 0),
      discount_percentage = coalesce(v_row.discount_percentage, 0),
      discount_amount = coalesce(v_row.discount_amount, 0)
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'pricing_rule_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.pricing_rule_targets where pricing_rule_id = v_id;

  -- A row of another kind than the rule's Apply On keeps nothing, and pricing_rule_targets_one refuses it.
  insert into public.pricing_rule_targets (merchant_id, pricing_rule_id, idx, item_id, item_group_id, brand_id)
  select
    v_merchant, v_id, t.ordinality,
    case when v_row.apply_on = 'Item Code' then t.item_id end,
    case when v_row.apply_on = 'Item Group' then t.item_group_id end,
    case when v_row.apply_on = 'Brand' then t.brand_id end
  from jsonb_populate_recordset(null::public.pricing_rule_targets, coalesce(payload -> 'targets', '[]'::jsonb)) with ordinality as t;

  return v_id;
end;
$$;

revoke execute on function public.save_pricing_rule(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_pricing_rule(jsonb) to authenticated;

-- ERPNext's matrix for Pricing Rule: the selling managers keep it; a cashier reads it, because the Register
-- applies it on the device; an Accounts Manager reads it.
insert into public.doctypes (name, table_name, kind, restrictable)
values ('Pricing Rule', 'pricing_rules', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Sales Manager', 'Pricing Rule', true, true, true, true, true),
  ('Sales Master Manager', 'Pricing Rule', true, true, true, true, true),
  ('Sales User', 'Pricing Rule', true, true, false, false, false),
  ('Accounts Manager', 'Pricing Rule', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('pricing_rules', 'Pricing Rule');
select private.apply_doctype_policies('pricing_rule_targets', 'Pricing Rule', true);
