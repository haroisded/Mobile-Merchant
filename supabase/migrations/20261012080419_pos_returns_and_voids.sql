-- Step 19 of the POS batch, on ERPNext's model: Returns & Voids
-- (.claude/erpnext-docs/POS-System-Added-Features.md 19.1–19.2; docs.frappe.io/erpnext/sales-return,
-- /immutable-ledger-in-erpnext, /delete-submitted-document).
--
-- 1. A return is a POS Invoice: is_return, return_against, and on each line return_against_item. Its
--    quantities, amounts, totals and payments are negative, as ERPNext stores them, so a session's closing
--    entry and every report net a refund by adding it up.
-- 2. pos_invoice_taxes.item_wise_tax_detail: what each tax row charged each line — ERPNext's field. A return
--    is then the sale's own stored figures taken by share, and the database checks all of it.
-- 3. public.pos_checkout() and private.submit_pos_invoices(), re-created: one door and one poster for a
--    sale and a return.
-- 4. A void (public.cancel_document) is refused while returns stand against the sale, and once its session
--    is closed.
-- 5. public.delete_document(): Accounts Settings' "Delete Ledger Entries with the Document", for every
--    document.
--
-- Out of scope, so absent: exchanges, a credit kept for a later sale (no Customer), a return without the
-- goods, a return of a return. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. The return's links. "Use the original submitted transaction as the starting point. This preserves the
-- link to the sale, fetches the original items and rates, and updates returned quantities correctly."

alter table public.pos_invoices
  add column if not exists is_return boolean not null default false,
  add column if not exists return_against uuid;

alter table public.pos_invoices drop constraint if exists pos_invoices_return_shape;
alter table public.pos_invoices add constraint pos_invoices_return_shape check (is_return = (return_against is not null));
alter table public.pos_invoices drop constraint if exists pos_invoices_return_fk;
alter table public.pos_invoices add constraint pos_invoices_return_fk
  foreign key (return_against, merchant_id) references public.pos_invoices (id, merchant_id);
create index if not exists pos_invoices_return_idx on public.pos_invoices (return_against, merchant_id);

alter table public.pos_invoice_items add column if not exists return_against_item uuid;

-- The line of the sale a return's line takes back. Dropped first, so the unique constraint it needs can be
-- made again.
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_return_fk;
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_id_merchant;
alter table public.pos_invoice_items add constraint pos_invoice_items_id_merchant unique (id, merchant_id);
alter table public.pos_invoice_items add constraint pos_invoice_items_return_fk
  foreign key (return_against_item, merchant_id) references public.pos_invoice_items (id, merchant_id);
create index if not exists pos_invoice_items_return_idx on public.pos_invoice_items (return_against_item, merchant_id);
-- One line of a return per line of the sale: what is left to return is checked line by line.
create unique index if not exists pos_invoice_items_return_once
  on public.pos_invoice_items (pos_invoice_id, return_against_item) where return_against_item is not null;

-- "ERPNext represents return quantities as negative values." Which sign a document's rows carry is the
-- poster's to hold.
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_qty;
alter table public.pos_invoice_items add constraint pos_invoice_items_qty
  check (qty <> 0 and stock_qty <> 0 and sign(qty) = sign(stock_qty) and conversion_factor > 0);
alter table public.pos_invoice_payments drop constraint if exists pos_invoice_payments_amount;
alter table public.pos_invoice_payments add constraint pos_invoice_payments_amount check (amount <> 0);


-- 2. What each tax row charged each line, in the lines' order — ERPNext's item_wise_tax_detail. Unrounded,
-- as the app's engine holds them; the row's own tax_amount is their sum, rounded.

alter table public.pos_invoice_taxes add column if not exists item_wise_tax_detail jsonb not null default '[]'::jsonb;
alter table public.pos_invoice_taxes drop constraint if exists pos_invoice_taxes_detail;
alter table public.pos_invoice_taxes add constraint pos_invoice_taxes_detail check (jsonb_typeof(item_wise_tax_detail) = 'array');

-- The sales that exist: each row spread over the lines by net amount. Exact where every line carries the
-- same rate; a sale of mixed rates made before this migration refunds its tax by net amount.
update public.pos_invoice_taxes t
set item_wise_tax_detail = d.detail
from (
  select x.id, jsonb_agg(case when i.net_total = 0 then 0 else x.tax_amount * r.net_amount / i.net_total end order by r.idx) as detail
  from public.pos_invoice_taxes x
  join public.pos_invoices i on i.id = x.pos_invoice_id
  join public.pos_invoice_items r on r.pos_invoice_id = i.id
  group by x.id
) d
where d.id = t.id and t.item_wise_tax_detail = '[]'::jsonb;


