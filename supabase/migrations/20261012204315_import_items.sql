-- Step 23 of the POS build, on ERPNext's model: Bulk Import of Items
-- (.claude/erpnext-docs/POS-System-Added-Features.md 23.1; docs.frappe.io/erpnext/data-import, /opening-stock).
--
-- public.import_items(): the rows of one CSV file become items, their first prices and their opening stock in
-- one transaction — every row or none. The app reads the file and checks it first
-- (src/features/items/csv.ts); this is the write, and the database's own rules still decide it.
--
-- No table, so no doctype, seed or backfill. Security INVOKER, over the RPCs one item's form already uses:
-- public.save_item() for each row, so private.prepare_item(), private.validate_defaults(), the Item naming
-- series and the Standard Selling Rate's Item Price all run as they do for one item; then ONE Opening Stock
-- reconciliation for the whole file, saved and submitted as the importer. So it needs what the form needs:
-- Item create, Item Price create for a row with a rate, Stock Reconciliation create and submit for a row with
-- opening stock. Rejected: a definer function with its own permission checks — a second copy of what the
-- policies already say; a reconciliation per item (public.save_item_with_opening_stock in a loop) — 300 items
-- would leave 300 documents in the list.
--
-- Out of scope, so absent: updating existing items, any other document type, import of a file kept on the
-- server, a saved import log. Re-runnable, like the rest of supabase/migrations.


-- A row is the payload public.save_item() takes, plus opening_stock and valuation_rate; `id` and
-- `merchant_id` are set here whatever the row says, so the function only ever creates, in p_merchant. An
-- imported item's Default Warehouse is Stock Settings', as a new item's form starts with, and its Opening
-- Stock goes there. "Valuation Rate is mandatory if Opening Stock entered", falling back to the Standard
-- Selling Rate (public.save_item_with_opening_stock).
--
-- A refusal is re-raised as it was, with a hint saying where: 'row 3' — the third row of p_rows — or
-- 'opening stock' once the rows are in and the reconciliation is what failed. Answers the created codes and
-- names in the file's order (a code may be the naming series').
--
-- ponytail: 500 rows a call — the whole file is one statement under the authenticated role's 8 s
-- statement_timeout. A shop with more splits the file; a staged, resumable import if that stops being enough.
create or replace function public.import_items(p_merchant uuid, p_rows jsonb)
returns table (item_code text, item_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := case when jsonb_typeof(p_rows) = 'array' then jsonb_array_length(p_rows) else 0 end;
  v_warehouse uuid;
  v_row jsonb;
  v_n integer := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_opening numeric;
  v_rate numeric;
  v_stock jsonb := '[]'::jsonb;
  v_reconciliation uuid;
  v_state text;
  v_message text;
  v_detail text;
begin
  if v_count < 1 then
    raise exception 'no_rows' using errcode = '23514', detail = 'The file has no item rows.';
  elsif v_count > 500 then
    raise exception 'too_many_rows' using errcode = '23514', detail = 'A file holds at most 500 items.';
  end if;

  select s.default_warehouse into v_warehouse from public.stock_settings s where s.merchant_id = p_merchant;

  begin
    for v_row, v_n in select r.value, r.idx from jsonb_array_elements(p_rows) with ordinality as r (value, idx) loop
      v_id := public.save_item(v_row || jsonb_build_object(
        'id', '', 'merchant_id', p_merchant, 'default_warehouse', coalesce(v_warehouse::text, '')
      ));
      v_ids := v_ids || v_id;

      v_opening := nullif(v_row ->> 'opening_stock', '')::numeric;
      if coalesce(v_opening, 0) > 0 and coalesce((v_row ->> 'is_stock_item')::boolean, true) then
        v_rate := coalesce(nullif(v_row ->> 'valuation_rate', '')::numeric, nullif(v_row ->> 'standard_rate', '')::numeric);
        if coalesce(v_rate, 0) <= 0 then
          raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Valuation Rate is mandatory if Opening Stock is entered.';
        end if;
        if v_warehouse is null then
          raise exception 'no_default_warehouse' using errcode = '23514', detail = 'Stock Settings names no warehouse for the opening stock.';
        end if;

        v_stock := v_stock || jsonb_build_object('item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate);
      end if;
    end loop;

    -- Past the rows: what fails from here is the reconciliation.
    v_n := 0;
    if jsonb_array_length(v_stock) > 0 then
      v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
        'merchant_id', p_merchant, 'purpose', 'Opening Stock', 'items', v_stock
      ));
      perform public.submit_document('Stock Reconciliation', v_reconciliation);
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
    raise exception using
      errcode = v_state, message = v_message, detail = v_detail,
      hint = case when v_n > 0 then 'row ' || v_n else 'opening stock' end;
  end;

  return query
  select i.item_code, i.item_name
  from unnest(v_ids) with ordinality as u (id, idx)
  join public.items i on i.id = u.id
  order by u.idx;
end;
$$;

revoke execute on function public.import_items(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_items(uuid, jsonb) to authenticated;
