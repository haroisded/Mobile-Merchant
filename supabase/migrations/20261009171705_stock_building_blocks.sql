-- Step 8 of the POS foundation, on ERPNext's model: Stock Building Blocks
-- (.claude/erpnext-docs/POS-System-Only-Features.md 8.1–8.4; docs.frappe.io/erpnext/warehouse, /uom,
-- /managing-fractions-in-uom, /price-lists, /brand, /inventory-account).
--
-- 1. private.validate_tree() serves a third tree: its parent lookup reads the table it fires on.
-- 2. warehouses: where stock is kept, as a tree (All Warehouses → Stores …), each optionally linked to the
--    Stock ledger its value posts to. Restrictable, so a User Permission can hold someone to one warehouse.
-- 3. uoms and uom_conversion_factors: the units items are counted in, whether a unit takes fractions, and how
--    many of one make another.
-- 4. price_lists: the books item prices will be kept in. Selling only, in the system's currency.
-- 5. brands: a brand name, with the sales defaults items of that brand will take.
-- 6. Their doctypes, permissions and policies; the seed: All Warehouses → Stores, thirteen UOMs and three
--    conversions, Standard Selling.
--
-- A warehouse with no account of its own uses its parent's, up the tree, then the Company's Default Inventory
-- Account (docs "Linking stock warehouse and accounts"). ponytail: resolved on the Warehouses screen only —
-- nothing posts stock yet; a server-side resolver lands with stock posting.
--
-- Out of scope, so absent: Warehouse Type, addresses and contacts; buying price lists and a price list's
-- countries; a brand's purchase defaults (no Supplier). Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. The tree rules, now for any tree table. The only change to 20261008224129_tree_and_profile_fixes.sql's
-- version is the parent lookup outside the accounts branch, which named cost_centers.

create or replace function private.validate_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_group boolean;
  v_parent_root text;
  v_cycle boolean;
  v_children boolean;
begin
  if tg_op = 'DELETE' then
    -- The cost-center root is the company's; it goes only with the system. Deleting the system cascades
    -- here after its row is gone, so a root whose system still exists is a direct delete. (Not
    -- `current_user`: inside a security definer function it is always the owner.)
    if tg_table_name = 'cost_centers' and old.parent_id is null
      and exists (select 1 from public.merchants m where m.id = old.merchant_id) then
      raise exception 'root_locked' using errcode = '42501', detail = 'The company''s cost center cannot be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    execute format('select exists (select 1 from public.%I where parent_id = $1 and merchant_id = $2)', tg_table_name)
      into v_children using new.id, new.merchant_id;
  else
    v_children := false;
  end if;

  if new.parent_id is null then
    if not new.is_group then
      raise exception 'root_must_be_group' using errcode = '23514', detail = 'A root of the tree must be a group.';
    end if;
  else
    if tg_table_name = 'accounts' then
      execute 'select is_group, root_type from public.accounts where id = $1 and merchant_id = $2'
        into v_parent_group, v_parent_root using new.parent_id, new.merchant_id;
    else
      execute format('select is_group from public.%I where id = $1 and merchant_id = $2', tg_table_name)
        into v_parent_group using new.parent_id, new.merchant_id;
    end if;

    if not coalesce(v_parent_group, false) then
      raise exception 'parent_not_group' using errcode = '23514', detail = 'A parent must be a group.';
    end if;

    if tg_op = 'UPDATE' then
      execute format(
        'with recursive up (id, parent_id) as (
           select id, parent_id from public.%I where id = $1 and merchant_id = $3
           union
           select t.id, t.parent_id from public.%I t join up on t.id = up.parent_id and t.merchant_id = $3
         )
         select exists (select 1 from up where id = $2)',
        tg_table_name, tg_table_name
      ) into v_cycle using new.parent_id, new.id, new.merchant_id;
      if v_cycle then
        raise exception 'tree_cycle' using errcode = '23514', detail = 'A record cannot sit under itself.';
      end if;
    end if;

    if tg_table_name = 'accounts' then
      new.root_type := v_parent_root;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_children then
    if old.is_group and not new.is_group then
      raise exception 'group_has_children' using errcode = '23514', detail = 'A group with records under it cannot become a ledger.';
    end if;
    -- Nested, not `and`-ed: plpgsql may evaluate both sides, and a cost_centers row has no root_type
    -- (42703 "record new has no field root_type" on every edit of a group with children).
    if tg_table_name = 'accounts' then
      if new.root_type is distinct from old.root_type then
        raise exception 'root_type_locked' using errcode = '23514', detail = 'An account with accounts under it cannot move to another root type.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_tree() from public, anon, authenticated, service_role;


