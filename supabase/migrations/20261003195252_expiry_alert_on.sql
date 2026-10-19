-- An Inventory item's Expiry alert is a date: from that day on, its lots read Expiring. It was a day count
-- (expiry_alert_days, warn N days before each lot expires); the human chose a date on 2026-10-04.
--
-- 1. products.expiry_alert_on, a date. Null is no alert; a lot past its own expiry still reads Expired.
-- 2. save_stock_item: as 20261001052003_group_category.sql §4, writing expiry_alert_on in place of
--    expiry_alert_days.
--
-- expiry_alert_days stays. The Assets product form still writes it, and nothing backfills a date from it:
-- a day count is relative to each lot's expiry, and there is no single date it stands for. An Inventory
-- item saved before this keeps its day count unread until a date is set on it.
--
-- Rejected: keeping the day count (it follows every new delivery's expiry, where one date goes stale after
-- a restock) — the human's call, made knowing that trade-off.


-- 1. Column. Nullable with no default, so adding it rewrites nothing.
alter table public.products add column if not exists expiry_alert_on date;


-- 2. save_stock_item.
create or replace function public.save_stock_item(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.products;
  v_id uuid;
  v_group uuid;
  v_group_name text := nullif(btrim(payload ->> 'group_name'), '');
begin
  p := jsonb_populate_record(null::public.products, payload -> 'item');
  v_group := p.group_id;

  if v_group is null and v_group_name is not null then
    insert into public.product_groups (merchant_id, name) values (p.merchant_id, v_group_name)
    on conflict (merchant_id, name) do update set name = excluded.name
    returning id into v_group;
  end if;

  if v_group is not null and p.category_id is not null then
    update public.product_groups
    set category_id = p.category_id, subcategory_id = p.subcategory_id
    where id = v_group and category_id is null;
  end if;

  if p.id is null then
    insert into public.products (
      merchant_id, type, name, category_id, subcategory_id, sku, barcode, description, tags, status,
      sold_directly, track_inventory, storage_location, reorder_threshold, expiry_alert_on, perishable,
      conversion_factor, pack_unit_name, base_unit_name, sell_by, stock_role, group_id, attributes,
      internal_notes
    ) values (
      p.merchant_id, 'stock', p.name, p.category_id, p.subcategory_id, p.sku, p.barcode, p.description,
      coalesce(p.tags, '{}'), coalesce(p.status, 'active'),
      false, true, p.storage_location, p.reorder_threshold, p.expiry_alert_on, coalesce(p.perishable, true),
      coalesce(p.conversion_factor, 1), p.pack_unit_name, p.base_unit_name, p.sell_by, p.stock_role, v_group,
      coalesce(p.attributes, '{}'), p.internal_notes
    )
    returning id into v_id;
  else
    update public.products set
      name = p.name, category_id = p.category_id, subcategory_id = p.subcategory_id, sku = p.sku,
      barcode = p.barcode, description = p.description, tags = coalesce(p.tags, '{}'),
      status = coalesce(p.status, status), storage_location = p.storage_location,
      reorder_threshold = p.reorder_threshold, expiry_alert_on = p.expiry_alert_on,
      perishable = coalesce(p.perishable, perishable), conversion_factor = coalesce(p.conversion_factor, 1),
      pack_unit_name = p.pack_unit_name, base_unit_name = p.base_unit_name, sell_by = p.sell_by,
      stock_role = p.stock_role, group_id = v_group, attributes = coalesce(p.attributes, '{}'),
      internal_notes = p.internal_notes, updated_at = now()
    where id = p.id and type = 'stock'
    returning id into v_id;

    if v_id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p.id is null and coalesce((payload -> 'opening' ->> 'packs')::integer, 0)
       + coalesce((payload -> 'opening' ->> 'loose_units')::numeric, 0) > 0 then
    perform public.add_inventory_stock((payload -> 'opening') || jsonb_build_object('product_id', v_id));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_stock_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stock_item(jsonb) to authenticated;
