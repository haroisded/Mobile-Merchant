-- Reverts 20260930110000_sales.sql.
--
-- DESTROYS DATA: every sale and sale line. The stock movements the sales made stay in the ledger, since
-- the ledger is append-only and the packs already reflect them. The Register and Receipts screens expect
-- these tables — src/features/sales and src/lib/database.types.ts — so regenerate the types after.

-- Does nothing once 20261008050254_revamp_drop_business_schema.sql has run: that drop-only migration took
-- public.products and every object below, and all-in-one/revert.sql reaches this block after it.
do $revert$
begin
  if to_regclass('public.products') is null then
    return;
  end if;

drop function if exists public.void_sale(uuid, text);
drop function if exists public.record_sale(jsonb);

drop index if exists public.stock_movements_ref_idx;

drop table if exists public.sale_lines;
drop table if exists public.sales;

delete from private.merchant_counters where kind = 'sale';
end
$revert$;
