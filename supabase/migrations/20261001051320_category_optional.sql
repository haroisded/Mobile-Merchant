-- Category optional on every product: a sellable face may stay uncategorised once published
-- (Products is becoming Assets, and an asset's grouping comes from Inventory's folders, not from it).
--
-- Drops products_category_required (20260929100000_stock_items.sql), which let a product go without a
-- category only as a draft or a stock item. category_id is already nullable; nothing else reads the rule.

alter table public.products drop constraint if exists products_category_required;
