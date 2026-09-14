-- Products: the first business table (System-Context/Merchant-Products-Screen), with the three
-- per-merchant lookups its form picks from — categories, tax classes, suppliers — and the six child
-- sets a product carries: rate tiers, operating hours, variant attributes, variants, bundle
-- components and custom fields.
--
-- Every table here carries a not-null merchant_id from this first migration (docs/tenancy.md rule 2)
-- and every policy keys on private.current_merchant_ids(), which gets its first caller today
-- (docs/tenancy.md rule 3). Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;

-- 0. Let the policies below actually call the seam.
--
-- 20260908131200_merchants.sql revoked EXECUTE on current_merchant_ids() from authenticated, and
-- nothing granted USAGE on `private`. That was harmless while the function had no caller, but a
-- policy expression runs with the privileges of the role that issued the query — so every policy on
-- every table below would fail with "permission denied for schema private" (verified on the hosted
-- project 2026-09-14: both privileges false).
--
-- Granting them does not publish anything. PostgREST exposes `public` only, so a function in `private`
-- still has no /rest/v1/rpc/ URL, and the function answers for (select auth.uid()) alone — the other
-- two requirements of CLAUDE.md §6.2 carry the guarantee. The other functions in `private` keep their
-- EXECUTE revoked, so USAGE on the schema reaches none of them.
grant usage on schema private to authenticated;
grant execute on function private.current_merchant_ids() to authenticated;


-- 1. The currency a merchant's prices are shown in. ISO 4217 code, formatted on the client with
-- Intl.NumberFormat. Defaults to PHP because every existing merchant was set up with the Philippine
-- dial code first in the wizard; there is no setting UI for it yet.
alter table public.merchants add column if not exists currency text not null default 'PHP';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'merchants_currency_shape') then
    alter table public.merchants add constraint merchants_currency_shape check (currency ~ '^[A-Z]{3}$');
  end if;
end
$$;


-- 2. Enums. Each one generates a real union in src/lib/database.types.ts, which is what lets the form
-- index its label maps with no type assertion (the same trade store_category made). Adding a value
-- later is `alter type … add value` in a migration of its own.
do $$
begin
  if to_regtype('public.product_type') is null then
    create type public.product_type as enum ('stock', 'rental', 'bookable', 'flat');
  end if;
  if to_regtype('public.product_status') is null then
    create type public.product_status as enum ('draft', 'active', 'inactive', 'archived');
  end if;
  -- One list for Unit of Measure, Pricing Unit, purchase/usage units and duration units. Chosen fixed
  -- by the human over merchant-defined units, whose conversion factors between arbitrary custom
  -- units have no sensible meaning.
  if to_regtype('public.measure_unit') is null then
    create type public.measure_unit as enum (
      'piece', 'box', 'pack', 'kg', 'g', 'l', 'ml',
      'minute', 'hour', 'day', 'week', 'month', 'night', 'session'
    );
  end if;
  if to_regtype('public.duration_mode') is null then
    create type public.duration_mode as enum ('fixed_slot', 'flexible_range');
  end if;
  if to_regtype('public.rate_period') is null then
    create type public.rate_period as enum ('hour', 'day', 'week', 'month', 'night');
  end if;
  if to_regtype('public.custom_field_kind') is null then
    create type public.custom_field_kind as enum ('text', 'number', 'date', 'boolean');
  end if;
end
$$;


-- 3. Lookups.
--
-- Each has unique (id, merchant_id). That pair is what the product's foreign keys reference, so a
-- product can only ever point at a category, tax class or supplier of its own merchant — enforced by
-- the key itself, not by a policy that has to be remembered.

-- A subcategory is a category with a parent. ponytail: one level deep by convention — the picker only
-- offers top-level parents; a trigger enforcing depth is the upgrade if nesting ever appears.
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  parent_id uuid,
  name text not null,
  created_at timestamptz not null default now(),

  constraint product_categories_id_merchant unique (id, merchant_id),
  constraint product_categories_parent_fk foreign key (parent_id, merchant_id)
    references public.product_categories (id, merchant_id) on delete cascade,
  constraint product_categories_not_own_parent check (parent_id is null or parent_id <> id),
  constraint product_categories_name_length check (length(btrim(name)) between 1 and 60),
  -- nulls not distinct, so two top-level categories (parent_id null) cannot share a name either.
  constraint product_categories_name_unique unique nulls not distinct (merchant_id, parent_id, name)
);

