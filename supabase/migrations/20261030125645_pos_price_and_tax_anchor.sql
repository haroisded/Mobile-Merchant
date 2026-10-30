-- A sale's price and taxes are anchored to the store's own records (2026-10-30).
--
-- F-2026-1029-01 (.claude/tests/PEN-tests/test-reports/app-only-exploits-2026-10-29.md, High): every line check in
-- private.submit_pos_invoices — the discount, Allow Rate Change, Allow User to Edit Discount, Apply Discounts, Item Max
-- Discount, a Pricing Rule's percentage — measured against the line's Price List Rate, which the app sends and nothing
-- compared to the item's real price. `price_list_rate = rate = 1` sold a ₱500 item for ₱1 as a Cashier with no
-- discount rights. And a negative tax row (found tracing pentest F-01) took any amount off a sale with no check at all.
--
-- private.resolve_item_price() — new: the Price List Rate a sale line takes, an exact port of
--   src/features/item-prices/resolve.ts (the price for the line's unit valid on the date, the later Valid From first,
--   then on a Price Not UOM Dependent list the stock-unit price times the conversion factor; then the same two in
--   Selling Settings' default list when its fallback is on). Enabled lists only, as src/features/pos-invoices/setup.ts
--   picks them. Null: nothing prices the line.
-- private.submit_pos_invoices() — re-created from 20261018162135_single_store.sql. On a sale (a return is pinned to its
--   sale's lines already):
--   - the price list is the POS Profile's if enabled, else Selling Settings' default if enabled — the app's choice;
--   - each line's Price List Rate is what resolve_item_price says, or 0 when nothing prices it
--     (price_list_rate_mismatch). Every existing gate then measures against the real price;
--   - the sale's template is the POS Profile's when it names an enabled one; else the default, or one a Tax Rule for
--     the profile's tax category names today; none only when neither the profile nor a default names one
--     (tax_template_invalid);
--   - each tax row is the template's row at that position — account, type, rate, Reference Row #, included, and an
--     Actual row's amount — and every row after them is a rate-0 On Net Total row for an account of a line's Item Tax
--     Template, with Accounts Settings' Taxes from Item Tax Templates on; no tax row is below zero (tax_row_invalid).
--   Which Tax Rule wins, a line's Item Tax Template and the amounts of the percentage rows stay the app's: the ceiling
--   CLAUDE.md §6.7 names, narrowed.
-- pos_invoices_own_user, pos_opening_entries_own_user — new: a draft inserted by a signed-in person is theirs
--   (Found-Abuse #9: the column default could be overridden; the posters refused it, but the draft stayed).
-- Same signatures: database.types.ts is unchanged.

create or replace function private.resolve_item_price(
  p_merchant uuid, p_item uuid, p_uom uuid, p_factor numeric, p_list uuid, p_fallback uuid, p_date date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with lists as (
    select l.id, l.price_not_uom_dependent, x.pos
    from (values (p_list, 1), (p_fallback, 2)) as x (id, pos)
    join public.price_lists l on l.id = x.id and l.merchant_id = p_merchant and l.enabled
    where x.pos = 1 or p_fallback is distinct from p_list
  ),
  candidates as (
    -- Each list's exact price for the unit (step 1), then its stock-unit price times the factor (step 2).
    select lists.pos, 1 as step, p.price_list_rate as rate, p.valid_from, p.valid_upto
    from lists join public.item_prices p on p.price_list_id = lists.id and p.item_id = p_item and p.uom_id = p_uom
    union all
    select lists.pos, 2, p.price_list_rate * p_factor, p.valid_from, p.valid_upto
    from lists
    join public.items i on i.id = p_item and i.stock_uom <> p_uom
    join public.item_prices p on p.price_list_id = lists.id and p.item_id = p_item and p.uom_id = i.stock_uom
    where lists.price_not_uom_dependent
  )
  select c.rate from candidates c
  where (c.valid_from is null or c.valid_from <= p_date) and (c.valid_upto is null or c.valid_upto >= p_date)
  order by c.pos, c.step, c.valid_from desc nulls last, c.valid_upto asc nulls last
  limit 1;
$$;

revoke execute on function private.resolve_item_price(uuid, uuid, uuid, numeric, uuid, uuid, date) from public, anon, authenticated, service_role;

-- A draft is its maker's: whoever is signed in owns the session or sale they insert. Invoker, so current_user is
-- the caller's role, as private.guard_docstatus() reads it.
create or replace function private.own_user_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.user_id := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function private.own_user_id() from public, anon, authenticated, service_role;

drop trigger if exists pos_invoices_own_user on public.pos_invoices;
create trigger pos_invoices_own_user before insert on public.pos_invoices
  for each row execute function private.own_user_id();
drop trigger if exists pos_opening_entries_own_user on public.pos_opening_entries;
create trigger pos_opening_entries_own_user before insert on public.pos_opening_entries
  for each row execute function private.own_user_id();

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
  -- Selling Settings' default list while its fallback is on: where a price is looked for second.
  v_fallback uuid;
  v_auto_price boolean;
  v_add_item_taxes boolean;
  -- The sale's template rows, the tax rows checked against them.
  v_template_rows integer := 0;
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

  -- The sale's price list, as the app picks it (src/features/pos-invoices/setup.ts): the POS Profile's when enabled,
  -- else Selling Settings' default when enabled; the default again as the fallback, while its switch is on.
  select
    coalesce(
      (select l.id from public.price_lists l where l.id = v_profile.selling_price_list and l.enabled),
      (select l.id from public.price_lists l where l.id = s.default_price_list and l.enabled)
    ),
    case when s.fallback_to_default_price_list then
      (select l.id from public.price_lists l where l.id = s.default_price_list and l.enabled)
    end,
    s.validate_selling_price
  into v_price_list, v_fallback, v_validate_price
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;
  select a.enable_discount_accounting, coalesce(a.add_taxes_from_item_tax_template, false)
  into v_discount_accounting, v_add_item_taxes
  from public.accounts_settings a where a.merchant_id = v_doc.merchant_id;

  -- The sale's Sales Taxes and Charges Template, as src/features/pos-invoices/cart.ts saleTemplate() picks it: the
  -- POS Profile's when it names an enabled one; else one a Tax Rule names today, or the default; none only when
  -- nothing would have given one. Which rule wins stays the app's.
  if not v_doc.is_return and (
    (v_doc.taxes_and_charges is not null and not exists (
      select 1 from public.sales_tax_templates t
      where t.id = v_doc.taxes_and_charges and t.merchant_id = v_doc.merchant_id and not t.disabled
    ))
    or (exists (select 1 from public.sales_tax_templates t where t.id = v_profile.taxes_and_charges and not t.disabled)
      and v_doc.taxes_and_charges is distinct from v_profile.taxes_and_charges)
    or (v_doc.taxes_and_charges is null and exists (
      select 1 from public.sales_tax_templates t where t.merchant_id = v_doc.merchant_id and t.is_default and not t.disabled
    ))
    or (v_doc.taxes_and_charges is not null and v_doc.taxes_and_charges is distinct from v_profile.taxes_and_charges
      and not exists (select 1 from public.sales_tax_templates t where t.id = v_doc.taxes_and_charges and t.is_default)
      and not exists (
        select 1 from public.tax_rules r
        where r.merchant_id = v_doc.merchant_id and r.sales_tax_template_id = v_doc.taxes_and_charges
          and (r.tax_category_id is null or r.tax_category_id is not distinct from v_profile.tax_category)
          and (r.from_date is null or r.from_date <= v_today) and (r.to_date is null or r.to_date >= v_today)
      ))
  ) then
    raise exception 'tax_template_invalid' using errcode = '23514', detail = 'The sale''s tax template is not the one the store gives it.';
  end if;

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
      -- F-2026-1029-01: the Price List Rate every check below measures against is the store's, not the app's word
      -- for it — what the price lists give this unit today, or 0 when nothing prices it.
      if abs(v_row.price_list_rate - coalesce(private.resolve_item_price(
          v_doc.merchant_id, v_row.item_id, v_row.uom_id, v_row.conversion_factor, v_price_list, v_fallback, v_today
        ), 0)) > v_unit then
        raise exception 'price_list_rate_mismatch' using errcode = '23514',
          detail = format('%s does not sell at that Price List Rate today.', v_row.current_name);
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

  select count(*) into v_template_rows from public.sales_tax_template_rows r where r.template_id = v_doc.taxes_and_charges;

  for v_row in
    select
      t.*, o.account_head as o_account,
      -- The template's row at this position (the app copies them in order), and what an item tax row may name.
      tpl.account as tpl_account, tpl.charge_type as tpl_charge_type, tpl.rate as tpl_rate, tpl.row_id as tpl_row_id,
      tpl.included_in_print_rate as tpl_included, tpl.tax_amount as tpl_amount,
      exists (
        select 1 from public.pos_invoice_items l
        join public.item_tax_template_rows x on x.template_id = l.item_tax_template_id
        where l.pos_invoice_id = p_id and x.account = t.account_head
      ) as item_tax_account,
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
    left join (
      select r.*, (row_number() over (order by r.idx))::integer as pos
      from public.sales_tax_template_rows r where r.template_id = v_doc.taxes_and_charges
    ) tpl on tpl.pos = t.idx
    where t.pos_invoice_id = p_id
    order by t.idx
  loop
    v_tax_rows := v_tax_rows + 1;

    if v_doc.is_return then
      if v_row.o_account is distinct from v_row.account_head or abs(v_row.tax_amount - coalesce(v_row.o_share, 0)) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned tax is not its share of the tax charged.';
      end if;
    elsif v_row.tax_amount < 0
      or (v_row.idx <= v_template_rows and (
        v_row.account_head is distinct from v_row.tpl_account or v_row.charge_type is distinct from v_row.tpl_charge_type
        or v_row.rate is distinct from v_row.tpl_rate or v_row.row_id is distinct from v_row.tpl_row_id
        or v_row.included_in_print_rate is distinct from v_row.tpl_included
        or (v_row.charge_type = 'Actual' and abs(v_row.tax_amount - v_row.tpl_amount) > v_unit)))
      or (v_row.idx > v_template_rows and not (
        v_add_item_taxes and v_row.item_tax_account and v_row.charge_type = 'On Net Total' and v_row.rate = 0
        and v_row.row_id is null and not v_row.included_in_print_rate)) then
      -- No row is invented, and none takes money off the sale: each is the template's own, or an Item Tax
      -- Template's account added at rate 0 (cart.ts taxRows).
      raise exception 'tax_row_invalid' using errcode = '23514', detail = 'A tax row is not the sale''s template''s, nor an item tax''s.';
    elsif jsonb_array_length(v_row.item_wise_tax_detail) <> v_rows
      or abs(v_row.tax_amount - coalesce((select sum(d.value::numeric) from jsonb_array_elements_text(v_row.item_wise_tax_detail) as d (value)), 0)) > v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A tax row''s amounts per line do not add up to it.';
    end if;

    v_tax := v_tax + v_row.tax_amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount);
  end loop;

  if not v_doc.is_return and v_tax_rows < v_template_rows then
    raise exception 'tax_row_invalid' using errcode = '23514', detail = 'A sale carries every row of its tax template.';
  end if;
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