-- 2. Warehouses.

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  warehouse_name text not null,
  -- Null for a root: All Warehouses.
  parent_id uuid,
  is_group boolean not null default false,
  -- The Stock ledger this warehouse's stock value posts to. Null: its parent's, then the company's.
  account uuid,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint warehouses_id_merchant unique (id, merchant_id),
  constraint warehouses_name_unique unique (merchant_id, warehouse_name),
  constraint warehouses_name_length check (length(btrim(warehouse_name)) between 1 and 140),
  -- NO ACTION, as accounts_parent_fk: deleting a system removes the whole tree in one statement.
  constraint warehouses_parent_fk foreign key (parent_id, merchant_id) references public.warehouses (id, merchant_id),
  -- Deleting a ledger a warehouse still names fails with 23503 ("in use").
  constraint warehouses_account_fk foreign key (account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.warehouses enable row level security;
create index if not exists warehouses_parent_idx on public.warehouses (parent_id, merchant_id);
create index if not exists warehouses_account_idx on public.warehouses (account, merchant_id);

drop trigger if exists warehouses_validate_tree on public.warehouses;
create trigger warehouses_validate_tree
  before insert or update or delete on public.warehouses
  for each row execute function private.validate_tree();

-- The account is an enabled Stock ledger — ERPNext's filter on the Warehouse's Account field. Checked only
-- when it changes, so a ledger disabled later does not block the warehouse's other edits. Security definer,
-- as validate_company_accounts is: a User Permission must not hide the account from the check.
create or replace function private.validate_warehouse_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.account is null or (tg_op = 'UPDATE' and new.account is not distinct from old.account) then
    return new;
  end if;

  select not a.is_group and not a.disabled and a.account_type = 'Stock'
  into v_ok
  from public.accounts a where a.id = new.account and a.merchant_id = new.merchant_id;

  if not coalesce(v_ok, false) then
    raise exception 'warehouse_account_invalid' using errcode = '23514',
      detail = 'A warehouse''s account is an enabled Stock ledger.';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_warehouse_account() from public, anon, authenticated, service_role;

drop trigger if exists warehouses_validate_account on public.warehouses;
create trigger warehouses_validate_account
  before insert or update of account on public.warehouses
  for each row execute function private.validate_warehouse_account();


-- 3. Units of measure, and how they convert.

create table if not exists public.uoms (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  uom_name text not null,
  -- On: a quantity in this unit cannot be a fraction ("Quantity cannot be a fraction at row #").
  must_be_whole_number boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),

  constraint uoms_id_merchant unique (id, merchant_id),
  constraint uoms_name_unique unique (merchant_id, uom_name),
  constraint uoms_name_length check (length(btrim(uom_name)) between 1 and 140)
);

alter table public.uoms enable row level security;

-- One from_uom is `value` to_uom: 1 Kg = 1000 Gram.
create table if not exists public.uom_conversion_factors (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  from_uom uuid not null,
  to_uom uuid not null,
  value numeric not null,
  created_at timestamptz not null default now(),

  constraint uom_conversion_factors_id_merchant unique (id, merchant_id),
  constraint uom_conversion_factors_pair_unique unique (merchant_id, from_uom, to_uom),
  constraint uom_conversion_factors_value check (value > 0),
  constraint uom_conversion_factors_two_units check (from_uom <> to_uom),
  -- Deleting a unit a conversion names fails with 23503 ("in use").
  constraint uom_conversion_factors_from_fk foreign key (from_uom, merchant_id) references public.uoms (id, merchant_id),
  constraint uom_conversion_factors_to_fk foreign key (to_uom, merchant_id) references public.uoms (id, merchant_id)
);

alter table public.uom_conversion_factors enable row level security;
create index if not exists uom_conversion_factors_from_idx on public.uom_conversion_factors (from_uom, merchant_id);
create index if not exists uom_conversion_factors_to_idx on public.uom_conversion_factors (to_uom, merchant_id);


