-- Item barcodes: the key a camera reads (the product scan on the Item page and at the Register).
--
-- 1. public.items.barcode — the code printed on the product (EAN-13, UPC, Code 128 …), optional, unique within
--    a system: one scan at the Register must name one item. Printable ASCII with no spaces, at most 64. No new
--    table: the Item doctype's policies already cover every column of public.items.
-- 2. public.save_item() writes it. On an update a payload without the key keeps the saved barcode, so a build
--    of the app from before this column cannot wipe one; public.import_items and
--    public.save_item_with_opening_stock save through save_item and are unchanged (the CSV template has no
--    barcode column).
--
-- Rejected: the Item Code as the barcode — the codes this app numbers or a shop types (COFFEE,
-- STO-ITEM-2026-00001) are not what a package prints; ERPNext's Item Barcode child table — several barcodes an
-- item is more than a shop needs to start with, and a second table to save and read; matching the label's text
-- to an item's name — a guess where a barcode is exact.
--
-- Re-runnable, like the rest of supabase/migrations.

-- 1. The column.
alter table public.items add column if not exists barcode text;

alter table public.items drop constraint if exists items_barcode_shape;
alter table public.items add constraint items_barcode_shape check (barcode is null or barcode ~ '^[!-~]{1,64}$');

create unique index if not exists items_barcode_unique on public.items (merchant_id, barcode) where barcode is not null;


-- 2. public.save_item, as 20261014170428_backend_performance.sql left it, with the barcode.
create or replace function public.save_item(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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
      max_discount, discount_account, barcode
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
      nullif(payload ->> 'discount_account', '')::uuid,
      nullif(btrim(payload ->> 'barcode'), '')
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
      discount_account = nullif(payload ->> 'discount_account', '')::uuid,
      -- A payload without the key (a build from before the column) keeps the saved one.
      barcode = case when payload ? 'barcode' then nullif(btrim(payload ->> 'barcode'), '') else barcode end
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;

    -- A saved item's rows are replaced; a new one has none to clear.
    delete from public.item_uoms where item_id = v_id;
    delete from public.item_taxes where item_id = v_id;
  end if;

  insert into public.item_uoms (merchant_id, item_id, idx, uom_id, conversion_factor)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'uom_id')::uuid, (r.value ->> 'conversion_factor')::numeric
  from jsonb_array_elements(coalesce(payload -> 'uoms', '[]'::jsonb)) with ordinality as r (value, idx);

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
