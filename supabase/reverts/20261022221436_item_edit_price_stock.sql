-- Revert of the saved item's price and stock migration (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- Destroys no data. public.save_item_with_opening_stock goes back to 20261011170112_stock_in_and_adjustments.sql's body:
-- a saved item's Standard Selling Rate and Stock on Hand are ignored again. The prices it updated and the Stock
-- Reconciliations it posted STAY — they are ordinary records (cancel a count on its own page). The app's Item page then
-- shows fields that save nothing on an item already saved: revert the app with it.

create or replace function public.save_item_with_opening_stock(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new boolean := nullif(payload ->> 'id', '') is null;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_opening numeric := nullif(payload ->> 'opening_stock', '')::numeric;
  v_rate numeric := coalesce(nullif(payload ->> 'valuation_rate', '')::numeric, nullif(payload ->> 'standard_rate', '')::numeric);
  v_id uuid;
  v_warehouse uuid;
  v_reconciliation uuid;
begin
  v_id := public.save_item(payload);

  if not v_new or coalesce(v_opening, 0) <= 0 or not coalesce((payload ->> 'is_stock_item')::boolean, true) then
    return v_id;
  end if;

  if coalesce(v_rate, 0) <= 0 then
    raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Valuation Rate is mandatory if Opening Stock is entered.';
  end if;

  v_warehouse := coalesce(
    nullif(payload ->> 'default_warehouse', '')::uuid,
    (select s.default_warehouse from public.stock_settings s where s.merchant_id = v_merchant)
  );
  if v_warehouse is null then
    raise exception 'no_default_warehouse' using errcode = '23514',
      detail = 'Neither the item nor Stock Settings names a warehouse for the opening stock.';
  end if;

  v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
    'merchant_id', v_merchant,
    'purpose', 'Opening Stock',
    'items', jsonb_build_array(jsonb_build_object(
      'item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate
    ))
  ));
  perform public.submit_document('Stock Reconciliation', v_reconciliation);

  return v_id;
end;
$$;

revoke execute on function public.save_item_with_opening_stock(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_with_opening_stock(jsonb) to authenticated;
