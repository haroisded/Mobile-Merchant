-- Step 9.1–9.2 of the POS foundation, on ERPNext's model: Item Groups and Selling Settings
-- (.claude/erpnext-docs/POS-System-Only-Features.md 9.1, 9.2; docs.frappe.io/erpnext/item-group,
-- /selling-settings).
--
-- 1. private.validate_defaults(): one check for every record that names defaults — a brand's, an item group's,
--    Selling Settings' and Stock Settings'. It replaces private.validate_brand_defaults().
-- 2. item_groups: how items are classified, as a tree (All Item Groups → Products, Services …), with the
--    defaults its items will take: price list, warehouse, selling cost center, income and expense account.
--    Restrictable, so a User Permission can hold someone to one group.
-- 3. item_group_taxes: an item group's Item Tax rows — the Item Tax Template its items take, for a tax
--    category, from a date, within a net-rate range.
-- 4. public.save_item_group(): a group and its tax rows in one transaction.
-- 5. selling_settings: a single per system — the Pricing tab: Default Price List, the fallback to it, editing
--    the Price List Rate, and validating the selling price against valuation.
-- 6. Their doctypes, permissions and policies; the seed: All Item Groups → Products, Services, and Selling
--    Settings on Standard Selling.
--
-- Out of scope, so absent: an item group's Default Supplier and buying cost center (no Supplier), its website
-- settings; Selling Settings' Customer Defaults, Transaction, Advanced Features, Subcontracting and Document
-- Naming tabs (no Customer, Sales Order, Delivery Note or commission). Re-runnable, like the rest of
-- supabase/migrations.

create schema if not exists private;


-- 1. Defaults. Each default a record names must be one its field takes: a warehouse an enabled non-group one,
-- a price list an enabled one, a cost center an enabled ledger, the income account an enabled Income ledger,
-- the expense account an enabled Expense ledger, a unit an enabled one. Columns are read through to_jsonb, so
-- a table without one of them skips it. Only a changed default is checked, as
-- private.validate_company_accounts does: one disabled later does not block the record's other edits.
-- Security definer for the same reason as that function: a User Permission must not hide the record from the
-- check.