alter table public.product_categories enable row level security;
create index if not exists product_categories_merchant_id_idx on public.product_categories (merchant_id);
create index if not exists product_categories_parent_id_idx on public.product_categories (parent_id);

create table if not exists public.tax_classes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  rate numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),

  constraint tax_classes_id_merchant unique (id, merchant_id),
  constraint tax_classes_name_length check (length(btrim(name)) between 1 and 60),
  constraint tax_classes_rate_range check (rate between 0 and 100),
  constraint tax_classes_name_unique unique (merchant_id, name)
);

alter table public.tax_classes enable row level security;
create index if not exists tax_classes_merchant_id_idx on public.tax_classes (merchant_id);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  contact text,
  created_at timestamptz not null default now(),

  constraint suppliers_id_merchant unique (id, merchant_id),
  constraint suppliers_name_length check (length(btrim(name)) between 1 and 80),
  constraint suppliers_contact_length check (contact is null or length(contact) <= 255)
);

alter table public.suppliers enable row level security;
create index if not exists suppliers_merchant_id_idx on public.suppliers (merchant_id);


-- 4. Products.
--
-- One wide row rather than a table per type. The four types share General, Pricing, Media and
-- Advanced, and differ only in which of the inventory and availability columns are meaningful; a table
-- per type would need a union to list products at all. Columns a type does not use stay null.
--
-- Foreign keys use the default NO ACTION rather than RESTRICT on purpose: deleting a merchant cascades
-- to both its categories and its products in one statement, and RESTRICT checks immediately — before
-- the cascade has removed the products — where NO ACTION waits for the end of the statement.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,

  -- General
  type public.product_type not null,
  name text not null,
  category_id uuid not null,
  subcategory_id uuid,
  sku text,
  barcode text,
  description text,
  tags text[] not null default '{}',
  status public.product_status not null default 'draft',
  sold_directly boolean not null default true,

  -- Pricing
  selling_price numeric(12, 2),
  cost_price numeric(12, 2),
  pricing_unit public.measure_unit,
  tax_class_id uuid,
  discountable boolean not null default true,
  deposit_amount numeric(12, 2),
  late_fee_per_hour numeric(12, 2),
  cancellation_fee numeric(12, 2),
  extra_unit_fee numeric(12, 2),

  -- Inventory (stock, rental)
  uom public.measure_unit,
  track_inventory boolean not null default true,
  qty_on_hand numeric(12, 3),
  reorder_threshold numeric(12, 3),
  reorder_qty numeric(12, 3),
  max_stock numeric(12, 3),
  storage_location text,
  supplier_id uuid,
  supplier_item_code text,
  lead_time_days integer,
  batch_tracking boolean not null default false,
  perishable boolean not null default false,
  shelf_life_days integer,
  expiry_date date,
  expiry_alert_days integer,
  purchase_unit public.measure_unit,
  usage_unit public.measure_unit,
  conversion_factor numeric(14, 4),

  -- Availability (rental, bookable)
  total_units integer,
  capacity_per_unit integer,
  duration_mode public.duration_mode,
  default_start_time time,
  default_end_time time,
  min_duration numeric(8, 2),
  min_duration_unit public.measure_unit,
  max_duration numeric(8, 2),
  max_duration_unit public.measure_unit,
  buffer_minutes integer,
  advance_window_days integer,
  blackout_dates date[] not null default '{}',
  overbooking_allowed boolean not null default false,

  -- Variants, recipe / bundle, advanced
  has_variants boolean not null default false,
  is_composite boolean not null default false,
  internal_notes text,

  -- The file name the Image-Pipeline brief stores (context/Image-Pipeline/packages.md §5). Written from
  -- this first migration so adding photos later is code only; nothing writes it yet.
  image_file text,

  -- PostgREST can filter a column against a value but not against another column, so "Low stock only"
  -- needs this spelled out. Stored, so the filter is a plain index-free equality on a small table.
  is_low_stock boolean generated always as (
    coalesce(track_inventory and qty_on_hand <= reorder_threshold, false)
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_id_merchant unique (id, merchant_id),
  constraint products_sku_unique unique (merchant_id, sku),
  constraint products_category_fk foreign key (category_id, merchant_id)
    references public.product_categories (id, merchant_id),
  constraint products_subcategory_fk foreign key (subcategory_id, merchant_id)
    references public.product_categories (id, merchant_id),
  -- The column list on SET NULL (Postgres 15+) nulls only the pointer. Without it the whole key pair
  -- would be nulled, merchant_id included, which the not-null constraint rejects.
  constraint products_tax_class_fk foreign key (tax_class_id, merchant_id)
    references public.tax_classes (id, merchant_id) on delete set null (tax_class_id),
  constraint products_supplier_fk foreign key (supplier_id, merchant_id)
    references public.suppliers (id, merchant_id) on delete set null (supplier_id),

  constraint products_name_length check (length(btrim(name)) between 1 and 120),
  constraint products_description_length check (description is null or length(description) <= 2000),
  constraint products_code_length check (
    (sku is null or length(sku) between 1 and 64) and (barcode is null or length(barcode) between 1 and 64)
  ),
  -- The spec's "Selling Price required if sold directly". A draft may be saved half-filled.
  constraint products_price_when_sold check (not sold_directly or status = 'draft' or selling_price is not null),
  constraint products_amounts_non_negative check (
    coalesce(selling_price, 0) >= 0 and coalesce(cost_price, 0) >= 0
    and coalesce(deposit_amount, 0) >= 0 and coalesce(late_fee_per_hour, 0) >= 0
    and coalesce(cancellation_fee, 0) >= 0 and coalesce(extra_unit_fee, 0) >= 0
    and coalesce(reorder_threshold, 0) >= 0 and coalesce(reorder_qty, 0) >= 0
    and coalesce(max_stock, 0) >= 0 and coalesce(total_units, 0) >= 0
    and coalesce(capacity_per_unit, 0) >= 0 and coalesce(buffer_minutes, 0) >= 0
    and coalesce(advance_window_days, 0) >= 0 and coalesce(lead_time_days, 0) >= 0
    and coalesce(shelf_life_days, 0) >= 0 and coalesce(expiry_alert_days, 0) >= 0
    and coalesce(min_duration, 0) >= 0 and coalesce(max_duration, 0) >= 0
  ),
  constraint products_conversion_positive check (conversion_factor is null or conversion_factor > 0)
);

