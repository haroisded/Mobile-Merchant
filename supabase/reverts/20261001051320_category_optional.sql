-- Reverts 20261001051320_category_optional.sql.
--
-- FAILS while any product that is neither a draft nor a stock item has no category: give those a
-- category, or set them back to draft, first.

-- Does nothing once 20261008050254_revamp_drop_business_schema.sql has run: that drop-only migration took
-- public.products and every object below, and all-in-one/revert.sql reaches this block after it.
do $revert$
begin
  if to_regclass('public.products') is null then
    return;
  end if;

alter table public.products drop constraint if exists products_category_required;
alter table public.products
  add constraint products_category_required check (category_id is not null or status = 'draft' or type = 'stock');
end
$revert$;
