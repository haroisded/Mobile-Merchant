-- Reverts 20261001051320_category_optional.sql.
--
-- FAILS while any product that is neither a draft nor a stock item has no category: give those a
-- category, or set them back to draft, first.

alter table public.products drop constraint if exists products_category_required;
alter table public.products
  add constraint products_category_required check (category_id is not null or status = 'draft' or type = 'stock');