alter table public.products enable row level security;
create index if not exists products_merchant_id_idx on public.products (merchant_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_subcategory_id_idx on public.products (subcategory_id);
create index if not exists products_tax_class_id_idx on public.products (tax_class_id);
create index if not exists products_supplier_id_idx on public.products (supplier_id);


-- 5. The child sets. Each references (product_id, merchant_id), so a child row cannot belong to a
-- product of another merchant, and carries merchant_id itself so its policy is the same one-line shape
-- as every other business table rather than a join back to products.

create table if not exists public.product_rate_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  position smallint not null default 0,
  period public.rate_period not null,
  price numeric(12, 2) not null,
  note text,

  constraint product_rate_tiers_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  constraint product_rate_tiers_price_non_negative check (price >= 0),
  constraint product_rate_tiers_note_length check (note is null or length(note) <= 80)
);

alter table public.product_rate_tiers enable row level security;
create index if not exists product_rate_tiers_product_id_idx on public.product_rate_tiers (product_id, merchant_id);
create index if not exists product_rate_tiers_merchant_id_idx on public.product_rate_tiers (merchant_id);

create table if not exists public.product_operating_hours (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  -- 0 = Sunday, matching Date.getDay() on the client.
  weekday smallint not null,
  opens time not null,
  closes time not null,

  constraint product_operating_hours_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  constraint product_operating_hours_weekday_range check (weekday between 0 and 6),
  constraint product_operating_hours_order check (opens < closes),
  constraint product_operating_hours_one_per_day unique (product_id, weekday)
);

alter table public.product_operating_hours enable row level security;
create index if not exists product_operating_hours_merchant_id_idx on public.product_operating_hours (merchant_id);

create table if not exists public.product_variant_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  position smallint not null default 0,
  name text not null,
  "values" text[] not null,

  constraint product_variant_attributes_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  constraint product_variant_attributes_name_length check (length(btrim(name)) between 1 and 40),
  constraint product_variant_attributes_has_values check (cardinality("values") >= 1)
);

alter table public.product_variant_attributes enable row level security;
create index if not exists product_variant_attributes_product_id_idx on public.product_variant_attributes (product_id, merchant_id);
create index if not exists product_variant_attributes_merchant_id_idx on public.product_variant_attributes (merchant_id);

