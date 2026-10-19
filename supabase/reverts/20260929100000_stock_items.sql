-- Reverts 20260929100000_stock_items.sql.
--
-- DESTROYS DATA: every product group, and each product's pack and base unit names, Sell By, role,
-- group, attributes and face link. Faces that never got a category are deleted (their component rows go
-- with them), because category_id becomes required again. Generated SKUs stay: sku is an older column,
-- and a SKU is never taken back.
--
-- Fails on purpose while a stock item has no category: give it one first rather than lose the item.
--
-- Run 20260929100100_stock_ledger.sql's revert first (.claude/instruction-mds/migrations.md rule 6). The app
-- expects the new shape — src/features/products and src/lib/database.types.ts — so regenerate the types
-- after running this.

drop function if exists public.save_stock_item(jsonb);
drop trigger if exists products_sync_register_faces on public.products;
drop function if exists private.sync_register_faces();
drop function if exists public.ensure_register_faces(uuid);
drop trigger if exists products_assign_sku on public.products;

delete from public.products where source_item_id is not null and category_id is null;

alter table if exists public.products drop constraint if exists products_stock_fields;
alter table if exists public.products drop constraint if exists products_category_required;
alter table if exists public.products alter column category_id set not null;

alter table if exists public.products drop constraint if exists products_unit_names_length;
alter table if exists public.products drop constraint if exists products_source_item_fk;
alter table if exists public.products drop constraint if exists products_group_fk;

alter table if exists public.products
  drop column if exists source_item_id,
  drop column if exists attributes,
  drop column if exists group_id,
  drop column if exists stock_role,
  drop column if exists sell_by,
  drop column if exists base_unit_name,
  drop column if exists pack_unit_name;

drop table if exists public.product_groups;

drop type if exists public.stock_role;
drop type if exists public.stock_sell_by;