-- 4. Price Lists. Selling only; the currency is one of the system's (today its base currency).

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  price_list_name text not null,
  currency text not null,
  enabled boolean not null default true,
  -- On: a price saved per unit also prices the item's bigger units by their conversion factor.
  price_not_uom_dependent boolean not null default false,
  created_at timestamptz not null default now(),

  constraint price_lists_id_merchant unique (id, merchant_id),
  constraint price_lists_name_unique unique (merchant_id, price_list_name),
  constraint price_lists_name_length check (length(btrim(price_list_name)) between 1 and 140),
  constraint price_lists_currency_fk foreign key (merchant_id, currency) references public.currencies (merchant_id, code)
);

alter table public.price_lists enable row level security;


-- 5. Brands, with the sales defaults an item of the brand will take. ERPNext keeps them in a per-company child
-- table; a system is one company, so they are columns.

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  brand text not null,
  description text,
  default_warehouse uuid,
  default_price_list uuid,
  selling_cost_center uuid,
  income_account uuid,
  created_at timestamptz not null default now(),

  constraint brands_id_merchant unique (id, merchant_id),
  constraint brands_name_unique unique (merchant_id, brand),
  constraint brands_name_length check (length(btrim(brand)) between 1 and 140),
  constraint brands_description_length check (description is null or length(description) <= 1000),
  -- Deleting a record a brand still names fails with 23503 ("in use").
  constraint brands_warehouse_fk foreign key (default_warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint brands_price_list_fk foreign key (default_price_list, merchant_id) references public.price_lists (id, merchant_id),
  constraint brands_cost_center_fk foreign key (selling_cost_center, merchant_id) references public.cost_centers (id, merchant_id),
  constraint brands_income_account_fk foreign key (income_account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.brands enable row level security;
create index if not exists brands_warehouse_idx on public.brands (default_warehouse, merchant_id);
create index if not exists brands_price_list_idx on public.brands (default_price_list, merchant_id);
create index if not exists brands_cost_center_idx on public.brands (selling_cost_center, merchant_id);
create index if not exists brands_income_account_idx on public.brands (income_account, merchant_id);

-- Each default is one its field takes: a warehouse an enabled non-group one, a price list an enabled one, a
-- cost center an enabled ledger, the income account an enabled ledger under Income. Only a changed default is
-- checked, as private.validate_company_accounts does; definer for the same reason.
create or replace function private.validate_brand_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.default_warehouse is not null and (tg_op = 'INSERT' or new.default_warehouse is distinct from old.default_warehouse) then
    select not w.is_group and not w.disabled into v_ok
    from public.warehouses w where w.id = new.default_warehouse and w.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'default_warehouse cannot name that record.';
    end if;
  end if;

  if new.default_price_list is not null and (tg_op = 'INSERT' or new.default_price_list is distinct from old.default_price_list) then
    select p.enabled into v_ok
    from public.price_lists p where p.id = new.default_price_list and p.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'default_price_list cannot name that record.';
    end if;
  end if;

  if new.selling_cost_center is not null and (tg_op = 'INSERT' or new.selling_cost_center is distinct from old.selling_cost_center) then
    select not c.is_group and not c.disabled into v_ok
    from public.cost_centers c where c.id = new.selling_cost_center and c.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'selling_cost_center cannot name that record.';
    end if;
  end if;

  if new.income_account is not null and (tg_op = 'INSERT' or new.income_account is distinct from old.income_account) then
    select not a.is_group and not a.disabled and a.root_type = 'Income' into v_ok
    from public.accounts a where a.id = new.income_account and a.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'income_account cannot name that record.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_brand_defaults() from public, anon, authenticated, service_role;

drop trigger if exists brands_validate_defaults on public.brands;
create trigger brands_validate_defaults
  before insert or update of default_warehouse, default_price_list, selling_cost_center, income_account on public.brands
  for each row execute function private.validate_brand_defaults();


-- 6. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Warehouse', 'warehouses', 'tree', true),
  ('UOM', 'uoms', 'record', false),
  ('UOM Conversion Factor', 'uom_conversion_factors', 'record', false),
  ('Price List', 'price_lists', 'record', false),
  ('Brand', 'brands', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Stock Manager', 'Warehouse', true, true, true, true, true),
  ('Item Manager', 'Warehouse', true, true, true, true, true),
  ('Stock User', 'Warehouse', true, true, false, false, false),
  ('Sales User', 'Warehouse', true, true, false, false, false),
  ('Accounts User', 'Warehouse', true, true, false, false, false),
  ('All', 'Warehouse', true, false, false, false, false),
  ('Stock Manager', 'UOM', true, true, true, true, true),
  ('Item Manager', 'UOM', true, true, true, true, true),
  ('All', 'UOM', true, true, false, false, false),
  ('Stock Manager', 'UOM Conversion Factor', true, true, true, true, true),
  ('Item Manager', 'UOM Conversion Factor', true, true, true, true, true),
  ('All', 'UOM Conversion Factor', true, true, false, false, false),
  ('Sales Master Manager', 'Price List', true, true, true, true, true),
  ('Sales Manager', 'Price List', true, true, false, false, false),
  ('Sales User', 'Price List', true, true, false, false, false),
  ('Stock Manager', 'Price List', true, true, false, false, false),
  ('Item Manager', 'Price List', true, true, false, false, false),
  ('Accounts User', 'Price List', true, true, false, false, false),
  ('All', 'Price List', true, false, false, false, false),
  ('Item Manager', 'Brand', true, true, true, true, true),
  ('Sales Master Manager', 'Brand', true, true, true, true, true),
  ('Stock Manager', 'Brand', true, true, false, false, false),
  ('Stock User', 'Brand', true, true, false, false, false),
  ('Sales User', 'Brand', true, true, false, false, false),
  ('All', 'Brand', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('warehouses', 'Warehouse');
select private.apply_doctype_policies('uoms', 'UOM');
select private.apply_doctype_policies('uom_conversion_factors', 'UOM Conversion Factor');
select private.apply_doctype_policies('price_lists', 'Price List');
select private.apply_doctype_policies('brands', 'Brand');


-- 7. Seeding: what ERPNext's company setup and install make, cut to a POS — All Warehouses with Stores under
-- it, the common units and three conversions, and Standard Selling in the company's currency.

create or replace function private.seed_stock_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_root uuid;
begin
  insert into public.warehouses (merchant_id, warehouse_name, is_group)
  values (p_merchant, 'All Warehouses', true)
  on conflict (merchant_id, warehouse_name) do nothing;
  select w.id into v_root from public.warehouses w where w.merchant_id = p_merchant and w.warehouse_name = 'All Warehouses';
  -- A renamed or re-parented All Warehouses that is no longer a group gets no Stores under it.
  if exists (select 1 from public.warehouses w where w.id = v_root and w.is_group) then
    insert into public.warehouses (merchant_id, warehouse_name, parent_id)
    values (p_merchant, 'Stores', v_root)
    on conflict (merchant_id, warehouse_name) do nothing;
  end if;

  insert into public.uoms (merchant_id, uom_name, must_be_whole_number)
  values
    (p_merchant, 'Nos', true), (p_merchant, 'Unit', true), (p_merchant, 'Box', true), (p_merchant, 'Pack', true),
    (p_merchant, 'Pair', true), (p_merchant, 'Set', true),
    (p_merchant, 'Kg', false), (p_merchant, 'Gram', false), (p_merchant, 'Litre', false),
    (p_merchant, 'Millilitre', false), (p_merchant, 'Meter', false), (p_merchant, 'Centimeter', false),
    (p_merchant, 'Hour', false)
  on conflict (merchant_id, uom_name) do nothing;

  insert into public.uom_conversion_factors (merchant_id, from_uom, to_uom, value)
  select p_merchant, f.id, t.id, c.value
  from (values ('Kg', 'Gram', 1000), ('Litre', 'Millilitre', 1000), ('Meter', 'Centimeter', 100)) as c (from_name, to_name, value)
  join public.uoms f on f.merchant_id = p_merchant and f.uom_name = c.from_name
  join public.uoms t on t.merchant_id = p_merchant and t.uom_name = c.to_name
  on conflict (merchant_id, from_uom, to_uom) do nothing;

  -- In the company's currency, once merchants_seed_30_defaults has given it a currencies row.
  insert into public.price_lists (merchant_id, price_list_name, currency)
  select m.id, 'Standard Selling', m.default_currency
  from public.merchants m
  where m.id = p_merchant
    and exists (select 1 from public.currencies c where c.merchant_id = m.id and c.code = m.default_currency)
  on conflict (merchant_id, price_list_name) do nothing;
end;
$$;

revoke execute on function private.seed_stock_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_stock_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_stock() from public, anon, authenticated, service_role;

-- After merchants_seed_30_defaults, by name: the company's currencies row exists when this runs.
drop trigger if exists merchants_seed_80_stock on public.merchants;
create trigger merchants_seed_80_stock
  after insert on public.merchants
  for each row execute function private.seed_stock();

-- The systems that already exist.
select private.seed_stock_for(m.id) from public.merchants m;