-- One row per attribute combination. qty_on_hand and barcode per variant were chosen by the human on
-- top of the spec's SKU and price delta.
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  position smallint not null default 0,
  label text not null,
  options text[] not null,
  sku text,
  barcode text,
  price_delta numeric(12, 2) not null default 0,
  qty_on_hand numeric(12, 3),

  constraint product_variants_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  constraint product_variants_label_unique unique (product_id, label),
  constraint product_variants_code_length check (
    (sku is null or length(sku) between 1 and 64) and (barcode is null or length(barcode) between 1 and 64)
  ),
  constraint product_variants_qty_non_negative check (coalesce(qty_on_hand, 0) >= 0)
);

alter table public.product_variants enable row level security;
create index if not exists product_variants_merchant_id_idx on public.product_variants (merchant_id);

-- The bill of materials: product_id is the bundle, component_id the product it contains.
create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  position smallint not null default 0,
  component_id uuid not null,
  qty numeric(12, 3) not null,
  unit public.measure_unit,

  constraint product_components_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  -- NO ACTION, not cascade: deleting a product that is inside a bundle fails (23503) instead of
  -- silently emptying the bundle. The client turns that into "used in a bundle" copy.
  constraint product_components_component_fk foreign key (component_id, merchant_id)
    references public.products (id, merchant_id),
  constraint product_components_not_self check (component_id <> product_id),
  constraint product_components_once unique (product_id, component_id),
  constraint product_components_qty_positive check (qty > 0)
);

alter table public.product_components enable row level security;
create index if not exists product_components_component_id_idx on public.product_components (component_id, merchant_id);
create index if not exists product_components_merchant_id_idx on public.product_components (merchant_id);

create table if not exists public.product_custom_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  merchant_id uuid not null,
  position smallint not null default 0,
  label text not null,
  kind public.custom_field_kind not null default 'text',
  value text,

  constraint product_custom_fields_product_fk foreign key (product_id, merchant_id)
    references public.products (id, merchant_id) on delete cascade,
  constraint product_custom_fields_label_length check (length(btrim(label)) between 1 and 40),
  constraint product_custom_fields_value_length check (value is null or length(value) <= 500)
);

alter table public.product_custom_fields enable row level security;
create index if not exists product_custom_fields_product_id_idx on public.product_custom_fields (product_id, merchant_id);
create index if not exists product_custom_fields_merchant_id_idx on public.product_custom_fields (merchant_id);


-- 6. Policies. The same four on every table above, keyed on membership of the row's merchant
-- (docs/tenancy.md §3). Written as a loop because ten tables of forty hand-copied statements is where a
-- missing `with check` hides.
--
-- Scoped `to authenticated`; the function call wrapped in a select so the planner runs it once per
-- statement as an InitPlan; update carries both `using` and `with check`, so a row cannot be moved to
-- another merchant (CLAUDE.md §6.3).
do $$
declare
  t text;
begin
  foreach t in array array[
    'product_categories', 'tax_classes', 'suppliers', 'products',
    'product_rate_tiers', 'product_operating_hours', 'product_variant_attributes',
    'product_variants', 'product_components', 'product_custom_fields'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own_merchant', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (merchant_id in (select private.current_merchant_ids()))',
      t || '_select_own_merchant', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert_own_merchant', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (merchant_id in (select private.current_merchant_ids()))',
      t || '_insert_own_merchant', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update_own_merchant', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (merchant_id in (select private.current_merchant_ids()))
         with check (merchant_id in (select private.current_merchant_ids()))',
      t || '_update_own_merchant', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete_own_merchant', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (merchant_id in (select private.current_merchant_ids()))',
      t || '_delete_own_merchant', t
    );
  end loop;
end
$$;


-- 7. The circular-bundle guard. A check constraint can see only its own row, so "A contains B contains
-- A" needs a walk: from the new component, follow what it contains, and fail if the walk reaches the
-- bundle being written. `union` (not `union all`) is what stops the walk on data that is already cyclic.
--
-- Security invoker: RLS already limits the walk to the caller's merchant, and the composite foreign keys
-- mean a cycle cannot cross merchants anyway. Execute revoked like every function in `private` —
-- Postgres checks a trigger function's EXECUTE when the trigger is created, not when it fires.
create or replace function private.assert_no_bundle_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive reach (id) as (
      select new.component_id
      union
      select pc.component_id
      from public.product_components pc
      join reach r on pc.product_id = r.id
    )
    select 1 from reach where reach.id = new.product_id
  ) then
    -- The message is the stable part the client matches on; never shown to the user.
    raise exception 'product_components_cycle'
      using errcode = '23514', detail = 'A bundle cannot contain itself, directly or through another bundle.';
  end if;
  return new;
end;
$$;

