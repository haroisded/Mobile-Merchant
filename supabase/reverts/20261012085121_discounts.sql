-- Revert of supabase/migrations/20261012085121_discounts.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every Pricing Rule with its rows, and its rules in role_permissions; each item's Max
-- Discount and Discount Account; each POS Profile's four discount fields; the Company's Default Discount
-- Account. The seeded Sales Discounts Allowed ledger stays in each chart — it may carry entries. Regenerate
-- src/lib/database.types.ts afterwards — the Item, POS Profile, Company and Pricing Rules screens read these.
--
-- Fails while 20261012085548_pos_invoice_discounts.sql is in place (a sale's line names its Pricing Rule):
-- revert that one first.

drop function if exists public.save_pricing_rule(jsonb);

-- Policies go with their tables.
drop table if exists public.pricing_rule_targets;
drop table if exists public.pricing_rules;

-- Cascades to the standard_role_permissions and role_permissions rows naming it.
delete from public.doctypes where name = 'Pricing Rule';

-- public.save_item() as 20261011134357_item_prices.sql made it.
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
      default_warehouse, default_price_list, selling_cost_center, income_account, expense_account
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
      nullif(payload ->> 'expense_account', '')::uuid
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
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
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

-- public.save_pos_profile() as 20261011233916_pos_profiles.sql made it.
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
    'print_receipt_on_order_complete', coalesce((payload ->> 'print_receipt_on_order_complete')::boolean, false)
  )));

  if v_id is null then
    insert into public.pos_profiles (
      merchant_id, pos_profile_name, disabled, warehouse, selling_price_list, taxes_and_charges, tax_category, print_format,
      letter_head, account_for_change_amount, write_off_account, write_off_cost_center, write_off_limit, income_account,
      expense_account, cost_center, hide_unavailable_items, allow_rate_change, set_grand_total_to_default_mop,
      print_receipt_on_order_complete
    )
    values (
      v_merchant, v_row.pos_profile_name, v_row.disabled, v_row.warehouse, v_row.selling_price_list, v_row.taxes_and_charges,
      v_row.tax_category, v_row.print_format, v_row.letter_head, v_row.account_for_change_amount, v_row.write_off_account,
      v_row.write_off_cost_center, v_row.write_off_limit, v_row.income_account, v_row.expense_account, v_row.cost_center,
      v_row.hide_unavailable_items, v_row.allow_rate_change, v_row.set_grand_total_to_default_mop,
      v_row.print_receipt_on_order_complete
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
      print_receipt_on_order_complete = v_row.print_receipt_on_order_complete
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

drop trigger if exists merchants_seed_52_discounts on public.merchants;
drop function if exists private.seed_discounts();
drop function if exists private.seed_discounts_for(uuid);

drop trigger if exists merchants_validate_discount_account on public.merchants;
drop trigger if exists items_validate_discount_account on public.items;
drop trigger if exists pos_profiles_validate_discount_account on public.pos_profiles;
drop function if exists private.validate_discount_account();

-- Each column's constraints and index go with it.
alter table public.pos_profiles
  drop column if exists apply_discount_on,
  drop column if exists allow_discount_change,
  drop column if exists ignore_pricing_rule,
  drop column if exists discount_account;

alter table public.items
  drop column if exists max_discount,
  drop column if exists discount_account;

alter table public.merchants drop column if exists default_discount_account;
