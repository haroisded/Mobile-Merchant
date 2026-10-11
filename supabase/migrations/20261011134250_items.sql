-- Step 13 of the POS system, on ERPNext's model: the Item master
-- (.claude/erpnext-docs/POS-System-Added-Features.md 13.1–13.5; docs.frappe.io/erpnext/item,
-- /Selling-in-different-UOM, /item-tax-template).
--
-- 1. items: a product or service sold — code, name, item group, stock unit, description, brand, Disabled,
--    Maintain Stock; the inventory options (13.2: Valuation Method, Allow Negative Stock, Re-order Level); the
--    defaults a sale falls back on (13.3); the Default Sales Unit of Measure (13.4).
-- 2. item_uoms: the Item's UOMs table — a unit and how many stock units make one of it.
-- 3. item_taxes: the Item's Item Tax rows — an Item Tax Template, for a tax category, from a date. They take
--    priority over the item group's rows (13.5).
-- 4. public.save_item(): an item and its rows in one transaction.
-- 5. The doctype, its permissions and policies. No seed: ERPNext makes no item.
--
-- Out of scope, so absent: barcodes, variants, batches and serial numbers, fixed-asset and manufacturing
-- fields, the purchase, supplier and customer sections, the website and hub sections, automatic re-ordering
-- (Re-order Level stays only as the low-stock threshold). Max Discount and the Discount Account arrive with
-- Step 20; Opening Stock with Step 16; Standard Selling Rate with Step 14. Re-runnable, like the rest of
-- supabase/migrations.

create schema if not exists private;