revoke execute on function private.assert_no_bundle_cycle() from public, anon, authenticated, service_role;

drop trigger if exists product_components_no_cycle on public.product_components;
create trigger product_components_no_cycle
  before insert or update of product_id, component_id on public.product_components
  for each row execute function private.assert_no_bundle_cycle();


-- 8. save_product: the whole form in one transaction.
--
-- A product save touches up to seven tables. Written from the client as seven requests, a dropped
-- connection halfway leaves a product with half its variants; as one function call it lands whole or
-- not at all.
--
-- Security INVOKER, so none of CLAUDE.md §6.2's escalation applies: every statement inside runs as the
-- caller, and the policies above gate each one exactly as they would a direct request. It is in
-- `public` because it is meant to be called; anon is revoked because there is nothing for anon to save.
--
-- ponytail: the child sets are deleted and reinserted, which gives variants new ids on every save. Fine
-- while nothing references a variant; switch to keyed upserts when orders do.
create or replace function public.save_product(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.products;
  v_id uuid;
  v_merchant uuid;
begin
  p := jsonb_populate_record(null::public.products, payload -> 'product');

  if p.id is null then
    insert into public.products (
      merchant_id, type, name, category_id, subcategory_id, sku, barcode, description, tags, status,
      sold_directly, selling_price, cost_price, pricing_unit, tax_class_id, discountable,
      deposit_amount, late_fee_per_hour, cancellation_fee, extra_unit_fee,
      uom, track_inventory, qty_on_hand, reorder_threshold, reorder_qty, max_stock, storage_location,
      supplier_id, supplier_item_code, lead_time_days, batch_tracking, perishable, shelf_life_days,
      expiry_date, expiry_alert_days, purchase_unit, usage_unit, conversion_factor,
      total_units, capacity_per_unit, duration_mode, default_start_time, default_end_time,
      min_duration, min_duration_unit, max_duration, max_duration_unit, buffer_minutes,
      advance_window_days, blackout_dates, overbooking_allowed,
      has_variants, is_composite, internal_notes
    ) values (
      p.merchant_id, p.type, p.name, p.category_id, p.subcategory_id, p.sku, p.barcode, p.description,
      coalesce(p.tags, '{}'), coalesce(p.status, 'draft'),
      coalesce(p.sold_directly, true), p.selling_price, p.cost_price, p.pricing_unit, p.tax_class_id,
      coalesce(p.discountable, true),
      p.deposit_amount, p.late_fee_per_hour, p.cancellation_fee, p.extra_unit_fee,
      p.uom, coalesce(p.track_inventory, true), p.qty_on_hand, p.reorder_threshold, p.reorder_qty,
      p.max_stock, p.storage_location,
      p.supplier_id, p.supplier_item_code, p.lead_time_days, coalesce(p.batch_tracking, false),
      coalesce(p.perishable, false), p.shelf_life_days,
      p.expiry_date, p.expiry_alert_days, p.purchase_unit, p.usage_unit, p.conversion_factor,
      p.total_units, p.capacity_per_unit, p.duration_mode, p.default_start_time, p.default_end_time,
      p.min_duration, p.min_duration_unit, p.max_duration, p.max_duration_unit, p.buffer_minutes,
      p.advance_window_days, coalesce(p.blackout_dates, '{}'), coalesce(p.overbooking_allowed, false),
      coalesce(p.has_variants, false), coalesce(p.is_composite, false), p.internal_notes
    )
    returning id, merchant_id into v_id, v_merchant;
  else
    -- merchant_id is deliberately not in the SET list: a product does not move between merchants, and
    -- its child rows' composite keys would refuse it anyway.
    update public.products set
      type = p.type, name = p.name, category_id = p.category_id, subcategory_id = p.subcategory_id,
      sku = p.sku, barcode = p.barcode, description = p.description, tags = coalesce(p.tags, '{}'),
      status = coalesce(p.status, 'draft'), sold_directly = coalesce(p.sold_directly, true),
      selling_price = p.selling_price, cost_price = p.cost_price, pricing_unit = p.pricing_unit,
      tax_class_id = p.tax_class_id, discountable = coalesce(p.discountable, true),
      deposit_amount = p.deposit_amount, late_fee_per_hour = p.late_fee_per_hour,
      cancellation_fee = p.cancellation_fee, extra_unit_fee = p.extra_unit_fee,
      uom = p.uom, track_inventory = coalesce(p.track_inventory, true), qty_on_hand = p.qty_on_hand,
      reorder_threshold = p.reorder_threshold, reorder_qty = p.reorder_qty, max_stock = p.max_stock,
      storage_location = p.storage_location, supplier_id = p.supplier_id,
      supplier_item_code = p.supplier_item_code, lead_time_days = p.lead_time_days,
      batch_tracking = coalesce(p.batch_tracking, false), perishable = coalesce(p.perishable, false),
      shelf_life_days = p.shelf_life_days, expiry_date = p.expiry_date,
      expiry_alert_days = p.expiry_alert_days, purchase_unit = p.purchase_unit,
      usage_unit = p.usage_unit, conversion_factor = p.conversion_factor,
      total_units = p.total_units, capacity_per_unit = p.capacity_per_unit,
      duration_mode = p.duration_mode, default_start_time = p.default_start_time,
      default_end_time = p.default_end_time, min_duration = p.min_duration,
      min_duration_unit = p.min_duration_unit, max_duration = p.max_duration,
      max_duration_unit = p.max_duration_unit, buffer_minutes = p.buffer_minutes,
      advance_window_days = p.advance_window_days, blackout_dates = coalesce(p.blackout_dates, '{}'),
      overbooking_allowed = coalesce(p.overbooking_allowed, false),
      has_variants = coalesce(p.has_variants, false), is_composite = coalesce(p.is_composite, false),
      internal_notes = p.internal_notes, updated_at = now()
    where id = p.id
    returning id, merchant_id into v_id, v_merchant;

    -- RLS filters an UPDATE rather than refusing it, so another merchant's id updates zero rows.
    if v_id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.product_rate_tiers where product_id = v_id;
  delete from public.product_operating_hours where product_id = v_id;
  delete from public.product_variant_attributes where product_id = v_id;
  delete from public.product_variants where product_id = v_id;
  delete from public.product_components where product_id = v_id;
  delete from public.product_custom_fields where product_id = v_id;

  insert into public.product_rate_tiers (product_id, merchant_id, position, period, price, note)
  select v_id, v_merchant, (e.idx - 1)::smallint, x.period, x.price, x.note
  from jsonb_array_elements(coalesce(payload -> 'rate_tiers', '[]')) with ordinality as e (value, idx)
  cross join lateral jsonb_populate_record(null::public.product_rate_tiers, e.value) as x;

  insert into public.product_operating_hours (product_id, merchant_id, weekday, opens, closes)
  select v_id, v_merchant, x.weekday, x.opens, x.closes
  from jsonb_array_elements(coalesce(payload -> 'operating_hours', '[]')) as e (value)
  cross join lateral jsonb_populate_record(null::public.product_operating_hours, e.value) as x;

  insert into public.product_variant_attributes (product_id, merchant_id, position, name, "values")
  select v_id, v_merchant, (e.idx - 1)::smallint, x.name, x."values"
  from jsonb_array_elements(coalesce(payload -> 'variant_attributes', '[]')) with ordinality as e (value, idx)
  cross join lateral jsonb_populate_record(null::public.product_variant_attributes, e.value) as x;

  insert into public.product_variants (
    product_id, merchant_id, position, label, options, sku, barcode, price_delta, qty_on_hand
  )
  select v_id, v_merchant, (e.idx - 1)::smallint, x.label, x.options, x.sku, x.barcode,
    coalesce(x.price_delta, 0), x.qty_on_hand
  from jsonb_array_elements(coalesce(payload -> 'variants', '[]')) with ordinality as e (value, idx)
  cross join lateral jsonb_populate_record(null::public.product_variants, e.value) as x;

  insert into public.product_components (product_id, merchant_id, position, component_id, qty, unit)
  select v_id, v_merchant, (e.idx - 1)::smallint, x.component_id, x.qty, x.unit
  from jsonb_array_elements(coalesce(payload -> 'components', '[]')) with ordinality as e (value, idx)
  cross join lateral jsonb_populate_record(null::public.product_components, e.value) as x;

  insert into public.product_custom_fields (product_id, merchant_id, position, label, kind, value)
  select v_id, v_merchant, (e.idx - 1)::smallint, x.label, coalesce(x.kind, 'text'), x.value
  from jsonb_array_elements(coalesce(payload -> 'custom_fields', '[]')) with ordinality as e (value, idx)
  cross join lateral jsonb_populate_record(null::public.product_custom_fields, e.value) as x;

  return v_id;
end;
$$;

revoke execute on function public.save_product(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_product(jsonb) to authenticated;
