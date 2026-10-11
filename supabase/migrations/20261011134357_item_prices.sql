-- Step 14 of the POS system, on ERPNext's model: Selling Prices
-- (.claude/erpnext-docs/POS-System-Added-Features.md 14.1; docs.frappe.io/erpnext/item-price,
-- /Selling-in-different-UOM).
--
-- 1. item_prices: the rate of one item in one price list for one unit, with Valid From and Valid Upto.
-- 2. public.save_item(), re-created: a new item's Standard Selling Rate writes its Item Price in Selling
--    Settings' default price list, as ERPNext's Item does on creation.
-- 3. The doctype, its permissions and policies. No seed.
--
-- Finding a sale's price — price list, unit and date, then Selling Settings' fallback and Price Not UOM
-- Dependent — is src/features/item-prices/resolve.ts, as picking a tax rule is resolve.ts: the sale is built
-- on the device. Stock Settings' auto-insert of a missing rate arrives with the POS Invoice (Step 18).
--
-- Out of scope, so absent: buying prices, a price for one Customer or Supplier, a price for one Batch, Packing
-- Unit, Minimum Quantity, Lead Time and Note. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Item Prices.

create table if not exists public.item_prices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id uuid not null,
  price_list_id uuid not null,
  -- "A price is always specific to a certain UOM": the item's stock unit, or one of its UOMs rows.
  uom_id uuid not null,
  price_list_rate numeric not null,
  -- Blank: no start, or no end.
  valid_from date,
  valid_upto date,
  created_at timestamptz not null default now(),

  constraint item_prices_id_merchant unique (id, merchant_id),
  constraint item_prices_rate check (price_list_rate >= 0),
  constraint item_prices_dates check (valid_from is null or valid_upto is null or valid_from <= valid_upto),
  -- ERPNext's "Item Price appears multiple times": the same item, price list, unit and dates (23505). Prices
  -- whose dates only overlap are allowed, as there — a dated price over an open-ended one; the later Valid
  -- From wins on a sale.
  constraint item_prices_unique unique nulls not distinct (merchant_id, item_id, price_list_id, uom_id, valid_from, valid_upto),
  -- An item's prices go with it, as ERPNext deletes them with the Item.
  constraint item_prices_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id) on delete cascade,
  -- Deleting a price list or unit a price names fails with 23503 ("in use").
  constraint item_prices_price_list_fk foreign key (price_list_id, merchant_id) references public.price_lists (id, merchant_id),
  constraint item_prices_uom_fk foreign key (uom_id, merchant_id) references public.uoms (id, merchant_id)
);

alter table public.item_prices enable row level security;
create index if not exists item_prices_item_idx on public.item_prices (item_id, merchant_id);
create index if not exists item_prices_price_list_idx on public.item_prices (price_list_id, merchant_id);
create index if not exists item_prices_uom_idx on public.item_prices (uom_id, merchant_id);

-- A price names an enabled price list, and a unit the item is counted or sold in: its stock unit or one of its
-- UOMs rows. Checked when either is set or changed. Security definer, as private.validate_defaults: a User
-- Permission must not hide the record from the check.
create or replace function private.validate_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.price_list_id is distinct from old.price_list_id)
    and not coalesce((select p.enabled from public.price_lists p where p.id = new.price_list_id and p.merchant_id = new.merchant_id), false) then
    raise exception 'price_list_disabled' using errcode = '23514', detail = 'A price goes in an enabled price list.';
  end if;

  if (tg_op = 'INSERT' or new.uom_id is distinct from old.uom_id or new.item_id is distinct from old.item_id)
    and not exists (
      select 1 from public.items i where i.id = new.item_id and i.merchant_id = new.merchant_id and i.stock_uom = new.uom_id
      union all
      select 1 from public.item_uoms u where u.item_id = new.item_id and u.merchant_id = new.merchant_id and u.uom_id = new.uom_id
    ) then
    raise exception 'uom_not_on_item' using errcode = '23514', detail = 'The unit is neither the item''s stock unit nor in its UOMs table.';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_item_price() from public, anon, authenticated, service_role;

