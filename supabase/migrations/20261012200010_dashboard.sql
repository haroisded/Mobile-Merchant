-- Step 22 of the POS build, on ERPNext's model: the Dashboard
-- (.claude/erpnext-docs/POS-System-Added-Features.md 22.1–22.3; docs.frappe.io/erpnext/erpnext-dashboards,
-- /sales-analytics, /stock-level-report).
--
-- 1. public.stock_alerts(): the items out of stock or at or below their Re-order Level, per warehouse.
-- 2. public.dashboard_cards(): the four number cards of a period.
-- 3. public.sales_by_day(): the sales-per-day chart.
-- 4. public.top_selling(): the Top-Selling Items list, by quantity or amount, by Item or Item Group.
--
-- No table, so no doctype, seed or backfill. Every function is security INVOKER: the caller's own policies
-- decide each row, so a role reads here what it reads in Orders, Sell and Stock Balance, and a User
-- Permission on a Warehouse or an Item Group narrows these figures as it narrows those lists
-- (20261012131350_access_for_documents.sql). Rejected: definer functions with their own permission checks —
-- a second copy of what the policies already say.
--
-- Sales is the Net Total — before tax, after discounts — as ERPNext's Sales Analytics values a sale; a return
-- is a POS Invoice below zero, so it nets by itself. Gross Profit is Sales less what the stock sold cost (each
-- line's valuation rate, kept on the line when it posted), and is answered only to whoever may also read the
-- Stock Ledger, where that cost lives. The dates are the caller's: the app works out the period in the
-- system's time zone, the day a sale is dated by (private.merchant_today).
--
-- Out of scope, so absent: custom dashboards, a saved chart or number card, targets, the projected quantity.
-- Re-runnable, like the rest of supabase/migrations.


-- 1. Stock Alerts (22.3): a bin of an enabled stock item at zero or less, or at or below the item's Re-order
-- Level when it has one. An item never stocked in a warehouse has no bin there, so it does not alert.
-- p_limit null lists every one — what the Low Stock card counts.
create or replace function public.stock_alerts(p_merchant uuid, p_limit integer default 200)
returns table (
  item_id uuid, item_code text, item_name text, warehouse_id uuid, warehouse_name text, actual_qty numeric, reorder_level numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.item_code, t.item_name, w.id, w.warehouse_name, b.actual_qty, t.reorder_level
  from public.bins b
  join public.items t on t.id = b.item_id
  join public.warehouses w on w.id = b.warehouse_id
  where b.merchant_id = p_merchant
    and t.is_stock_item
    and not t.disabled
    and (b.actual_qty <= 0 or (coalesce(t.reorder_level, 0) > 0 and b.actual_qty <= t.reorder_level))
  order by b.actual_qty, t.item_code, w.warehouse_name
  limit p_limit;
$$;

revoke execute on function public.stock_alerts(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.stock_alerts(uuid, integer) to authenticated;


-- 2. The number cards (22.1). Sales and its invoice count, and Gross Profit, are the period's; Open Registers
-- and Low Stock are as things stand now.
-- ponytail: change comes off the expected cash only for a sale with a Cash-type payment — the closing entry's
-- fallback to a sale's first payment (private.submit_pos_closing_entries) is not repeated here; a change mode
-- column on the invoice would serve both.
create or replace function public.dashboard_cards(p_merchant uuid, p_from date, p_to date)
returns table (
  sales numeric, invoices bigint, gross_profit numeric, open_registers bigint, expected_cash numeric, low_stock bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
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


-- 3. Sales per day (22.2): one row a day, a day without a sale at zero. At most a year and a day of them.
create or replace function public.sales_by_day(p_merchant uuid, p_from date, p_to date)
returns table (day date, sales numeric, invoices bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.day::date, coalesce(sum(i.net_total), 0), count(i.id) filter (where not i.is_return)
  from generate_series(p_from::timestamp, least(p_to, p_from + 366)::timestamp, interval '1 day') as d (day)
  left join public.pos_invoices i
    on i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date = d.day::date
  group by d.day
  order by d.day;
$$;

revoke execute on function public.sales_by_day(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.sales_by_day(uuid, date, date) to authenticated;


-- 4. Top-Selling Items (22.2): by Item, or by the Item Group each item is in; ranked by the quantity sold in
-- stock units or by the net amount. What was sold and wholly returned drops out. `code` is an item's; a
-- group has none.
create or replace function public.top_selling(
  p_merchant uuid, p_from date, p_to date, p_by text default 'qty', p_group boolean default false, p_limit integer default 10
)
returns table (id uuid, code text, name text, qty numeric, amount numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when p_group then g.id else t.id end,
    case when p_group then null else t.item_code end,
    case when p_group then g.item_group_name else t.item_name end,
    sum(r.stock_qty),
    sum(r.net_amount)
  from public.pos_invoice_items r
  join public.pos_invoices i on i.id = r.pos_invoice_id
  join public.items t on t.id = r.item_id
  join public.item_groups g on g.id = t.item_group_id
  where i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date between p_from and p_to
  group by 1, 2, 3
  having sum(r.stock_qty) > 0 or sum(r.net_amount) > 0
  order by case when p_by = 'amount' then sum(r.net_amount) else sum(r.stock_qty) end desc, 3
  limit least(coalesce(p_limit, 10), 100);
$$;

revoke execute on function public.top_selling(uuid, date, date, text, boolean, integer) from public, anon, authenticated, service_role;
grant execute on function public.top_selling(uuid, date, date, text, boolean, integer) to authenticated;