-- 1. Items. ERPNext keeps an item's defaults in a per-company child table; a system is one company, so they
-- are columns, named as brands' and item groups' are so private.validate_defaults() checks them.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- Typed, or taken from the Item naming series when Stock Settings names items by it (the trigger below).
  item_code text not null,
  item_name text not null,
  item_group_id uuid not null,
  -- The Default Unit of Measure: the unit stock is counted in.
  stock_uom uuid not null,
  description text,
  brand_id uuid,
  disabled boolean not null default false,
  -- Maintain Stock. Off: a service, with no stock ledger.
  is_stock_item boolean not null default true,
  -- Null: Stock Settings' Default Valuation Method.
  valuation_method text,
  -- On: this item may go below zero even when Stock Settings forbids it.
  allow_negative_stock boolean not null default false,
  -- The low-stock threshold. No Material Request is raised from it.
  reorder_level numeric,
  -- Default Sales Unit of Measure. Null: the stock unit.
  sales_uom uuid,
  default_warehouse uuid,
  default_price_list uuid,
  selling_cost_center uuid,
  income_account uuid,
  expense_account uuid,
  created_at timestamptz not null default now(),

  constraint items_id_merchant unique (id, merchant_id),
  constraint items_code_unique unique (merchant_id, item_code),
  constraint items_code_length check (length(item_code) between 1 and 140),
  constraint items_name_length check (length(btrim(item_name)) between 1 and 140),
  constraint items_valuation_method check (valuation_method in ('FIFO', 'Moving Average')),
  constraint items_reorder_level check (reorder_level >= 0),
  -- Deleting a record an item still names fails with 23503 ("in use").
  constraint items_item_group_fk foreign key (item_group_id, merchant_id) references public.item_groups (id, merchant_id),
  constraint items_stock_uom_fk foreign key (stock_uom, merchant_id) references public.uoms (id, merchant_id),
  constraint items_brand_fk foreign key (brand_id, merchant_id) references public.brands (id, merchant_id),
  constraint items_sales_uom_fk foreign key (sales_uom, merchant_id) references public.uoms (id, merchant_id),
  constraint items_warehouse_fk foreign key (default_warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint items_price_list_fk foreign key (default_price_list, merchant_id) references public.price_lists (id, merchant_id),
  constraint items_cost_center_fk foreign key (selling_cost_center, merchant_id) references public.cost_centers (id, merchant_id),
  constraint items_income_account_fk foreign key (income_account, merchant_id) references public.accounts (id, merchant_id),
  constraint items_expense_account_fk foreign key (expense_account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.items enable row level security;
create index if not exists items_item_group_idx on public.items (item_group_id, merchant_id);
create index if not exists items_stock_uom_idx on public.items (stock_uom, merchant_id);
create index if not exists items_brand_idx on public.items (brand_id, merchant_id);
create index if not exists items_sales_uom_idx on public.items (sales_uom, merchant_id);
create index if not exists items_warehouse_idx on public.items (default_warehouse, merchant_id);
create index if not exists items_price_list_idx on public.items (default_price_list, merchant_id);
create index if not exists items_cost_center_idx on public.items (selling_cost_center, merchant_id);
create index if not exists items_income_account_idx on public.items (income_account, merchant_id);
create index if not exists items_expense_account_idx on public.items (expense_account, merchant_id);

-- An item's code and its group. Security definer: private.make_name() is out of every role's reach, and a
-- User Permission must not hide the item group from the check.
--
-- Stock Settings' Item Naming By decides the code: Naming Series takes the next name of the Item series'
-- first option, whatever was typed; Item Code keeps what was typed. A code never changes afterwards — ERPNext
-- renames through a tool of its own, which is out of scope. A blank name is the code, as ERPNext fills it.
create or replace function private.prepare_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series text;
begin
  if tg_op = 'INSERT' then
    if (select s.item_naming_by from public.stock_settings s where s.merchant_id = new.merchant_id) = 'Naming Series' then
      select n.options[1] into v_series from public.naming_series n where n.merchant_id = new.merchant_id and n.document_type = 'Item';
      if v_series is null then
        raise exception 'no_item_series' using errcode = '23514', detail = 'Document Naming Settings has no series for Item.';
      end if;
      new.item_code := private.make_name(new.merchant_id, v_series);
    end if;

    new.item_code := btrim(coalesce(new.item_code, ''));
    if new.item_code = '' then
      raise exception 'item_code_required' using errcode = '23514', detail = 'Stock Settings names items by Item Code, and none was given.';
    end if;
  elsif new.item_code is distinct from old.item_code then
    raise exception 'item_code_locked' using errcode = '23514', detail = 'An item keeps its code.';
  end if;

  new.item_name := coalesce(nullif(btrim(coalesce(new.item_name, '')), ''), new.item_code);

  -- "Items are classified into it": a leaf, not a group.
  if (tg_op = 'INSERT' or new.item_group_id is distinct from old.item_group_id)
    and coalesce((select g.is_group from public.item_groups g where g.id = new.item_group_id and g.merchant_id = new.merchant_id), true) then
    raise exception 'item_group_is_group' using errcode = '23514', detail = 'An item goes in an item group that is not a group.';
  end if;

  return new;
end;
$$;

revoke execute on function private.prepare_item() from public, anon, authenticated, service_role;

drop trigger if exists items_prepare on public.items;
create trigger items_prepare
  before insert or update on public.items
  for each row execute function private.prepare_item();

-- The stock unit an enabled one, each default a record its field takes (20261010011003).
drop trigger if exists items_validate_defaults on public.items;
create trigger items_validate_defaults
  before insert or update of stock_uom, default_warehouse, default_price_list, selling_cost_center, income_account, expense_account on public.items
  for each row execute function private.validate_defaults();


-- 2. The Item's UOMs table (docs 3.5): one of `uom_id` is `conversion_factor` stock units — a Carton of 10
-- Units has factor 10. The stock unit itself has no row; its factor is 1. A unit with no row here falls back
-- to the system's UOM Conversion Factors when a sale uses it.

create table if not exists public.item_uoms (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id uuid not null,
  idx integer not null,
  uom_id uuid not null,
  conversion_factor numeric not null,

  constraint item_uoms_factor check (conversion_factor > 0),
  constraint item_uoms_unique unique (item_id, uom_id),
  constraint item_uoms_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id) on delete cascade,
  -- Deleting a unit an item sells in fails with 23503 ("in use").
  constraint item_uoms_uom_fk foreign key (uom_id, merchant_id) references public.uoms (id, merchant_id)
);

alter table public.item_uoms enable row level security;
create index if not exists item_uoms_item_idx on public.item_uoms (item_id, merchant_id);
create index if not exists item_uoms_uom_idx on public.item_uoms (uom_id, merchant_id);


-- 3. The Item's Item Tax rows (docs 3.16): the Item Tax Template it takes, for one tax category when it names
-- one, from a date when it gives one.

create table if not exists public.item_taxes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id uuid not null,
  idx integer not null,
  item_tax_template_id uuid not null,
  tax_category_id uuid,
  valid_from date,

  constraint item_taxes_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id) on delete cascade,
  -- Deleting a template or category a row names fails with 23503 ("in use").
  constraint item_taxes_template_fk foreign key (item_tax_template_id, merchant_id) references public.item_tax_templates (id, merchant_id),
  constraint item_taxes_category_fk foreign key (tax_category_id, merchant_id) references public.tax_categories (id, merchant_id)
);

alter table public.item_taxes enable row level security;
create index if not exists item_taxes_item_idx on public.item_taxes (item_id, merchant_id);
create index if not exists item_taxes_template_idx on public.item_taxes (item_tax_template_id, merchant_id);
create index if not exists item_taxes_category_idx on public.item_taxes (tax_category_id, merchant_id);


-- 4. Saving an item with its rows. Security invoker, like public.save_item_group: the caller's own policies
-- decide every row. The rows are replaced as a set; idx is their order in the payload. The code is set on
-- creation only (private.prepare_item).

create or replace function public.save_item(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
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


-- 5. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). ERPNext's
-- matrix for Item: the Item Manager keeps it, everyone who sells, stocks or books it reads it.

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Item', 'items', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Item Manager', 'Item', true, true, true, true, true),
  ('Stock Manager', 'Item', true, true, false, false, false),
  ('Stock User', 'Item', true, true, false, false, false),
  ('Sales Manager', 'Item', true, true, false, false, false),
  ('Sales Master Manager', 'Item', true, true, false, false, false),
  ('Sales User', 'Item', true, true, false, false, false),
  ('Accounts Manager', 'Item', true, true, false, false, false),
  ('Accounts User', 'Item', true, true, false, false, false),
  ('All', 'Item', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('items', 'Item');
select private.apply_doctype_policies('item_uoms', 'Item', true);
select private.apply_doctype_policies('item_taxes', 'Item', true);