create or replace function private.validate_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_column in array array['default_warehouse', 'default_price_list', 'selling_cost_center', 'income_account', 'expense_account', 'stock_uom'] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case v_column
      when 'default_warehouse' then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when 'default_price_list' then
        (select p.enabled from public.price_lists p where p.id = v_id and p.merchant_id = new.merchant_id)
      when 'selling_cost_center' then
        (select not c.is_group and not c.disabled from public.cost_centers c where c.id = v_id and c.merchant_id = new.merchant_id)
      when 'income_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Income' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'expense_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'stock_uom' then
        (select u.enabled from public.uoms u where u.id = v_id and u.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'default_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_defaults() from public, anon, authenticated, service_role;

drop trigger if exists brands_validate_defaults on public.brands;
create trigger brands_validate_defaults
  before insert or update of default_warehouse, default_price_list, selling_cost_center, income_account on public.brands
  for each row execute function private.validate_defaults();

drop function if exists private.validate_brand_defaults();


-- 2. Item Groups. ERPNext keeps an item group's defaults in a per-company child table; a system is one
-- company, so they are columns.

create table if not exists public.item_groups (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_group_name text not null,
  -- Null for a root: All Item Groups.
  parent_id uuid,
  is_group boolean not null default false,
  default_price_list uuid,
  default_warehouse uuid,
  selling_cost_center uuid,
  income_account uuid,
  expense_account uuid,
  created_at timestamptz not null default now(),

  constraint item_groups_id_merchant unique (id, merchant_id),
  -- "Nodes in different parts of the tree cannot have the same name."
  constraint item_groups_name_unique unique (merchant_id, item_group_name),
  constraint item_groups_name_length check (length(btrim(item_group_name)) between 1 and 140),
  -- NO ACTION, as accounts_parent_fk: deleting a system removes the whole tree in one statement.
  constraint item_groups_parent_fk foreign key (parent_id, merchant_id) references public.item_groups (id, merchant_id),
  -- Deleting a record an item group still names fails with 23503 ("in use").
  constraint item_groups_price_list_fk foreign key (default_price_list, merchant_id) references public.price_lists (id, merchant_id),
  constraint item_groups_warehouse_fk foreign key (default_warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint item_groups_cost_center_fk foreign key (selling_cost_center, merchant_id) references public.cost_centers (id, merchant_id),
  constraint item_groups_income_account_fk foreign key (income_account, merchant_id) references public.accounts (id, merchant_id),
  constraint item_groups_expense_account_fk foreign key (expense_account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.item_groups enable row level security;
create index if not exists item_groups_parent_idx on public.item_groups (parent_id, merchant_id);
create index if not exists item_groups_price_list_idx on public.item_groups (default_price_list, merchant_id);
create index if not exists item_groups_warehouse_idx on public.item_groups (default_warehouse, merchant_id);
create index if not exists item_groups_cost_center_idx on public.item_groups (selling_cost_center, merchant_id);
create index if not exists item_groups_income_account_idx on public.item_groups (income_account, merchant_id);
create index if not exists item_groups_expense_account_idx on public.item_groups (expense_account, merchant_id);

drop trigger if exists item_groups_validate_tree on public.item_groups;
create trigger item_groups_validate_tree
  before insert or update or delete on public.item_groups
  for each row execute function private.validate_tree();

drop trigger if exists item_groups_validate_defaults on public.item_groups;
create trigger item_groups_validate_defaults
  before insert or update of default_price_list, default_warehouse, selling_cost_center, income_account, expense_account on public.item_groups
  for each row execute function private.validate_defaults();


-- 3. An item group's Item Tax rows (docs 2.3): the Item Tax Template its items take — for one tax category
-- when it names one, from a date when it gives one, and for a net rate inside the range when it sets one.

create table if not exists public.item_group_taxes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_group_id uuid not null,
  idx integer not null,
  item_tax_template_id uuid not null,
  tax_category_id uuid,
  valid_from date,
  minimum_net_rate numeric not null default 0,
  -- 0: no upper bound.
  maximum_net_rate numeric not null default 0,

  constraint item_group_taxes_rates check (minimum_net_rate >= 0 and maximum_net_rate >= 0),
  -- ERPNext's "Maximum Net Rate cannot be less than Minimum Net Rate".
  constraint item_group_taxes_range check (maximum_net_rate = 0 or minimum_net_rate <= maximum_net_rate),
  constraint item_group_taxes_group_fk foreign key (item_group_id, merchant_id) references public.item_groups (id, merchant_id) on delete cascade,
  -- Deleting a template or category a row names fails with 23503 ("in use").
  constraint item_group_taxes_template_fk foreign key (item_tax_template_id, merchant_id) references public.item_tax_templates (id, merchant_id),
  constraint item_group_taxes_category_fk foreign key (tax_category_id, merchant_id) references public.tax_categories (id, merchant_id)
);

alter table public.item_group_taxes enable row level security;
create index if not exists item_group_taxes_group_idx on public.item_group_taxes (item_group_id, merchant_id);
create index if not exists item_group_taxes_template_idx on public.item_group_taxes (item_tax_template_id, merchant_id);
create index if not exists item_group_taxes_category_idx on public.item_group_taxes (tax_category_id, merchant_id);


-- 4. Saving a group with its tax rows. Security invoker, like public.save_item_tax_template: the caller's own
-- policies decide every row. The rows are replaced as a set; idx is their order in the payload.

create or replace function public.save_item_group(payload jsonb)
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
    insert into public.item_groups (
      merchant_id, item_group_name, parent_id, is_group,
      default_price_list, default_warehouse, selling_cost_center, income_account, expense_account
    )
    values (
      v_merchant,
      btrim(payload ->> 'item_group_name'),
      nullif(payload ->> 'parent_id', '')::uuid,
      coalesce((payload ->> 'is_group')::boolean, false),
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'selling_cost_center', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid
    )
    returning id into v_id;
  else
    update public.item_groups set
      item_group_name = btrim(payload ->> 'item_group_name'),
      parent_id = nullif(payload ->> 'parent_id', '')::uuid,
      is_group = coalesce((payload ->> 'is_group')::boolean, false),
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_group_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_group_taxes where item_group_id = v_id;

  insert into public.item_group_taxes (
    merchant_id, item_group_id, idx, item_tax_template_id, tax_category_id, valid_from, minimum_net_rate, maximum_net_rate
  )
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date,
    coalesce(nullif(r.value ->> 'minimum_net_rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'maximum_net_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item_group(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_group(jsonb) to authenticated;


-- 5. Selling Settings, the Pricing tab.

create table if not exists public.selling_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- The price list a sale starts on.
  default_price_list uuid,
  -- An item with no price in the sale's price list takes its price from the default one.
  fallback_to_default_price_list boolean not null default false,
  -- The Price List Rate can be changed on a sale's line.
  editable_price_list_rate boolean not null default false,
  -- A sale below the item's purchase or valuation rate is refused.
  validate_selling_price boolean not null default false,

  -- Deleting the price list named here fails with 23503 ("in use").
  constraint selling_settings_price_list_fk foreign key (default_price_list, merchant_id) references public.price_lists (id, merchant_id)
);

alter table public.selling_settings enable row level security;
create index if not exists selling_settings_price_list_idx on public.selling_settings (default_price_list, merchant_id);

drop trigger if exists selling_settings_validate_defaults on public.selling_settings;
create trigger selling_settings_validate_defaults
  before insert or update of default_price_list on public.selling_settings
  for each row execute function private.validate_defaults();


-- 6. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Item Group', 'item_groups', 'tree', true),
  ('Selling Settings', 'selling_settings', 'single', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Item Manager', 'Item Group', true, true, true, true, true),
  ('Sales Master Manager', 'Item Group', true, true, true, true, true),
  ('Stock Manager', 'Item Group', true, true, false, false, false),
  ('Stock User', 'Item Group', true, true, false, false, false),
  ('Sales User', 'Item Group', true, true, false, false, false),
  ('All', 'Item Group', true, false, false, false, false),

  ('System Manager', 'Selling Settings', true, true, true, false, false),
  ('Sales Manager', 'Selling Settings', true, true, true, false, false),
  ('All', 'Selling Settings', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('item_groups', 'Item Group');
select private.apply_doctype_policies('item_group_taxes', 'Item Group', true);
select private.apply_doctype_policies('selling_settings', 'Selling Settings');


-- 7. Seeding: ERPNext's install makes All Item Groups with its standard groups under it; a POS keeps Products
-- and Services. Selling Settings starts on Standard Selling, made by merchants_seed_80_stock.

create or replace function private.seed_selling_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_root uuid;
begin
  insert into public.item_groups (merchant_id, item_group_name, is_group)
  values (p_merchant, 'All Item Groups', true)
  on conflict (merchant_id, item_group_name) do nothing;
  select g.id into v_root from public.item_groups g where g.merchant_id = p_merchant and g.item_group_name = 'All Item Groups';
  -- A renamed or re-parented All Item Groups that is no longer a group gets nothing under it.
  if exists (select 1 from public.item_groups g where g.id = v_root and g.is_group) then
    insert into public.item_groups (merchant_id, item_group_name, parent_id)
    values (p_merchant, 'Products', v_root), (p_merchant, 'Services', v_root)
    on conflict (merchant_id, item_group_name) do nothing;
  end if;

  insert into public.selling_settings (merchant_id, default_price_list)
  values (
    p_merchant,
    (select p.id from public.price_lists p where p.merchant_id = p_merchant and p.price_list_name = 'Standard Selling' and p.enabled)
  )
  on conflict (merchant_id) do nothing;
end;
$$;

revoke execute on function private.seed_selling_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_selling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_selling_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_selling() from public, anon, authenticated, service_role;

-- After merchants_seed_80_stock, by name: Standard Selling exists when this runs.
drop trigger if exists merchants_seed_90_selling on public.merchants;
create trigger merchants_seed_90_selling
  after insert on public.merchants
  for each row execute function private.seed_selling();

-- The systems that already exist.
select private.seed_selling_for(m.id) from public.merchants m;