drop trigger if exists item_prices_validate on public.item_prices;
create trigger item_prices_validate
  before insert or update of item_id, price_list_id, uom_id on public.item_prices
  for each row execute function private.validate_item_price();


-- 2. public.save_item() with the Standard Selling Rate (docs.frappe.io/erpnext/item 2.2): "When creating an
-- Item, entering a value for this field will automatically create an Item Price … Entering a value after the
-- Item has been saved will not work." The price is for the stock unit, with no dates. Still security invoker:
-- the caller needs Item Price create for it, as ERPNext's insert does.

create or replace function public.save_item(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_rate numeric := nullif(payload ->> 'standard_rate', '')::numeric;
  v_list uuid;
begin
  if v_id is null then
    insert into public.items (
      merchant_id, item_code, item_name, item_group_id, stock_uom, description, brand_id, disabled, is_stock_item,
      valuation_method, allow_negative_stock, reorder_level, sales_uom,
      default_warehouse, default_price_list, selling_cost_center, income_account, expense_account
    )
    values (
      v_merchant,
      payload ->> 'item_code',
      payload ->> 'item_name',
      (payload ->> 'item_group_id')::uuid,
      (payload ->> 'stock_uom')::uuid,
      nullif(btrim(payload ->> 'description'), ''),
      nullif(payload ->> 'brand_id', '')::uuid,
      coalesce((payload ->> 'disabled')::boolean, false),
      coalesce((payload ->> 'is_stock_item')::boolean, true),
      nullif(payload ->> 'valuation_method', ''),
      coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      nullif(payload ->> 'reorder_level', '')::numeric,
      nullif(payload ->> 'sales_uom', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'selling_cost_center', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid
    )
    returning id into v_id;

    if coalesce(v_rate, 0) > 0 then
      select s.default_price_list into v_list from public.selling_settings s where s.merchant_id = v_merchant;
      if v_list is null then
        raise exception 'no_default_price_list' using errcode = '23514',
          detail = 'Selling Settings names no default price list for the Standard Selling Rate.';
      end if;

      insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
      values (v_merchant, v_id, v_list, (payload ->> 'stock_uom')::uuid, v_rate);
    end if;
  else
    update public.items set
      item_name = payload ->> 'item_name',
      item_group_id = (payload ->> 'item_group_id')::uuid,
      stock_uom = (payload ->> 'stock_uom')::uuid,
      description = nullif(btrim(payload ->> 'description'), ''),
      brand_id = nullif(payload ->> 'brand_id', '')::uuid,
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      is_stock_item = coalesce((payload ->> 'is_stock_item')::boolean, true),
      valuation_method = nullif(payload ->> 'valuation_method', ''),
      allow_negative_stock = coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      reorder_level = nullif(payload ->> 'reorder_level', '')::numeric,
      sales_uom = nullif(payload ->> 'sales_uom', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_uoms where item_id = v_id;

  insert into public.item_uoms (merchant_id, item_id, idx, uom_id, conversion_factor)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'uom_id')::uuid, (r.value ->> 'conversion_factor')::numeric
  from jsonb_array_elements(coalesce(payload -> 'uoms', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.item_taxes where item_id = v_id;

  insert into public.item_taxes (merchant_id, item_id, idx, item_tax_template_id, tax_category_id, valid_from)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item(jsonb) to authenticated;


-- 3. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). ERPNext gives
-- Item Price to the Sales Master Manager; here the Item Manager keeps it too, since an item's Standard Selling
-- Rate is written with the item.

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Item Price', 'item_prices', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Sales Master Manager', 'Item Price', true, true, true, true, true),
  ('Item Manager', 'Item Price', true, true, true, true, true),
  ('Sales Manager', 'Item Price', true, true, false, false, false),
  ('Sales User', 'Item Price', true, true, false, false, false),
  ('Stock Manager', 'Item Price', true, true, false, false, false),
  ('Stock User', 'Item Price', true, true, false, false, false),
  ('Accounts Manager', 'Item Price', true, true, false, false, false),
  ('Accounts User', 'Item Price', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('item_prices', 'Item Price');