-- 3. The door and the poster (20261012004616_pos_shift_and_sale.sql), for a return too. A return is the same
-- payload with return_against, each line naming the line it takes back.

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

-- The sale, and the return of one. ponytail: a sale's tax amounts, each line's net amount and its Price List
-- Rate are trusted from the app — the invoice stores the template and its rows as applied, so a query can
-- re-run them. Upgrade path: port taxes_and_totals and the price lookup to SQL. A return trusts nothing:
-- every figure of it is the sale's own, taken by share.
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


-- 4. Voids (19.2). public.cancel_document() reverses a sale's stock and ledger entries as Accounts Settings
-- say, for whoever holds Cancel; these are the two sales it must leave alone. "Original document cannot be
-- cancelled: use a return document instead of forcing cancellation."

create or replace function private.guard_pos_invoice_void()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.docstatus = 2 and old.docstatus = 1 then
    if exists (select 1 from public.pos_invoices r where r.return_against = new.id and r.docstatus = 1) then
      raise exception 'has_returns' using errcode = '23514', detail = 'Returns stand against this sale; cancel them first.';
    end if;
    -- Its POS Closing Entry has counted it: the entry's expected amounts would stop matching the books.
    if exists (select 1 from public.pos_opening_entries s where s.id = new.pos_opening_entry_id and s.status = 'Closed') then
      raise exception 'session_closed' using errcode = '23514', detail = 'The session this was rung in is closed; make a return instead.';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_pos_invoice_void() from public, anon, authenticated, service_role;

drop trigger if exists pos_invoices_void_guard on public.pos_invoices;
create trigger pos_invoices_void_guard
  before update of docstatus on public.pos_invoices
  for each row execute function private.guard_pos_invoice_void();


-- 5. Delete a cancelled document (docs.frappe.io/erpnext/delete-submitted-document: "To delete a submitted
-- document, you need to cancel it first"). A draft is deleted through its own policy; a cancelled document
-- has entries in the ledgers no role may write, so this is the third door beside submit_document and
-- cancel_document — security definer in `public`, and CLAUDE.md §6.2's three rules: revoked from every role
-- and granted to `authenticated` alone, search_path pinned with every name qualified, and the caller checked
-- inside — signed in, and holding Delete on that document type in that system.
--
-- Accounts Settings decide: with "Delete Ledger Entries with the Document" on, the document goes with every
-- entry it posted and every entry that reversed them; off, a cancelled document stays as the source of its
-- entries ("Deleting it would break that audit trail").
create or replace function public.delete_document(p_doctype text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_merchant uuid;
  v_status smallint;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select d.table_name into v_table from public.doctypes d where d.name = p_doctype and d.kind = 'document';
  if v_table is null then
    raise exception 'not_a_document' using errcode = '22023';
  end if;

  execute format('select d.merchant_id, d.docstatus from public.%I d where d.id = $1 for update', v_table)
    into v_merchant, v_status using p_id;

  -- One answer for a document that is not there and one the caller may not delete.
  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'delete')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 2 then
    raise exception 'not_cancelled' using errcode = '23514', detail = 'Only a cancelled document is deleted here; a draft through its own page.';
  end if;

  if not coalesce((select s.delete_linked_ledger_entries from public.accounts_settings s where s.merchant_id = v_merchant), false) then
    raise exception 'ledger_entries_kept' using errcode = '23514',
      detail = 'Accounts Settings keep a cancelled document''s ledger entries, and the document with them.';
  end if;

  delete from public.gl_entries g where g.merchant_id = v_merchant and g.voucher_type = p_doctype and g.voucher_id = p_id;
  delete from public.stock_ledger_entries s where s.merchant_id = v_merchant and s.voucher_type = p_doctype and s.voucher_id = p_id;

  -- "If your document is linked with other documents, you will need to cancel the dependent document first."
  begin
    execute format('delete from public.%I where id = $1', v_table) using p_id;
  exception when foreign_key_violation then
    raise exception 'document_in_use' using errcode = '23503', detail = 'Another document still names this one.';
  end;
end;
$$;

revoke execute on function public.delete_document(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_document(text, uuid) to authenticated;
