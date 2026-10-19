-- Reverts 20261001052003_group_category.sql.
--
-- Items keep the category §2 and §3 gave them; only the group's own category and the triggers go.

drop trigger if exists product_groups_category_to_items on public.product_groups;
drop trigger if exists products_group_category on public.products;
drop function if exists private.group_category_to_items();
drop function if exists private.group_category_to_item();

-- save_stock_item as 20260929100000_stock_items.sql §7.
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

  if p.id is null then
    insert into public.products (
      merchant_id, type, name, category_id, subcategory_id, sku, barcode, description, tags, status,
      sold_directly, track_inventory, storage_location, reorder_threshold, expiry_alert_days, perishable,
      conversion_factor, pack_unit_name, base_unit_name, sell_by, stock_role, group_id, attributes,
      internal_notes
    ) values (
      p.merchant_id, 'stock', p.name, p.category_id, p.subcategory_id, p.sku, p.barcode, p.description,
      coalesce(p.tags, '{}'), coalesce(p.status, 'active'),
      false, true, p.storage_location, p.reorder_threshold, p.expiry_alert_days, coalesce(p.perishable, true),
      coalesce(p.conversion_factor, 1), p.pack_unit_name, p.base_unit_name, p.sell_by, p.stock_role, v_group,
      coalesce(p.attributes, '{}'), p.internal_notes
    )
    returning id into v_id;
  else
    update public.products set
      name = p.name, category_id = p.category_id, subcategory_id = p.subcategory_id, sku = p.sku,
      barcode = p.barcode, description = p.description, tags = coalesce(p.tags, '{}'),
      status = coalesce(p.status, status), storage_location = p.storage_location,
      reorder_threshold = p.reorder_threshold, expiry_alert_days = p.expiry_alert_days,
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

drop index if exists public.product_groups_subcategory_id_idx;
drop index if exists public.product_groups_category_id_idx;
alter table if exists public.product_groups drop constraint if exists product_groups_subcategory_fk;
alter table if exists public.product_groups drop constraint if exists product_groups_category_fk;
alter table if exists public.product_groups drop constraint if exists product_groups_scope_inventory;
alter table if exists public.product_groups
  drop column if exists scope,
  drop column if exists subcategory_id,
  drop column if exists category_id;
