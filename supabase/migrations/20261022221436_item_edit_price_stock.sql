-- A saved item keeps its price and stock fields (the human, 2026-10-23): the Item page shows Selling Price (Standard
-- Selling Rate), Stock on Hand and Cost per Unit (Valuation Rate) on an item already saved, as it does on a new one, and
-- saving them changes the item's price and its stock.
--
-- public.save_item_with_opening_stock() — re-created from 20261011170112_stock_in_and_adjustments.sql. A new item is
-- saved exactly as before. A saved one, after public.save_item():
--   - `standard_rate` in the payload, above zero, and not what the item sells for: its undated stock-unit price in
--     Selling Settings' default price list is updated, or written when it has none (no_default_price_list as save_item
--     raises it). A price with dates, or in another unit or list, is left alone: Item Prices keeps those.
--   - `opening_stock` in the payload (Stock on Hand) on a stock item, differing from what its warehouse holds — or
--     `valuation_rate` differing from the bin's: one Stock Reconciliation (purpose Stock Reconciliation) of that
--     warehouse — the item's default, else Stock Settings' — saved and submitted, as the new item's Opening Stock is.
--     Its cost: the typed Valuation Rate, else the bin's, else the Standard Selling Rate. A count that changes nothing
--     is not posted (the poster would refuse it: nothing_to_reconcile).
-- The app sends those keys only when the person changed the field (src/screens/items/item-form.tsx). Security invoker,
-- as before: Item Price write or create, and Stock Reconciliation create and submit, are the caller's own policies.
-- Same signature: database.types.ts is unchanged.

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
  v_price numeric := nullif(payload ->> 'standard_rate', '')::numeric;
  v_rate numeric := coalesce(nullif(payload ->> 'valuation_rate', '')::numeric, nullif(payload ->> 'standard_rate', '')::numeric);
  v_id uuid;
  v_warehouse uuid;
  v_reconciliation uuid;
  v_item public.items;
  v_list uuid;
  v_bin record;
begin
  v_id := public.save_item(payload);

  if not v_new then
    select * into v_item from public.items i where i.id = v_id;

    -- Its price: the undated one in the stock unit and the default list, the one a new item's rate wrote.
    if payload ? 'standard_rate' and coalesce(v_price, 0) > 0 then
      select s.default_price_list into v_list from public.selling_settings s where s.merchant_id = v_merchant;
      if v_list is null then
        raise exception 'no_default_price_list' using errcode = '23514',
          detail = 'Selling Settings names no default price list for the Standard Selling Rate.';
      end if;

      update public.item_prices p set price_list_rate = v_price
      where p.item_id = v_id and p.price_list_id = v_list and p.uom_id = v_item.stock_uom and p.valid_from is null and p.valid_upto is null
        and p.price_list_rate <> v_price;
      if not exists (
        select 1 from public.item_prices p
        where p.item_id = v_id and p.price_list_id = v_list and p.uom_id = v_item.stock_uom and p.valid_from is null and p.valid_upto is null
      ) then
        insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
        values (v_merchant, v_id, v_list, v_item.stock_uom, v_price);
      end if;
    end if;

    -- Its stock on hand in its warehouse: a count, posted only when it changes the quantity or the cost.
    if not (payload ? 'opening_stock') or v_opening is null or not v_item.is_stock_item then
      return v_id;
    end if;

    v_warehouse := coalesce(
      v_item.default_warehouse,
      (select s.default_warehouse from public.stock_settings s where s.merchant_id = v_merchant)
    );
    if v_warehouse is null then
      raise exception 'no_default_warehouse' using errcode = '23514',
        detail = 'Neither the item nor Stock Settings names a warehouse for its stock.';
    end if;

    select b.actual_qty, b.valuation_rate into v_bin from public.bins b where b.item_id = v_id and b.warehouse_id = v_warehouse;
    v_rate := coalesce(nullif(payload ->> 'valuation_rate', '')::numeric, nullif(v_bin.valuation_rate, 0), v_price, 0);

    if v_opening = coalesce(v_bin.actual_qty, 0) and (v_opening = 0 or v_rate = coalesce(v_bin.valuation_rate, 0)) then
      return v_id;
    end if;
    if v_opening > 0 and v_rate <= 0 then
      raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Stock on hand needs a valuation rate above zero.';
    end if;

    v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
      'merchant_id', v_merchant,
      'purpose', 'Stock Reconciliation',
      'items', jsonb_build_array(jsonb_build_object(
        'item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate
      ))
    ));
    perform public.submit_document('Stock Reconciliation', v_reconciliation);

    return v_id;
  end if;

  if coalesce(v_opening, 0) <= 0 or not coalesce((payload ->> 'is_stock_item')::boolean, true) then
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
