-- Reverts 20260914000000_products.sql.
--
-- DESTROYS DATA: every product, category, tax class and supplier of every merchant, with all their
-- rate tiers, operating hours, variants, components and custom fields. merchants.currency goes too.
--
-- The app expects the new shape — src/features/products, src/features/categories,
-- src/features/tax-classes, src/features/suppliers and src/lib/database.types.ts all name it — so
-- regenerate the types after running this.
--
-- Newest revert, so nothing has to run before it (docs/migrations.md rule 6).

drop function if exists public.save_product(jsonb);

-- Dropping product_components takes its trigger with it; the function is dropped after the table.
drop table if exists public.product_custom_fields;
drop table if exists public.product_components;
drop table if exists public.product_variants;
drop table if exists public.product_variant_attributes;
drop table if exists public.product_operating_hours;
drop table if exists public.product_rate_tiers;
drop table if exists public.products;
drop table if exists public.suppliers;
drop table if exists public.tax_classes;
drop table if exists public.product_categories;

drop function if exists private.assert_no_bundle_cycle();

-- After the tables whose columns use them.
drop type if exists public.custom_field_kind;
drop type if exists public.rate_period;
drop type if exists public.duration_mode;
drop type if exists public.measure_unit;
drop type if exists public.product_status;
drop type if exists public.product_type;

alter table if exists public.merchants drop constraint if exists merchants_currency_shape;
alter table if exists public.merchants drop column if exists currency;

-- Back to how 20260908131200_merchants.sql left the seam: no caller, no grant.
do $$
begin
  if to_regprocedure('private.current_merchant_ids()') is not null then
    revoke execute on function private.current_merchant_ids() from authenticated;
  end if;
end
$$;
revoke usage on schema private from authenticated;
