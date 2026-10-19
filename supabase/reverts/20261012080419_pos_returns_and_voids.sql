-- Revert of supabase/migrations/20261012080419_pos_returns_and_voids.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every return (a POS Invoice with is_return) with its rows, and what each tax row charged
-- each line. It does NOT take back what the returns posted: their gl_entries and stock_ledger_entries stay,
-- and the bins keep the stock they brought back — cancel the returns first (public.cancel_document) to
-- reverse them. A document deleted through public.delete_document() is not restored. Regenerate
-- src/lib/database.types.ts afterwards — the Sell screens read these columns.

drop function if exists public.delete_document(text, uuid);

drop trigger if exists pos_invoices_void_guard on public.pos_invoices;
drop function if exists private.guard_pos_invoice_void();

-- public.pos_checkout() and private.submit_pos_invoices() as 20261012004616_pos_shift_and_sale.sql made
-- them: a sale only.
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
    grand_total, rounding_adjustment, rounded_total, paid_amount, change_amount, write_off_amount
  )
  values (
    v_merchant, private.merchant_today(v_merchant), v_doc.pos_profile_id, v_doc.pos_opening_entry_id, v_doc.taxes_and_charges,
    coalesce(v_doc.net_total, 0), coalesce(v_doc.total_taxes_and_charges, 0), coalesce(v_doc.grand_total, 0),
    coalesce(v_doc.rounding_adjustment, 0), coalesce(v_doc.rounded_total, 0), coalesce(v_doc.paid_amount, 0),
    coalesce(v_doc.change_amount, 0), coalesce(v_doc.write_off_amount, 0)
  )
  returning id into v_id;

  insert into public.pos_invoice_items (
    merchant_id, pos_invoice_id, idx, item_id, qty, uom_id, conversion_factor, stock_qty, price_list_rate, rate, amount,
    net_rate, net_amount, item_tax_template_id
  )
  select
    v_merchant, v_id, t.ordinality, t.item_id, t.qty, t.uom_id, t.conversion_factor, t.stock_qty, coalesce(t.price_list_rate, 0),
    t.rate, t.amount, t.net_rate, t.net_amount, t.item_tax_template_id
  from jsonb_populate_recordset(null::public.pos_invoice_items, coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_taxes (
    merchant_id, pos_invoice_id, idx, charge_type, account_head, description, rate, row_id, included_in_print_rate, cost_center,
    tax_amount, total
  )
  select
    v_merchant, v_id, t.ordinality, t.charge_type, t.account_head, t.description, coalesce(t.rate, 0), t.row_id,
    coalesce(t.included_in_print_rate, false), t.cost_center, coalesce(t.tax_amount, 0), coalesce(t.total, 0)
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
  v_row record;
  v_today date;
  -- One unit of the currency's smallest decimal: what two roundings of the same figure may differ by.
  v_unit numeric;
  v_price_list uuid;
  v_auto_price boolean;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  v_center uuid;
  v_cost numeric;
  v_rows integer := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_paid numeric := 0;
  v_change numeric;
  v_write_off numeric;
  v_gl jsonb := '[]'::jsonb;
begin
  select * into v_doc from public.pos_invoices d where d.id = p_id;
  select * into v_profile from public.pos_profiles p where p.id = v_doc.pos_profile_id;
  select * into v_company from public.merchants m where m.id = v_doc.merchant_id;
  select * into v_session from public.pos_opening_entries s where s.id = v_doc.pos_opening_entry_id;
  v_today := private.merchant_today(v_doc.merchant_id);
  select 1 / power(10::numeric, coalesce(s.currency_precision, 2)) into v_unit from public.system_settings s where s.merchant_id = v_doc.merchant_id;
  v_unit := coalesce(v_unit, 0.01);

  -- "No sale without an open session": the caller's own, on this profile.
  if v_doc.user_id is distinct from (select auth.uid())
    or v_session.docstatus is distinct from 1 or v_session.status is distinct from 'Open'
    or v_session.user_id is distinct from (select auth.uid())
    or v_session.pos_profile_id is distinct from v_doc.pos_profile_id then
    raise exception 'no_open_session' using errcode = '23514', detail = 'A sale needs the cashier''s own open session on that POS Profile.';
  end if;
  if not private.pos_profile_usable(v_doc.pos_profile_id) then
    raise exception 'pos_profile_unusable' using errcode = '23514', detail = 'The POS Profile is disabled, or not applicable for this user.';
  end if;

  select coalesce(v_profile.selling_price_list, s.default_price_list) into v_price_list
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;

  if v_company.enable_perpetual_inventory then
    v_inventory := private.warehouse_account(v_profile.warehouse);
  end if;

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      coalesce(v_profile.cost_center, i.selling_cost_center, g.selling_cost_center, b.selling_cost_center, v_company.cost_center) as center,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor
    from public.pos_invoice_items r
    join public.items i on i.id = r.item_id
    join public.item_groups g on g.id = i.item_group_id
    left join public.brands b on b.id = i.brand_id
    where r.pos_invoice_id = p_id
    order by r.idx
  loop
    v_rows := v_rows + 1;

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

    v_net := v_net + v_row.net_amount;
    v_income := v_row.income;
    v_center := v_row.center;
    v_expense := null;
    v_cost := null;
    v_gl := v_gl || jsonb_build_object('account_id', v_income, 'amount', -v_row.net_amount, 'cost_center_id', v_center);

    -- "Posts at once: stock out and Cost of Goods Sold." A service moves no stock. Negative stock, a
    -- fraction in a whole-number unit and a backdated posting are the engine's to refuse.
    if v_row.is_stock_item then
      v_cost := -private.post_sle(
        v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_row.item_id, v_profile.warehouse, -v_row.stock_qty
      );
      if v_company.enable_perpetual_inventory then
        if v_inventory is null then
          raise exception 'no_inventory_account' using errcode = '23514',
            detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
        end if;
        v_expense := v_row.expense;
        v_gl := v_gl
          || jsonb_build_object('account_id', v_expense, 'amount', v_cost, 'cost_center_id', v_center)
          || jsonb_build_object('account_id', v_inventory, 'amount', -v_cost);
      end if;
    end if;

    update public.pos_invoice_items r set
      item_name = v_row.current_name, income_account = v_income, expense_account = v_expense, cost_center = v_center,
      valuation_rate = v_cost / v_row.stock_qty
    where r.id = v_row.id;

    -- 14.1, Stock Settings' Auto Insert Price List Rate if Missing: the item's first sale in this unit
    -- writes its rate into the sale's price list.
    if v_auto_price and v_row.price_list_rate > 0
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

  for v_row in select t.* from public.pos_invoice_taxes t where t.pos_invoice_id = p_id order by t.idx loop
    v_tax := v_tax + v_row.tax_amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount, 'cost_center_id', v_row.cost_center);
  end loop;

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

  -- "Only the modes set here will be available when using POS."
  for v_row in
    select r.id, r.amount, m.default_account, pp.id as offered
    from public.pos_invoice_payments r
    join public.modes_of_payment m on m.id = r.mode_of_payment_id
    left join public.pos_profile_payments pp on pp.pos_profile_id = v_doc.pos_profile_id and pp.mode_of_payment_id = r.mode_of_payment_id
    where r.pos_invoice_id = p_id
  loop
    if v_row.offered is null then
      raise exception 'payment_method_not_offered' using errcode = '23514', detail = 'The POS Profile does not offer that mode of payment.';
    end if;
    v_paid := v_paid + v_row.amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.default_account, 'amount', v_row.amount);
    update public.pos_invoice_payments r set account = v_row.default_account where r.id = v_row.id;
  end loop;

  -- "Paid in full, change returned, a small difference written off within the limit."
  v_change := greatest(v_paid - v_doc.rounded_total, 0);
  v_write_off := greatest(v_doc.rounded_total - v_paid, 0);
  if v_write_off > v_profile.write_off_limit then
    raise exception 'underpaid' using errcode = '23514', detail = 'The payments do not cover the total, and the shortfall is over the Write Off Limit.';
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
    posting_date = v_today, warehouse = v_profile.warehouse, selling_price_list = v_price_list, tax_category = v_profile.tax_category
  where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_invoices(uuid) from public, anon, authenticated, service_role;

-- The returns go before the constraints that forbid them come back.
delete from public.pos_invoices where is_return;

alter table public.pos_invoice_taxes drop constraint if exists pos_invoice_taxes_detail;
alter table public.pos_invoice_taxes drop column if exists item_wise_tax_detail;

drop index if exists public.pos_invoice_items_return_once;
drop index if exists public.pos_invoice_items_return_idx;
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_return_fk;
alter table public.pos_invoice_items drop column if exists return_against_item;
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_id_merchant;

alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_qty;
alter table public.pos_invoice_items add constraint pos_invoice_items_qty check (qty > 0 and stock_qty > 0 and conversion_factor > 0);
alter table public.pos_invoice_payments drop constraint if exists pos_invoice_payments_amount;
alter table public.pos_invoice_payments add constraint pos_invoice_payments_amount check (amount > 0);

drop index if exists public.pos_invoices_return_idx;
alter table public.pos_invoices drop constraint if exists pos_invoices_return_fk;
alter table public.pos_invoices drop constraint if exists pos_invoices_return_shape;
alter table public.pos_invoices drop column if exists return_against;
alter table public.pos_invoices drop column if exists is_return;
