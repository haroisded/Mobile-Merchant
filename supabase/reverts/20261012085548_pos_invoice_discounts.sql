-- Revert of supabase/migrations/20261012085548_pos_invoice_discounts.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: what every sale kept of its discounts — on a line its Discount (%), Discount Amount, its
-- share of the additional discount, its Pricing Rule and the account its discount posted to; on the sale
-- Apply Discount On, the additional discount's percentage and amount, and its account. The sales stay, and
-- so do their ledger entries: a discounted sale's rates, net amounts and totals are still what was posted.
-- Regenerate src/lib/database.types.ts afterwards — the Sell screens read these columns.

-- public.pos_checkout() and private.submit_pos_invoices() as 20261012080419_pos_returns_and_voids.sql made
-- them: no discounts.
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
    grand_total, rounding_adjustment, rounded_total, paid_amount, change_amount, write_off_amount, is_return, return_against
  )
  values (
    v_merchant, private.merchant_today(v_merchant), v_doc.pos_profile_id, v_doc.pos_opening_entry_id, v_doc.taxes_and_charges,
    coalesce(v_doc.net_total, 0), coalesce(v_doc.total_taxes_and_charges, 0), coalesce(v_doc.grand_total, 0),
    coalesce(v_doc.rounding_adjustment, 0), coalesce(v_doc.rounded_total, 0), coalesce(v_doc.paid_amount, 0),
    coalesce(v_doc.change_amount, 0), coalesce(v_doc.write_off_amount, 0), v_doc.return_against is not null, v_doc.return_against
  )
  returning id into v_id;

  insert into public.pos_invoice_items (
    merchant_id, pos_invoice_id, idx, item_id, qty, uom_id, conversion_factor, stock_qty, price_list_rate, rate, amount,
    net_rate, net_amount, item_tax_template_id, return_against_item
  )
  select
    v_merchant, v_id, t.ordinality, t.item_id, t.qty, t.uom_id, t.conversion_factor, t.stock_qty, coalesce(t.price_list_rate, 0),
    t.rate, t.amount, t.net_rate, t.net_amount, t.item_tax_template_id, t.return_against_item
  from jsonb_populate_recordset(null::public.pos_invoice_items, coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_taxes (
    merchant_id, pos_invoice_id, idx, charge_type, account_head, description, rate, row_id, included_in_print_rate, cost_center,
    tax_amount, total, item_wise_tax_detail
  )
  select
    v_merchant, v_id, t.ordinality, t.charge_type, t.account_head, t.description, coalesce(t.rate, 0), t.row_id,
    coalesce(t.included_in_print_rate, false), t.cost_center, coalesce(t.tax_amount, 0), coalesce(t.total, 0),
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
  v_row record;
  v_today date;
  -- One unit of the currency's smallest decimal: what two roundings of the same figure may differ by.
  v_unit numeric;
  v_price_list uuid;
  v_auto_price boolean;
  v_warehouse uuid;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  v_center uuid;
  v_cost numeric;
  v_rows integer := 0;
  v_tax_rows integer := 0;
  v_net numeric := 0;
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
  select 1 / power(10::numeric, coalesce(s.currency_precision, 2)) into v_unit from public.system_settings s where s.merchant_id = v_doc.merchant_id;
  v_unit := coalesce(v_unit, 0.01);

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

  select coalesce(v_profile.selling_price_list, s.default_price_list) into v_price_list
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;

  if v_company.enable_perpetual_inventory then
    v_inventory := private.warehouse_account(v_warehouse);
  end if;

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      coalesce(v_profile.cost_center, i.selling_cost_center, g.selling_cost_center, b.selling_cost_center, v_company.cost_center) as center,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor,
      -- The line of the sale a return's line takes back, and what earlier returns took of it (below zero).
      o.pos_invoice_id as o_invoice, o.item_id as o_item, o.item_name as o_name, o.uom_id as o_uom, o.conversion_factor as o_factor,
      o.qty as o_qty, o.price_list_rate as o_price_list_rate, o.rate as o_rate, o.amount as o_amount, o.net_amount as o_net_amount,
      o.income_account as o_income, o.expense_account as o_expense, o.cost_center as o_center, o.valuation_rate as o_valuation,
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
      -- the unit it was sold in, with a quantity below zero.
      if v_row.o_invoice is distinct from v_doc.return_against or v_row.qty > 0
        or v_row.item_id <> v_row.o_item or v_row.uom_id <> v_row.o_uom or v_row.conversion_factor <> v_row.o_factor
        or v_row.rate <> v_row.o_rate or v_row.price_list_rate <> v_row.o_price_list_rate
        or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
        raise exception 'return_line_invalid' using errcode = '23514',
          detail = 'A returned line names a line of the sale, with its item, unit and rate, and a quantity below zero.';
      end if;
      -- "Returned quantity is rejected: confirm it does not exceed the quantity available to return."
      if -v_row.qty > v_row.o_qty + v_row.o_returned then
        raise exception 'return_qty_exceeds' using errcode = '23514',
          detail = format('%s sold, %s already returned.', v_row.o_qty, -v_row.o_returned);
      end if;
      if abs(v_row.amount - v_row.o_amount * v_row.qty / v_row.o_qty) > v_unit
        or abs(v_row.net_amount - v_row.o_net_amount * v_row.qty / v_row.o_qty) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned line is not its share of the line sold.';
      end if;

      -- Where the sale posted, the return posts back.
      v_income := v_row.o_income;
      v_center := v_row.o_center;
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
      if not v_profile.allow_rate_change and v_row.rate <> v_row.price_list_rate then
        raise exception 'rate_locked' using errcode = '23514', detail = 'This POS Profile does not allow a line''s rate to be changed.';
      end if;
      if abs(v_row.amount - v_row.qty * v_row.rate) > v_unit or v_row.net_amount < 0 or v_row.net_amount > v_row.amount + v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s amount is not its quantity times its rate.';
      end if;

      v_income := v_row.income;
      v_center := v_row.center;
    end if;

    v_net := v_net + v_row.net_amount;
    v_expense := null;
    v_cost := null;
    v_gl := v_gl || jsonb_build_object('account_id', v_income, 'amount', -v_row.net_amount, 'cost_center_id', v_center);

    -- "Posts at once: stock out and Cost of Goods Sold." A service moves no stock. Negative stock, a
    -- fraction in a whole-number unit and a backdated posting are the engine's to refuse. A return brings
    -- back what the sale moved, at the valuation it left at.
    if (v_doc.is_return and v_row.o_valuation is not null) or (not v_doc.is_return and v_row.is_stock_item) then
      v_cost := -private.post_sle(
        v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_row.item_id, v_warehouse, -v_row.stock_qty,
        case when v_doc.is_return then v_row.o_valuation end
      );
      if v_company.enable_perpetual_inventory then
        if v_inventory is null then
          raise exception 'no_inventory_account' using errcode = '23514',
            detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
        end if;
        v_expense := case when v_doc.is_return then coalesce(v_row.o_expense, v_row.expense) else v_row.expense end;
        v_gl := v_gl
          || jsonb_build_object('account_id', v_expense, 'amount', v_cost, 'cost_center_id', v_center)
          || jsonb_build_object('account_id', v_inventory, 'amount', -v_cost);
      end if;
    end if;

    update public.pos_invoice_items r set
      item_name = case when v_doc.is_return then v_row.o_name else v_row.current_name end,
      income_account = v_income, expense_account = v_expense, cost_center = v_center,
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
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount, 'cost_center_id', v_row.cost_center);
  end loop;

  if v_doc.is_return and v_tax_rows <> (select count(*) from public.pos_invoice_taxes o where o.pos_invoice_id = v_doc.return_against) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'A return carries every tax row of its sale.';
  end if;

  -- The totals add up. An inclusive tax can leave the grand total a few units off net + tax (the entered
  -- prices are kept); the Rounded Total is the grand total at the currency's smallest coin, or itself.
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
      'account_id', coalesce(v_profile.write_off_account, v_company.write_off_account), 'amount', v_write_off,
      'cost_center_id', coalesce(v_profile.write_off_cost_center, v_company.cost_center))
    -- What rounding added or took: the Rounded Total less net and taxes.
    || jsonb_build_object(
      'account_id', v_company.round_off_account, 'amount', -(v_doc.rounded_total - v_net - v_tax),
      'cost_center_id', coalesce(v_company.round_off_cost_center, v_company.cost_center));

  -- An account still missing here is refused by private.post_gl (account_unusable), as an unbalanced voucher is.
  perform private.post_gl(v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_gl);

  update public.pos_invoices set
    posting_date = v_today,
    warehouse = v_warehouse,
    selling_price_list = case when v_doc.is_return then v_original.selling_price_list else v_price_list end,
    tax_category = case when v_doc.is_return then v_original.tax_category else v_profile.tax_category end
  where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_invoices(uuid) from public, anon, authenticated, service_role;

-- Each column's constraints and index go with it.
alter table public.pos_invoice_items
  drop column if exists discount_percentage,
  drop column if exists discount_amount,
  drop column if exists distributed_discount_amount,
  drop column if exists pricing_rule_id,
  drop column if exists discount_account;

alter table public.pos_invoices
  drop column if exists apply_discount_on,
  drop column if exists additional_discount_percentage,
  drop column if exists discount_amount,
  drop column if exists additional_discount_account;
