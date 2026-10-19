-- A variant group owns its category: every item in a group is filed where the group is, so Inventory and
-- Stock can fold a group into one folder under one category.
--
-- 1. product_groups gains category_id, subcategory_id and scope, keyed to Inventory's categories.
-- 2. private.group_category_to_item: an item joining a group, or saved in one, takes the group's category.
-- 3. private.group_category_to_items: a group's category changing moves its items with it.
-- 4. save_stock_item: a group with no category takes the category of the item saved into it.
-- 5. Backfill: each existing group takes its oldest categorised item's category, and §3 aligns the rest.
--
-- The first category a group gets sticks: once it has one, an item's own pick is overwritten by §2, and
-- the Inventory form shows the field disabled. A group with no category (made from a receipt line, which
-- has no category field) takes the next categorised item saved into it.
--
-- Both triggers are security invoker. Every row they touch belongs to the caller's merchant (the group
-- key is (group_id, merchant_id)), so RLS already allows it. Rejected: security definer, which would add
-- CLAUDE.md §6.2's three obligations for no reach the caller lacks.
--
-- Deleting a category sets a group's category to null (§1), and §3 then clears it from the group's
-- items, so a category used only by grouped items can be deleted. An ungrouped item still blocks the
-- delete, as products_category_fk (NO ACTION) always has.


-- 1. Columns.
alter table public.product_groups
  add column if not exists category_id uuid,
  add column if not exists subcategory_id uuid,
  add column if not exists scope public.category_scope not null default 'inventory';

alter table public.product_groups drop constraint if exists product_groups_scope_inventory;
alter table public.product_groups drop constraint if exists product_groups_category_fk;
alter table public.product_groups drop constraint if exists product_groups_subcategory_fk;

-- Groups are Inventory's only; the scope column exists so the keys below can name it.
alter table public.product_groups
  add constraint product_groups_scope_inventory check (scope = 'inventory');
alter table public.product_groups
  add constraint product_groups_category_fk foreign key (category_id, merchant_id, scope)
    references public.product_categories (id, merchant_id, scope) on delete set null (category_id);
alter table public.product_groups
  add constraint product_groups_subcategory_fk foreign key (subcategory_id, merchant_id, scope)
    references public.product_categories (id, merchant_id, scope) on delete set null (subcategory_id);

create index if not exists product_groups_category_id_idx on public.product_groups (category_id);
create index if not exists product_groups_subcategory_id_idx on public.product_groups (subcategory_id);


-- 2. Group to item, on the item's own write.
create or replace function private.group_category_to_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select g.category_id, g.subcategory_id into new.category_id, new.subcategory_id
  from public.product_groups g
  where g.id = new.group_id;
  return new;
end;
$$;

revoke execute on function private.group_category_to_item() from public, anon, authenticated, service_role;

drop trigger if exists products_group_category on public.products;
create trigger products_group_category
  before insert or update of group_id, category_id, subcategory_id on public.products
  for each row when (new.group_id is not null)
  execute function private.group_category_to_item();


-- 3. Group to its items, when the group's category changes.
create or replace function private.group_category_to_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.products p
  set category_id = new.category_id, subcategory_id = new.subcategory_id, updated_at = now()
  where p.group_id = new.id
    and (p.category_id is distinct from new.category_id or p.subcategory_id is distinct from new.subcategory_id);
  return null;
end;
$$;

revoke execute on function private.group_category_to_items() from public, anon, authenticated, service_role;

drop trigger if exists product_groups_category_to_items on public.product_groups;
create trigger product_groups_category_to_items
  after update of category_id, subcategory_id on public.product_groups
  for each row
  when (old.category_id is distinct from new.category_id or old.subcategory_id is distinct from new.subcategory_id)
  execute function private.group_category_to_items();


-- 4. save_stock_item: as 20260929100000_stock_items.sql §7, plus a group with no category taking the
-- item's before the item is written, so §2 hands the item back the category it was saved with.
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


-- 5. Backfill.
update public.product_groups g
set category_id = m.category_id, subcategory_id = m.subcategory_id
from (
  select distinct on (group_id) group_id, category_id, subcategory_id
  from public.products
  where group_id is not null and category_id is not null
  order by group_id, created_at
) m
where m.group_id = g.id and g.category_id is null;
