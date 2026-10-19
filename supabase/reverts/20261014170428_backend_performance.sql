-- Revert of the backend-performance migration (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- Destroys no data: function bodies, three indexes and two tables' storage settings. The nine functions are
-- put back exactly as the database held them before (as pg_dump prints them); their signatures never changed,
-- so src/lib/database.types.ts does not move.


-- 4 and 3. The save RPCs and the number cards, as they were.
CREATE OR REPLACE FUNCTION public.save_stock_reconciliation(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_reconciliations (merchant_id, posting_date, purpose, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_reconciliations set
      posting_date = v_date,
      purpose = coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'stock_reconciliation_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_reconciliation_items where stock_reconciliation_id = v_id;

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


CREATE OR REPLACE FUNCTION public.save_stock_entry(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_entries (merchant_id, posting_date, purpose, from_warehouse, to_warehouse, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      payload ->> 'purpose',
      nullif(payload ->> 'from_warehouse', '')::uuid,
      nullif(payload ->> 'to_warehouse', '')::uuid,
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_entries set
      posting_date = v_date,
      purpose = payload ->> 'purpose',
      from_warehouse = nullif(payload ->> 'from_warehouse', '')::uuid,
      to_warehouse = nullif(payload ->> 'to_warehouse', '')::uuid,
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'stock_entry_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_entry_items where stock_entry_id = v_id;

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


CREATE OR REPLACE FUNCTION public.save_sales_tax_template(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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
  end if;

  delete from public.sales_tax_template_rows where template_id = v_id;

  insert into public.sales_tax_template_rows (
    merchant_id, template_id, idx, charge_type, account, description, rate, tax_amount, row_id, included_in_print_rate, cost_center
  )
  select
    v_merchant, v_id, r.idx::integer,
    r.value ->> 'charge_type',
    (r.value ->> 'account')::uuid,
    btrim(r.value ->> 'description'),
    coalesce(nullif(r.value ->> 'rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'tax_amount', '')::numeric, 0),
    nullif(r.value ->> 'row_id', '')::integer,
    coalesce((r.value ->> 'included_in_print_rate')::boolean, false),
    nullif(r.value ->> 'cost_center', '')::uuid
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_sales_tax_template(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_sales_tax_template(jsonb) to authenticated;


CREATE OR REPLACE FUNCTION public.save_pricing_rule(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


CREATE OR REPLACE FUNCTION public.save_pos_profile(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


CREATE OR REPLACE FUNCTION public.save_item_tax_template(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.item_tax_templates (merchant_id, title, disabled)
    values (v_merchant, btrim(payload ->> 'title'), coalesce((payload ->> 'disabled')::boolean, false))
    returning id into v_id;
  else
    update public.item_tax_templates set
      title = btrim(payload ->> 'title'),
      disabled = coalesce((payload ->> 'disabled')::boolean, false)
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_tax_template_rows where template_id = v_id;

  insert into public.item_tax_template_rows (merchant_id, template_id, idx, account, tax_rate, not_applicable)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'account')::uuid,
    coalesce(nullif(r.value ->> 'tax_rate', '')::numeric, 0),
    coalesce((r.value ->> 'not_applicable')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item_tax_template(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_tax_template(jsonb) to authenticated;


CREATE OR REPLACE FUNCTION public.save_item_group(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.item_groups (
      merchant_id, item_group_name, parent_id, is_group,
      default_price_list, default_warehouse, selling_cost_center, income_account, expense_account
    )
    values (
      v_merchant,
      btrim(payload ->> 'item_group_name'),
      nullif(payload ->> 'parent_id', '')::uuid,
      coalesce((payload ->> 'is_group')::boolean, false),
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'selling_cost_center', '')::uuid,
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
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_group_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_group_taxes where item_group_id = v_id;

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


CREATE OR REPLACE FUNCTION public.save_item(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


CREATE OR REPLACE FUNCTION public.dashboard_cards(p_merchant uuid, p_from date, p_to date) RETURNS TABLE(sales numeric, invoices bigint, gross_profit numeric, open_registers bigint, expected_cash numeric, low_stock bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with sold as (
    select i.id, i.net_total, i.is_return
    from public.pos_invoices i
    where i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date between p_from and p_to
  ),
  open_sessions as (
    select s.id
    from public.pos_opening_entries s
    where s.merchant_id = p_merchant and s.docstatus = 1 and s.status = 'Open'
  ),
  session_sales as (
    select i.id, i.change_amount
    from public.pos_invoices i
    where i.pos_opening_entry_id in (select o.id from open_sessions o) and i.docstatus = 1
  )
  select
    coalesce((select sum(s.net_total) from sold s), 0),
    (select count(*) from sold s where not s.is_return),
    case
      when p_merchant in (select private.permitted_merchant_ids('Stock Ledger Entry', 'read')) then
        coalesce((
          select sum(r.net_amount - coalesce(r.valuation_rate, 0) * r.stock_qty)
          from public.pos_invoice_items r
          where r.pos_invoice_id in (select s.id from sold s)
        ), 0)
    end,
    (select count(*) from open_sessions),
    coalesce((
      select sum(b.opening_amount)
      from public.pos_opening_entry_balances b
      join public.modes_of_payment m on m.id = b.mode_of_payment_id
      where b.pos_opening_entry_id in (select o.id from open_sessions o) and m.type = 'Cash'
    ), 0)
    + coalesce((
      select sum(p.amount)
      from public.pos_invoice_payments p
      join public.modes_of_payment m on m.id = p.mode_of_payment_id
      where p.pos_invoice_id in (select x.id from session_sales x) and m.type = 'Cash'
    ), 0)
    - coalesce((
      select sum(x.change_amount)
      from session_sales x
      where x.change_amount > 0 and exists (
        select 1
        from public.pos_invoice_payments p
        join public.modes_of_payment m on m.id = p.mode_of_payment_id
        where p.pos_invoice_id = x.id and m.type = 'Cash'
      )
    ), 0),
    (select count(distinct a.item_id) from public.stock_alerts(p_merchant, null) a);
$$;

revoke execute on function public.dashboard_cards(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.dashboard_cards(uuid, date, date) to authenticated;


-- 2. The three indexes.
drop index if exists public.notifications_unread_idx;
drop index if exists public.pos_invoices_submitted_date_idx;
drop index if exists public.pos_opening_entries_open_merchant_idx;


-- 1. Storage settings back to Postgres' defaults.
alter table public.naming_series_counters reset (fillfactor, autovacuum_vacuum_scale_factor);
alter table public.bins reset (fillfactor, autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
