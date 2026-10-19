-- Drop the business schema: the product catalogue, suppliers, the stock ledger and the Register.
--
-- On 2026-10-08 the app was cut back to the systems list and an empty Home inside a system, ahead
-- of a rebuild on ERPNext's model. Every screen that read or wrote these objects is gone. What was
-- left behind is not inert: each table in `public` is still a PostgREST URL, and each function
-- below is still a `/rest/v1/rpc/<name>` endpoint, reachable with the publishable key that ships in
-- the app bundle, with no screen and no test behind it.
--
-- THIS DESTROYS DATA. Every row in the nineteen business tables and in private.merchant_counters,
-- and the category, address, contact_email, phone and currency of every merchant. Regenerate
-- src/lib/database.types.ts once it lands.
--
-- What stays: public.profiles with its signup trigger and delete_current_user; public.merchants as
-- id, owner_id, name and created_at, with its four owner policies; private.rls_auto_enable; and
-- private.current_merchant_ids() WITH its two grants to `authenticated` — the tenancy seam the next
-- business tables call (.claude/instruction-mds/tenancy.md §4). It goes back to having no caller, which is
-- how it started.
--
-- The order is the dependency order, because nothing here uses `cascade`: a dependent this file
-- does not name should stop it, not be taken with it. RPCs first; then private.create_lot, whose
-- signature names three tables' row types; the two views over the ledger; the tables, children
-- before parents (their policies, indexes and triggers go with them); the trigger and helper
-- functions those triggers called; the enums the columns used; and last the merchants columns the
-- name-only create form no longer writes.
--
-- `if exists` everywhere, so a clone pointed at a fresh project — which runs every earlier
-- migration first — and a project where some of this is already gone both succeed.
--
-- No revert file (.claude/instruction-mds/migrations.md rule 2): reverting would rebuild a schema no screen
-- uses, and the rows it held would not come back with it.
-- no-revert: drop-only; its revert would recreate a schema no screen uses, without its data

-- RPCs.
drop function if exists public.record_sale(payload jsonb);
drop function if exists public.void_sale(p_sale uuid, p_reason text);
drop function if exists public.void_receipt(p_receipt uuid, p_reason text);
drop function if exists public.record_stock_movement(payload jsonb);
drop function if exists public.draw_stock(payload jsonb);
drop function if exists public.add_inventory_stock(payload jsonb);
drop function if exists public.save_receipt(payload jsonb);
drop function if exists public.save_stock_item(payload jsonb);
drop function if exists public.ensure_register_faces(p_item uuid);
drop function if exists public.save_product(payload jsonb);

-- Before the tables whose row types its signature names.
drop function if exists private.create_lot(public.products, public.stock_receipts, integer, jsonb);
drop function if exists private.recompute_stock(p_product uuid);

-- The views over stock_lots and stock_packs.
drop view if exists public.stock_pick_queue;
drop view if exists public.stock_lot_lines;

-- Tables, children before parents.
drop table if exists public.sale_lines;
drop table if exists public.sales;
drop table if exists public.stock_movements;
drop table if exists public.stock_packs;
drop table if exists public.stock_cases;
drop table if exists public.stock_lots;
drop table if exists public.stock_receipts;
drop table if exists public.product_rate_tiers;
drop table if exists public.product_operating_hours;
drop table if exists public.product_variants;
drop table if exists public.product_variant_attributes;
drop table if exists public.product_components;
drop table if exists public.product_custom_fields;
drop table if exists public.products;
drop table if exists public.product_groups;
drop table if exists public.suppliers;
drop table if exists public.supplier_types;
drop table if exists public.tax_classes;
drop table if exists public.product_categories;
drop table if exists private.merchant_counters;

-- Trigger and helper functions, now attached to nothing.
drop function if exists private.assert_no_bundle_cycle();
drop function if exists private.set_product_scope();
drop function if exists private.sync_register_faces();
drop function if exists private.guard_stock_item();
drop function if exists private.group_category_to_item();
drop function if exists private.group_category_to_items();
drop function if exists private.assign_code();
drop function if exists private.assert_member(p_merchant uuid);
drop function if exists private.issue_code(p_merchant uuid, p_kind text, p_prefix text, p_width integer, p_table regclass, p_column text);
drop function if exists private.next_number(p_merchant uuid, p_kind text);

-- The enums those tables' columns used.
drop type if exists public.category_scope;
drop type if exists public.custom_field_kind;
drop type if exists public.duration_mode;
drop type if exists public.measure_unit;
drop type if exists public.product_status;
drop type if exists public.product_type;
drop type if exists public.rate_period;
drop type if exists public.stock_lot_source;
drop type if exists public.stock_movement_kind;
drop type if exists public.stock_role;
drop type if exists public.stock_sell_by;
drop type if exists public.write_off_reason;

-- The merchants columns the name-only create form no longer writes, each check before its column.
alter table public.merchants
  drop constraint if exists merchants_currency_shape,
  drop constraint if exists merchants_address_length,
  drop constraint if exists merchants_contact_email_shape,
  drop constraint if exists merchants_phone_shape,
  drop column if exists currency,
  drop column if exists address,
  drop column if exists contact_email,
  drop column if exists phone,
  drop column if exists category;

drop type if exists public.store_category;
