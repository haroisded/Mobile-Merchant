-- Step 20 of the ERPNext rebuild, part 2 — the discounted sale
-- (.claude/erpnext-docs/POS-System-Added-Features.md 20.1–20.5; docs.frappe.io/erpnext/applying-discount,
-- /pricing-rule, /discount_accounting): a line's discount against its Price List Rate, an additional discount
-- on the whole sale, the guards on both, a Pricing Rule's price, and Discount Accounting.
-- 20261012085121_discounts.sql holds what these read.

create schema if not exists private;


-- 1. What a sale keeps of its discounts — ERPNext's fields.

alter table public.pos_invoices
  -- What the additional discount was taken from.
  add column if not exists apply_discount_on text not null default 'Grand Total',
  add column if not exists additional_discount_percentage numeric not null default 0,
  -- The additional discount itself; below zero on a return.
  add column if not exists discount_amount numeric not null default 0,
  -- Filled on submit, under Discount Accounting: where that discount posted. Empty: it only reduced the sale.
  add column if not exists additional_discount_account uuid;

alter table public.pos_invoices drop constraint if exists pos_invoices_discount;
alter table public.pos_invoices add constraint pos_invoices_discount check (
  apply_discount_on in ('Grand Total', 'Net Total') and additional_discount_percentage between 0 and 100
  and (case when is_return then discount_amount <= 0 else discount_amount >= 0 end)
);
alter table public.pos_invoices drop constraint if exists pos_invoices_discount_account_fk;
alter table public.pos_invoices add constraint pos_invoices_discount_account_fk
  foreign key (additional_discount_account, merchant_id) references public.accounts (id, merchant_id);
create index if not exists pos_invoices_discount_account_idx on public.pos_invoices (additional_discount_account, merchant_id);

alter table public.pos_invoice_items
  -- Per unit, against the Price List Rate: rate = price_list_rate - discount_amount. On a return too.
  add column if not exists discount_percentage numeric not null default 0,
  add column if not exists discount_amount numeric not null default 0,
  -- The line's share of the sale's additional discount, already out of its net amount; below zero on a return.
  add column if not exists distributed_discount_amount numeric not null default 0,
  -- The Pricing Rule that priced the line. Empty: the list's price, or a discount typed at the register.
  add column if not exists pricing_rule_id uuid,
  -- Filled on submit, under Discount Accounting: where the line's own discount posted.
  add column if not exists discount_account uuid;

alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_discount;
alter table public.pos_invoice_items add constraint pos_invoice_items_discount
  check (discount_percentage between 0 and 100 and discount_amount >= 0);
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_pricing_rule_fk;
alter table public.pos_invoice_items add constraint pos_invoice_items_pricing_rule_fk
  foreign key (pricing_rule_id, merchant_id) references public.pricing_rules (id, merchant_id);
alter table public.pos_invoice_items drop constraint if exists pos_invoice_items_discount_account_fk;
alter table public.pos_invoice_items add constraint pos_invoice_items_discount_account_fk
  foreign key (discount_account, merchant_id) references public.accounts (id, merchant_id);
create index if not exists pos_invoice_items_pricing_rule_idx on public.pos_invoice_items (pricing_rule_id, merchant_id);
create index if not exists pos_invoice_items_discount_account_idx on public.pos_invoice_items (discount_account, merchant_id);


-- 2. The door (20261012080419_pos_returns_and_voids.sql), now passing the discounts through. The two
-- discount accounts are the poster's to fill, never the payload's.

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


-- 3. The poster. The sale, and the return of one, as 20261012080419 left it — plus the discounts.
--
-- ponytail: a sale's tax amounts, each line's net amount and its Price List Rate are trusted from the app —
-- the invoice stores the template and its rows as applied, so a query can re-run them — and so is the share
-- of a Grand Total discount each line took. Upgrade path: port taxes_and_totals and the price lookup to SQL.
-- ponytail: of a Pricing Rule, the poster checks that the rule a line claims covers it and gives its rate.
-- Which rule wins among several stays the app's (src/features/pricing-rules/apply.ts); a second ranking
-- engine in SQL is the upgrade.
-- A return trusts nothing: every figure of it is the sale's own, taken by share.
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
  v_discount_accounting boolean;
  v_warehouse uuid;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  v_center uuid;
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

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom, i.max_discount,
      i.item_group_id as item_group, i.brand_id as brand,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      coalesce(v_profile.cost_center, i.selling_cost_center, g.selling_cost_center, b.selling_cost_center, v_company.cost_center) as center,
      -- 20.5: "item discounts post to the Item's Discount Account … falling back to the Company's".
      coalesce(i.discount_account, v_company.default_discount_account) as item_discount_account,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor,
      -- The line of the sale a return's line takes back, and what earlier returns took of it (below zero).
      o.pos_invoice_id as o_invoice, o.item_id as o_item, o.item_name as o_name, o.uom_id as o_uom, o.conversion_factor as o_factor,
      o.qty as o_qty, o.price_list_rate as o_price_list_rate, o.rate as o_rate, o.amount as o_amount, o.net_amount as o_net_amount,
      o.income_account as o_income, o.expense_account as o_expense, o.cost_center as o_center, o.valuation_rate as o_valuation,
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
      v_center := v_row.o_center;
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
      end if;
      -- 20.3, Item Max Discount (%), whoever gave the discount.
      if v_row.max_discount > 0 and v_row.discount_percentage > v_row.max_discount then
        raise exception 'max_discount_exceeded' using errcode = '23514',
          detail = format('%s takes at most %s%%.', v_row.current_name, v_row.max_discount);
      end if;

      v_income := v_row.income;
      v_center := v_row.center;
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
      || jsonb_build_object('account_id', v_income, 'amount', -(v_row.net_amount + v_item_discount + v_additional), 'cost_center_id', v_center)
      || jsonb_build_object('account_id', v_discount_account, 'amount', v_item_discount, 'cost_center_id', v_center)
      || jsonb_build_object('account_id', v_additional_account, 'amount', v_additional, 'cost_center_id', v_center);

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
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount, 'cost_center_id', v_row.cost_center);
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
    tax_category = case when v_doc.is_return then v_original.tax_category else v_profile.tax_category end,
    additional_discount_account = case when v_doc.discount_amount <> 0 then v_additional_account end
  where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_invoices(uuid) from public, anon, authenticated, service_role;
