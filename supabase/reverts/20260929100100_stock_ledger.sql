-- Reverts 20260929100100_stock_ledger.sql.
--
-- DESTROYS DATA: every receipt, lot, case, pack and serial, and the whole stock ledger. Each item's
-- qty_on_hand and cost_price stay at their last computed values and become plain editable columns again,
-- so what is on hand survives as a number with no lot, expiry or history behind it. Re-applying turns
-- those numbers back into Inventory-added stock.
--
-- Run this before 20260929100000_stock_items.sql's revert (.claude/instruction-mds/migrations.md rule 6). The app
-- expects the new shape — src/features and src/lib/database.types.ts — so regenerate the types after.

drop function if exists public.void_receipt(uuid, text);
drop function if exists public.record_stock_movement(jsonb);
drop function if exists public.draw_stock(jsonb);
drop function if exists public.add_inventory_stock(jsonb);
drop function if exists public.save_receipt(jsonb);
drop function if exists private.create_lot(public.products, public.stock_receipts, integer, jsonb);
drop function if exists private.recompute_stock(uuid);

drop trigger if exists products_guard_stock on public.products;
drop function if exists private.guard_stock_item();

drop view if exists public.stock_pick_queue;
drop view if exists public.stock_lot_lines;

drop table if exists public.stock_movements;
drop table if exists public.stock_packs;
drop table if exists public.stock_cases;
drop table if exists public.stock_lots;
drop table if exists public.stock_receipts;

drop type if exists public.stock_lot_source;
drop type if exists public.write_off_reason;
drop type if exists public.stock_movement_kind;
