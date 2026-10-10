-- Step 10 of the POS foundation, with 9.3, on ERPNext's model: Stock Settings
-- (.claude/erpnext-docs/POS-System-Only-Features.md 9.3, 10.1; docs.frappe.io/erpnext/stock-settings,
-- /fifo-and-moving-average, /change-valuation-method).
--
-- stock_settings: a single per system — how new items are named, the item group, unit and warehouse they
-- start with, the valuation method that will cost each sale, whether stock may go negative, and whether a
-- first sale's rate becomes the item's price.
--
-- Out of scope, so absent: Show Barcode Field (no barcode), LIFO and Standard Cost (FIFO and Moving Average
-- only), sample retention, over-delivery allowances, serial and batch settings, automatic Material Requests,
-- inter-warehouse transfers and frozen stock. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;

create table if not exists public.stock_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- Item Code: an item is named by the code typed for it. Naming Series: by the Item series (Step 12).
  item_naming_by text not null default 'Item Code',
  -- What a new item starts with.
  item_group uuid,
  stock_uom uuid,
  default_warehouse uuid,
  -- How each sale's cost of goods is worked out; a new item takes it.
  valuation_method text not null default 'FIFO',
  allow_negative_stock boolean not null default false,
  -- An item's first sale writes its rate into the price list as the item's price.
  auto_insert_price_list_rate_if_missing boolean not null default false,

  constraint stock_settings_item_naming_by check (item_naming_by in ('Item Code', 'Naming Series')),
  constraint stock_settings_valuation_method check (valuation_method in ('FIFO', 'Moving Average')),
  -- Deleting a group, unit or warehouse named here fails with 23503 ("in use").
  constraint stock_settings_item_group_fk foreign key (item_group, merchant_id) references public.item_groups (id, merchant_id),
  constraint stock_settings_uom_fk foreign key (stock_uom, merchant_id) references public.uoms (id, merchant_id),
  constraint stock_settings_warehouse_fk foreign key (default_warehouse, merchant_id) references public.warehouses (id, merchant_id)
);

alter table public.stock_settings enable row level security;
create index if not exists stock_settings_item_group_idx on public.stock_settings (item_group, merchant_id);
create index if not exists stock_settings_uom_idx on public.stock_settings (stock_uom, merchant_id);
create index if not exists stock_settings_warehouse_idx on public.stock_settings (default_warehouse, merchant_id);

-- The warehouse an enabled non-group one, the unit an enabled one
-- (20261010011003_item_groups_and_selling_settings.sql).
drop trigger if exists stock_settings_validate_defaults on public.stock_settings;
create trigger stock_settings_validate_defaults
  before insert or update of stock_uom, default_warehouse on public.stock_settings
  for each row execute function private.validate_defaults();


-- Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Stock Settings', 'stock_settings', 'single', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('System Manager', 'Stock Settings', true, true, true, false, false),
  ('Stock Manager', 'Stock Settings', true, true, true, false, false),
  ('All', 'Stock Settings', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('stock_settings', 'Stock Settings');


-- Seeding: what ERPNext's setup wizard sets — new items in Products, counted in Nos, kept in Stores, valued
-- FIFO. Each default is found by name, so a renamed one is left empty.

create or replace function private.seed_stock_settings_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.stock_settings (merchant_id, item_group, stock_uom, default_warehouse)
  values (
    p_merchant,
    (select g.id from public.item_groups g where g.merchant_id = p_merchant and g.item_group_name = 'Products'),
    (select u.id from public.uoms u where u.merchant_id = p_merchant and u.uom_name = 'Nos' and u.enabled),
    (select w.id from public.warehouses w where w.merchant_id = p_merchant and w.warehouse_name = 'Stores' and not w.is_group and not w.disabled)
  )
  on conflict (merchant_id) do nothing;
$$;

revoke execute on function private.seed_stock_settings_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_stock_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_stock_settings_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_stock_settings() from public, anon, authenticated, service_role;

-- After merchants_seed_80_stock and merchants_seed_90_selling, by name: Nos, Stores and Products exist when
-- this runs. 92, not 100 — triggers fire in name order, and "100" sorts before "20".
drop trigger if exists merchants_seed_92_stock_settings on public.merchants;
create trigger merchants_seed_92_stock_settings
  after insert on public.merchants
  for each row execute function private.seed_stock_settings();

-- The systems that already exist.
select private.seed_stock_settings_for(m.id) from public.merchants m;
