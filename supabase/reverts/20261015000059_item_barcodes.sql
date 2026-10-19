-- Revert of the item-barcodes migration (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS EVERY ITEM'S BARCODE: the column goes with its values. public.save_item goes back to the body
-- 20261014170428_backend_performance.sql gave it. Regenerate src/lib/database.types.ts afterwards (items loses
-- barcode), and the app's Item page and Register scan stop finding items by barcode.


-- 2. public.save_item, as it was.
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
      max_discount, discount_account
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
      nullif(payload ->> 'discount_account', '')::uuid
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
      discount_account = nullif(payload ->> 'discount_account', '')::uuid
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


-- 1. The column.
drop index if exists public.items_barcode_unique;
alter table public.items drop constraint if exists items_barcode_shape;
alter table public.items drop column if exists barcode;
