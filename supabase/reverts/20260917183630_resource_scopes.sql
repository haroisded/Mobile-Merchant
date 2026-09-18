-- Reverts 20260917120000_resource_scopes.sql.
--
-- Destroys data: only the scope of each category. Categories, products and stock counts all stay.
-- It fails on purpose if two Resources screens each hold a category with the same name under the same
-- parent. The old unique key allowed one name per parent across every screen; rename one before
-- reverting.
--
-- The app expects the scoped shape (src/features/products/resources.ts, the three Resources screens),
-- so regenerate src/lib/database.types.ts after running this.
--
-- Newest revert, so nothing has to run before it (docs/migrations.md rule 6).

drop trigger if exists set_product_scope on public.products;
drop function if exists private.set_product_scope();

alter table if exists public.products drop constraint if exists products_subcategory_fk;
alter table if exists public.products drop constraint if exists products_category_fk;
alter table if exists public.product_categories drop constraint if exists product_categories_name_unique;
alter table if exists public.product_categories drop constraint if exists product_categories_parent_fk;
alter table if exists public.product_categories drop constraint if exists product_categories_id_merchant_scope;

alter table if exists public.products drop column if exists scope;
alter table if exists public.product_categories drop column if exists scope;
drop type if exists public.category_scope;

-- Back to the keys 20260914092147_products.sql created.
alter table public.product_categories
  add constraint product_categories_parent_fk foreign key (parent_id, merchant_id)
    references public.product_categories (id, merchant_id) on delete cascade;
alter table public.product_categories
  add constraint product_categories_name_unique unique nulls not distinct (merchant_id, parent_id, name);
alter table public.products
  add constraint products_category_fk foreign key (category_id, merchant_id)
    references public.product_categories (id, merchant_id);
alter table public.products
  add constraint products_subcategory_fk foreign key (subcategory_id, merchant_id)
    references public.product_categories (id, merchant_id);

-- save_product as 20260914092147_products.sql wrote it: `type` writable again on update.
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
