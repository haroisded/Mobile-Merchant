-- Employees & permissions: Discord-style roles replace ERPNext's
-- (.claude/updates-and-revamps/roles-perms-references/revamp-roles-perms.txt).
--
-- A system's owner makes roles, turns permissions on for each, gives every employee one role, and may turn a
-- permission on or off for one employee — that employee's own setting wins over their role's. An employee
-- with no role sees Home only.
--
-- 1. The catalog, global and read-only: public.permissions (what an owner turns on) and
--    public.permission_rules (what each one lets a person do: a doctype and a permission type).
-- 2. Per system, owner-only: public.role_grants (a role's permissions) and public.member_overrides (one
--    employee's exceptions).
-- 3. roles lose ERPNext's standard roles; merchant_members gets role_id and loses role profiles and Enabled.
-- 4. The seam keeps its signature: private.permitted_merchant_ids(doctype, ptype) now expands the caller's
--    effective permissions through the rules, so every policy, poster and RPC that asks it keeps working.
--    public.my_permissions keeps its shape and adds `permissions`, the keys themselves.
-- 5. The sale's poster checks Process Sales, Process Refunds and Apply Discounts.
-- 6. The policies, re-applied without User Permissions; then the old model is dropped: role permissions, the
--    standard matrix, role profiles, member roles, User Permissions and doctype links.
-- 7. public.save_role and public.save_member_access, and an "Access changed" notification for whoever a
--    change reaches.
-- 8. Every system starts with Cashier, Stock Clerk and Store Manager.
--
-- DROPS, with their rows: role assignments (member_roles), role profiles, the Role Permissions Manager's
-- rules, User Permissions and the ERPNext roles. On the hosted project before this ran (2026-10-14): 0 members,
-- 0 role assignments, 0 role profiles, 0 User Permissions, 0 custom roles, every system's matrix the standard
-- one. Re-runnable, like the rest of supabase/migrations.
--
-- Known limits (ponytail): a `select` rule is a lookup the screens need (a price, a tax, a register), and RLS
-- cannot tell a lookup from a list — so Process Sales can read every sale through the API, though no screen
-- lists them without View Sales. Apply Discounts is checked against each line's Price List Rate, which the app
-- sends (the poster's "app calculates, database checks" ceiling); a second price engine in SQL is the upgrade.

create schema if not exists private;


-- 1. The catalog. Read by every signed-in person (the editors list it); written by migrations only.

create table if not exists public.permissions (
  key text primary key,
  category text not null,
  label text not null,
  description text not null,
  position integer not null,
  -- The permission this one needs: the editors turn both on together and save_* refuse one without it.
  requires text references public.permissions (key)
);

alter table public.permissions enable row level security;
create index if not exists permissions_requires_idx on public.permissions (requires);

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

-- `select` is a lookup — a field's options, a price, a register's setup — and passes RLS; `read` is what a
-- person may open, as a list or a page. The rest are ERPNext's.
create table if not exists public.permission_rules (
  permission text not null references public.permissions (key) on delete cascade,
  doctype text not null references public.doctypes (name) on delete cascade,
  ptype text not null,

  primary key (permission, doctype, ptype),
  constraint permission_rules_ptype check (ptype in ('select', 'read', 'write', 'create', 'delete', 'submit', 'cancel'))
);

alter table public.permission_rules enable row level security;
create index if not exists permission_rules_doctype_idx on public.permission_rules (doctype, ptype);

drop policy if exists permission_rules_select on public.permission_rules;
create policy permission_rules_select on public.permission_rules
  for select to authenticated
  using (true);

insert into public.permissions (key, category, label, description, position, requires)
values
  ('open_close_register', 'Payment & Cash', 'Open/Close Register', 'Open a register session and close it at the end of a shift.', 60, null),
  ('process_sales', 'Sales & POS', 'Process Sales', 'Ring up sales at the register.', 10, 'open_close_register'),
  ('apply_discounts', 'Sales & POS', 'Apply Discounts', 'Change a price or give a discount at the register.', 20, 'process_sales'),
  ('process_refunds', 'Sales & POS', 'Process Refunds', 'Take items back from a sale.', 30, 'open_close_register'),
  ('void_sales', 'Sales & POS', 'Void Transactions', 'Cancel a sale, and delete a cancelled one.', 40, null),
  ('view_sales', 'Sales & POS', 'View Sales', 'See orders and the sales on the Dashboard.', 50, null),
  ('view_shift_totals', 'Payment & Cash', 'View Shift Totals', 'See sessions, their closings and the cash a drawer should hold.', 70, null),
  ('close_any_register', 'Payment & Cash', 'Close Any Register', 'Close a session another cashier left open.', 80, null),
  ('view_stock', 'Inventory', 'View Stock Levels', 'See stock balance, the stock ledger and low stock.', 90, null),
  ('manage_items', 'Inventory', 'Manage Items', 'Add and change items and their prices.', 100, null),
  ('move_stock', 'Inventory', 'Receive Shipments', 'Record stock coming in, going out or moving between warehouses.', 110, null),
  ('adjust_inventory', 'Inventory', 'Adjust Inventory', 'Count stock and correct it.', 120, null),
  ('view_ledger', 'Accounting', 'View General Ledger', 'See every accounting entry.', 130, null),
  ('manage_company', 'Setup', 'Company & Calendar', 'The company, its fiscal years, currency and the system''s defaults.', 140, null),
  ('manage_accounting', 'Setup', 'Accounting & Payments', 'Chart of accounts, cost centers, modes of payment and Accounts Settings.', 150, null),
  ('manage_taxes', 'Setup', 'Taxes', 'Tax categories, tax templates and tax rules.', 160, null),
  ('manage_stock_setup', 'Setup', 'Stock Setup', 'Warehouses, units, brands, item groups and Stock Settings.', 170, null),
  ('manage_selling', 'Setup', 'Selling & Pricing', 'Price lists, pricing rules and Selling Settings.', 180, null),
  ('manage_pos_profiles', 'Setup', 'POS Profiles', 'Each register''s setup: its warehouse, payments and who may use it.', 190, null),
  ('manage_printing', 'Setup', 'Naming & Printing', 'Document numbering, print formats, letter heads and Print Settings.', 200, null)
on conflict (key) do nothing;

-- What each permission lets a person do. Creating carries write (the save RPCs rewrite a document's rows)
-- and select (an insert's RETURNING, the draft guard on its rows). The probe harness checked every line
-- against the screens that use it (2026-10-14).
insert into public.permission_rules (permission, doctype, ptype)
select r.permission, d.doctype, p.ptype
from (values
  ('process_sales', array['select', 'create', 'write', 'submit'], array['POS Invoice']),
  ('process_sales', array['select'], array[
    'POS Opening Entry', 'POS Profile', 'Item', 'Item Group', 'Item Price', 'Price List', 'Pricing Rule', 'Tax Rule',
    'Sales Taxes and Charges Template', 'Item Tax Template', 'Tax Category', 'Account', 'Bin', 'Mode of Payment', 'UOM',
    'UOM Conversion Factor', 'Brand', 'Warehouse', 'Print Format', 'Letter Head'
  ]),

  ('process_refunds', array['read', 'create', 'write', 'submit'], array['POS Invoice']),
  ('process_refunds', array['select'], array[
    'POS Opening Entry', 'POS Profile', 'Item', 'UOM', 'Mode of Payment', 'Print Format', 'Letter Head'
  ]),

  ('void_sales', array['read', 'cancel', 'delete'], array['POS Invoice']),
  ('void_sales', array['select'], array['POS Profile', 'Item', 'UOM', 'Mode of Payment', 'Print Format', 'Letter Head']),

  ('view_sales', array['read'], array['POS Invoice']),
  ('view_sales', array['select'], array['POS Profile', 'Item', 'Item Group', 'UOM', 'Mode of Payment', 'Print Format', 'Letter Head']),

  ('open_close_register', array['select', 'create', 'write', 'submit'], array['POS Opening Entry', 'POS Closing Entry']),
  ('open_close_register', array['select'], array['POS Profile', 'Mode of Payment']),

  ('view_shift_totals', array['read'], array['POS Opening Entry', 'POS Closing Entry']),
  ('view_shift_totals', array['select'], array['POS Invoice', 'POS Profile', 'Mode of Payment']),

  ('close_any_register', array['read', 'cancel'], array['POS Opening Entry']),
  ('close_any_register', array['select', 'create', 'write', 'submit'], array['POS Closing Entry']),
  ('close_any_register', array['select'], array['POS Invoice', 'POS Profile', 'Mode of Payment']),

  ('view_stock', array['read'], array['Bin', 'Stock Ledger Entry', 'Item']),
  ('view_stock', array['select'], array[
    'POS Invoice', 'Stock Entry', 'Stock Reconciliation', 'Item Group', 'UOM', 'Warehouse', 'Account', 'Brand', 'Price List',
    'Cost Center', 'Item Tax Template', 'Tax Category', 'POS Profile', 'Mode of Payment', 'Print Format', 'Letter Head'
  ]),

  ('manage_items', array['read', 'write', 'create', 'delete'], array['Item', 'Item Price']),
  ('manage_items', array['select'], array[
    'Item Group', 'UOM', 'UOM Conversion Factor', 'Brand', 'Price List', 'Warehouse', 'Cost Center', 'Account',
    'Item Tax Template', 'Tax Category'
  ]),

  ('move_stock', array['read', 'write', 'create', 'delete', 'submit'], array['Stock Entry']),
  ('move_stock', array['select'], array['Item', 'UOM', 'Warehouse', 'Account', 'Cost Center']),

  ('adjust_inventory', array['read', 'write', 'create', 'delete', 'submit', 'cancel'], array['Stock Reconciliation']),
  ('adjust_inventory', array['read', 'cancel'], array['Stock Entry']),
  ('adjust_inventory', array['select'], array['Item', 'UOM', 'Warehouse', 'Account', 'Cost Center']),

  ('view_ledger', array['read'], array['GL Entry']),
  ('view_ledger', array['select'], array[
    'Account', 'Cost Center', 'Item', 'Warehouse', 'POS Invoice', 'Stock Entry', 'Stock Reconciliation', 'POS Profile', 'UOM',
    'Mode of Payment', 'Print Format', 'Letter Head'
  ]),

  ('manage_company', array['read', 'write'], array['Company', 'Global Defaults', 'System Settings', 'Currency']),
  ('manage_company', array['read', 'write', 'create', 'delete'], array['Fiscal Year']),
  ('manage_company', array['select'], array['Account', 'Cost Center']),

  ('manage_accounting', array['read', 'write', 'create', 'delete'], array['Account', 'Cost Center', 'Mode of Payment']),
  ('manage_accounting', array['read', 'write'], array['Accounts Settings']),
  ('manage_accounting', array['select'], array['Role']),

  ('manage_taxes', array['read', 'write', 'create', 'delete'], array[
    'Tax Category', 'Sales Taxes and Charges Template', 'Item Tax Template', 'Tax Rule'
  ]),
  ('manage_taxes', array['select'], array['Account', 'Cost Center', 'Item Group']),

  ('manage_stock_setup', array['read', 'write', 'create', 'delete'], array['Warehouse', 'UOM', 'UOM Conversion Factor', 'Brand', 'Item Group']),
  ('manage_stock_setup', array['read', 'write'], array['Stock Settings']),
  ('manage_stock_setup', array['select'], array['Account', 'Price List', 'Cost Center', 'Item Tax Template', 'Tax Category']),

  ('manage_selling', array['read', 'write', 'create', 'delete'], array['Price List', 'Pricing Rule']),
  ('manage_selling', array['read', 'write'], array['Selling Settings']),
  ('manage_selling', array['select'], array['Item', 'Item Group', 'Brand']),

  ('manage_pos_profiles', array['read', 'write', 'create', 'delete'], array['POS Profile']),
  ('manage_pos_profiles', array['select'], array[
    'Warehouse', 'Price List', 'Cost Center', 'Account', 'Sales Taxes and Charges Template', 'Tax Category', 'Print Format',
    'Letter Head', 'Mode of Payment', 'Item Group', 'User'
  ]),

  ('manage_printing', array['read', 'write'], array['Document Naming Settings', 'Print Settings']),
  ('manage_printing', array['read', 'write', 'create', 'delete'], array['Print Format', 'Letter Head']),
  ('manage_printing', array['select'], array['Fiscal Year', 'Sales Taxes and Charges Template', 'Item Tax Template'])
) as r (permission, ptypes, doctypes)
cross join lateral unnest(r.doctypes) as d (doctype)
cross join lateral unnest(r.ptypes) as p (ptype)
on conflict do nothing;

-- Every permission's floor: the one-row settings nearly every screen reads (the time zone, the currency,
-- rounding), which blank a screen when refused.
insert into public.permission_rules (permission, doctype, ptype)
select p.key, d.doctype, 'select'
from public.permissions p
cross join unnest(array[
  'System Settings', 'Global Defaults', 'Currency', 'Accounts Settings', 'Selling Settings', 'Stock Settings', 'Print Settings'
]) as d (doctype)
on conflict do nothing;


-- 2. Per system, the owner's alone: no permission reaches these, so nobody but the owner can raise their own
-- access. Hand-written owner-only policies, as access_codes has (tenancy.md rule 13).

create table if not exists public.role_grants (
  merchant_id uuid not null,
  role_id uuid not null,
  permission text not null references public.permissions (key) on delete cascade,

  primary key (role_id, permission),
  constraint role_grants_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.role_grants enable row level security;
create index if not exists role_grants_merchant_id_idx on public.role_grants (merchant_id);
create index if not exists role_grants_role_merchant_idx on public.role_grants (role_id, merchant_id);
create index if not exists role_grants_permission_idx on public.role_grants (permission);

drop policy if exists role_grants_owner on public.role_grants;
create policy role_grants_owner on public.role_grants
  for all to authenticated
  using (merchant_id in (select private.owned_merchant_ids()))
  with check (merchant_id in (select private.owned_merchant_ids()));

-- One employee's exception to their role: allowed true turns a permission on, false turns it off.
create table if not exists public.member_overrides (
  merchant_id uuid not null,
  member_id uuid not null,
  permission text not null references public.permissions (key) on delete cascade,
  allowed boolean not null,

  primary key (member_id, permission),
  constraint member_overrides_member_fk foreign key (member_id, merchant_id)
    references public.merchant_members (id, merchant_id) on delete cascade
);

alter table public.member_overrides enable row level security;
create index if not exists member_overrides_merchant_id_idx on public.member_overrides (merchant_id);
create index if not exists member_overrides_member_merchant_idx on public.member_overrides (member_id, merchant_id);
create index if not exists member_overrides_permission_idx on public.member_overrides (permission);

drop policy if exists member_overrides_owner on public.member_overrides;
create policy member_overrides_owner on public.member_overrides
  for all to authenticated
  using (merchant_id in (select private.owned_merchant_ids()))
  with check (merchant_id in (select private.owned_merchant_ids()));


-- 3. Roles and members.

-- ERPNext's standard roles go, with their matrix, role profiles and assignments. Nothing guards a role's name
-- any more: every role is the owner's own.
drop trigger if exists roles_guard on public.roles;
drop function if exists private.guard_roles();

do $$
begin
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'roles' and c.column_name = 'is_standard'
  ) then
    delete from public.roles where is_standard;
  end if;
end;
$$;

alter table public.roles drop column if exists is_standard;
alter table public.roles drop column if exists disabled;
alter table public.roles add column if not exists description text;
-- A key of the role palette (src/themes.js, role*): the dot beside the role's name.
alter table public.roles add column if not exists color text not null default 'grey';

alter table public.roles drop constraint if exists roles_description_length;
alter table public.roles add constraint roles_description_length check (description is null or length(description) <= 200);
alter table public.roles drop constraint if exists roles_color;
alter table public.roles add constraint roles_color check (color in (
  'grey', 'slate', 'red', 'maroon', 'orange', 'amber', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'
));

-- One role per employee; none until the owner gives one. Revoking access deletes the row (Access Codes).
alter table public.merchant_members drop column if exists role_profile_id;
alter table public.merchant_members drop column if exists enabled;
alter table public.merchant_members add column if not exists role_id uuid;

alter table public.merchant_members drop constraint if exists merchant_members_role_fk;
alter table public.merchant_members add constraint merchant_members_role_fk foreign key (role_id, merchant_id)
  references public.roles (id, merchant_id) on delete set null (role_id);
create index if not exists merchant_members_role_id_idx on public.merchant_members (role_id, merchant_id);


-- 4. The engine. Security definer in `private`, search_path pinned, answering only for (select auth.uid())
-- (CLAUDE.md §6.2).

-- The caller's effective permissions in every system they belong to: their role's, less what an override turns
-- off, plus what one turns on — and each only with the permission it requires, so an owner's later change to a
-- role cannot leave Apply Discounts on without Process Sales.
create or replace function private.my_permission_keys()
returns table (merchant_id uuid, permission text)
language sql
security definer
stable
set search_path = ''
as $$
  with recursive granted as (
    select mm.merchant_id, g.permission
    from public.merchant_members mm
    join public.role_grants g on g.role_id = mm.role_id
    where mm.user_id = (select auth.uid())
      and not exists (
        select 1 from public.member_overrides o
        where o.member_id = mm.id and o.permission = g.permission and not o.allowed
      )
    union
    select mm.merchant_id, o.permission
    from public.merchant_members mm
    join public.member_overrides o on o.member_id = mm.id
    where mm.user_id = (select auth.uid()) and o.allowed
  ),
  effective as (
    select g.merchant_id, g.permission
    from granted g
    join public.permissions p on p.key = g.permission
    where p.requires is null
    union
    select g.merchant_id, g.permission
    from granted g
    join public.permissions p on p.key = g.permission
    join effective e on e.merchant_id = g.merchant_id and e.permission = p.requires
  )
  select e.merchant_id, e.permission from effective e;
$$;

revoke execute on function private.my_permission_keys() from public, anon, authenticated, service_role;

-- Whether the caller holds `p_key` in `p_merchant`. The owner holds every permission.
create or replace function private.has_permission(p_merchant uuid, p_key text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.merchants m where m.id = p_merchant and m.owner_id = (select auth.uid()))
    or exists (select 1 from private.my_permission_keys() k where k.merchant_id = p_merchant and k.permission = p_key);
$$;

revoke execute on function private.has_permission(uuid, text) from public, anon, authenticated, service_role;

-- The systems the caller may enter: owned, or one they are a member of.
create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select mm.merchant_id from public.merchant_members mm where mm.user_id = (select auth.uid());
$$;

-- The seam. The systems in which the caller may `ptype` rows of `doctype`: every system they own, and every
-- system where one of their effective permissions has that rule. `select` also passes on read.
create or replace function private.permitted_merchant_ids(p_doctype text, p_ptype text)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select k.merchant_id
  from private.my_permission_keys() k
  join public.permission_rules r on r.permission = k.permission and r.doctype = p_doctype
  where r.ptype = p_ptype or (p_ptype = 'select' and r.ptype = 'read');
$$;

-- What the signed-in person may do in one system, for the screens to hide what RLS would refuse: every doctype's
-- permission types as before, and `permissions`, the keys the editors and a few screens ask about. Null for a
-- system the caller cannot enter.
create or replace function public.my_permissions(p_merchant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_owner_email text;
  v_owner_name text;
  v_keys text[];
  v_perms jsonb;
begin
  select m.owner_id, u.email, p.display_name into v_owner, v_owner_email, v_owner_name
  from public.merchants m
  join auth.users u on u.id = m.owner_id
  left join public.profiles p on p.id = m.owner_id
  where m.id = p_merchant;

  if v_owner is null or v_uid is null then
    return null;
  end if;

  if v_owner = v_uid then
    select jsonb_object_agg(d.name, jsonb_build_object(
      'select', true, 'read', true, 'write', true, 'create', true, 'delete', true, 'submit', true, 'cancel', true
    ))
    into v_perms from public.doctypes d;
    select array_agg(p.key order by p.position) into v_keys from public.permissions p;
  elsif exists (select 1 from public.merchant_members mm where mm.merchant_id = p_merchant and mm.user_id = v_uid) then
    select coalesce(array_agg(k.permission order by p.position), '{}')
    into v_keys
    from private.my_permission_keys() k
    join public.permissions p on p.key = k.permission
    where k.merchant_id = p_merchant;

    select coalesce(jsonb_object_agg(x.doctype, jsonb_build_object(
      'select', x.can_select or x.can_read, 'read', x.can_read, 'write', x.can_write, 'create', x.can_create,
      'delete', x.can_delete, 'submit', x.can_submit, 'cancel', x.can_cancel
    )), '{}'::jsonb)
    into v_perms
    from (
      select r.doctype,
        bool_or(r.ptype = 'select') as can_select,
        bool_or(r.ptype = 'read') as can_read,
        bool_or(r.ptype = 'write') as can_write,
        bool_or(r.ptype = 'create') as can_create,
        bool_or(r.ptype = 'delete') as can_delete,
        bool_or(r.ptype = 'submit') as can_submit,
        bool_or(r.ptype = 'cancel') as can_cancel
      from public.permission_rules r
      where r.permission = any (v_keys)
      group by r.doctype
    ) x;
  else
    return null;
  end if;

  return jsonb_build_object(
    'is_owner', v_owner = v_uid,
    'owner_email', v_owner_email,
    'owner_name', v_owner_name,
    'perms', v_perms,
    'permissions', to_jsonb(v_keys)
  );
end;
$$;

-- "Once even one User is set in the POS Profile, other Users cannot use this POS Profile." The owner is the
-- Administrator and may use any.
create or replace function private.pos_profile_usable(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not p.disabled and (
      m.owner_id = (select auth.uid())
      or not exists (select 1 from public.pos_profile_users u where u.pos_profile_id = p.id)
      or exists (
        select 1 from public.pos_profile_users u
        join public.merchant_members mm on mm.id = u.member_id
        where u.pos_profile_id = p.id and mm.user_id = (select auth.uid())
      )
    )
    from public.pos_profiles p
    join public.merchants m on m.id = p.merchant_id
    where p.id = p_profile
  ), false);
$$;

-- "Posting is refused outside an enabled Fiscal Year and on or before Accounts Frozen Till." The owner and
-- whoever holds the role Accounts Settings names may still post into a frozen period. A future date is refused
-- too: with no repost engine it would block every posting until that day came.
create or replace function private.assert_postable(p_merchant uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_frozen date;
  v_role uuid;
begin
  if p_date is null or p_date > private.merchant_today(p_merchant) then
    raise exception 'posting_date_in_future' using errcode = '23514', detail = 'A posting date cannot be after today.';
  end if;

  if not exists (
    select 1 from public.fiscal_years f
    where f.merchant_id = p_merchant and not f.disabled and p_date between f.year_start_date and f.year_end_date
  ) then
    raise exception 'posting_outside_fiscal_year' using errcode = '23514',
      detail = format('No enabled fiscal year covers %s.', p_date);
  end if;

  select s.accounts_frozen_till_date, s.frozen_accounts_modifier into v_frozen, v_role
  from public.accounts_settings s where s.merchant_id = p_merchant;

  if v_frozen is not null and p_date <= v_frozen
    and not exists (select 1 from public.merchants m where m.id = p_merchant and m.owner_id = (select auth.uid()))
    and not exists (
      select 1 from public.merchant_members mm
      where mm.merchant_id = p_merchant and mm.user_id = (select auth.uid()) and mm.role_id = v_role
    ) then
    raise exception 'accounts_frozen' using errcode = '23514',
      detail = format('Accounts are frozen till %s.', v_frozen);
  end if;
end;
$$;


-- 5. The sale's poster (20261012085548_pos_invoice_discounts.sql), with three checks: a sale needs Process
-- Sales, a return Process Refunds, and a discount on the sale or a line priced by hand away from its Price
-- List Rate needs Apply Discounts. A Pricing Rule's price needs nothing: the owner set it. submit_document has
-- already checked Submit on POS Invoice, which both of the first two carry.
create or replace function private.submit_pos_invoices(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.pos_invoices;
  v_profile public.pos_profiles;
  v_company public.merchants;
  v_session public.pos_opening_entries;
  -- The sale a return is made against.
  v_original public.pos_invoices;
  v_rule public.pricing_rules;
  v_row record;
  v_today date;
  v_precision integer;
  -- One unit of the currency's smallest decimal: what two roundings of the same figure may differ by.
  v_unit numeric;
  v_price_list uuid;
  v_auto_price boolean;
  v_validate_price boolean;
  v_discounts boolean;
  v_discount_accounting boolean;
  v_warehouse uuid;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  v_center uuid;
  -- Where a line's own discount posts, and the sale's additional one. Null: it only reduces the sale.
  v_discount_account uuid;
  v_additional_account uuid;
  v_cost numeric;
  v_item_discount numeric;
  v_additional numeric;
  v_rows integer := 0;
  v_tax_rows integer := 0;
  v_net numeric := 0;
  v_distributed numeric := 0;
  v_tax numeric := 0;
  v_paid numeric := 0;
  v_change numeric := 0;
  v_write_off numeric := 0;
  v_gl jsonb := '[]'::jsonb;
begin
  select * into v_doc from public.pos_invoices d where d.id = p_id;
  select * into v_profile from public.pos_profiles p where p.id = v_doc.pos_profile_id;
  select * into v_company from public.merchants m where m.id = v_doc.merchant_id;
  select * into v_session from public.pos_opening_entries s where s.id = v_doc.pos_opening_entry_id;
  v_today := private.merchant_today(v_doc.merchant_id);
  select s.currency_precision into v_precision from public.system_settings s where s.merchant_id = v_doc.merchant_id;
  v_precision := coalesce(v_precision, 2);
  v_unit := 1 / power(10::numeric, v_precision);

  -- "No sale without an open session": the caller's own, on this profile. A refund comes out of that drawer.
  if v_doc.user_id is distinct from (select auth.uid())
    or v_session.docstatus is distinct from 1 or v_session.status is distinct from 'Open'
    or v_session.user_id is distinct from (select auth.uid())
    or v_session.pos_profile_id is distinct from v_doc.pos_profile_id then
    raise exception 'no_open_session' using errcode = '23514', detail = 'A sale needs the cashier''s own open session on that POS Profile.';
  end if;
  if not private.pos_profile_usable(v_doc.pos_profile_id) then
    raise exception 'pos_profile_unusable' using errcode = '23514', detail = 'The POS Profile is disabled, or not applicable for this user.';
  end if;
  -- Employees & permissions: a sale needs Process Sales, a return Process Refunds.
  if v_doc.is_return and not private.has_permission(v_doc.merchant_id, 'process_refunds') then
    raise exception 'refunds_not_permitted' using errcode = '42501';
  end if;
  if not v_doc.is_return and not private.has_permission(v_doc.merchant_id, 'process_sales') then
    raise exception 'sales_not_permitted' using errcode = '42501';
  end if;

  -- 19.1: "the original Delivery Note or Sales Invoice is submitted". Locked: two returns cannot both take
  -- the last unit, and a void of the sale waits for this one.
  if v_doc.is_return then
    select * into v_original from public.pos_invoices o where o.id = v_doc.return_against for update;
    if v_original.docstatus is distinct from 1 or v_original.is_return then
      raise exception 'return_original_invalid' using errcode = '23514',
        detail = 'A return is made against a submitted sale that is not itself a return.';
    end if;
  end if;

  -- "Stock back into the warehouse": the one it was sold from.
  v_warehouse := case when v_doc.is_return then v_original.warehouse else v_profile.warehouse end;

  select coalesce(v_profile.selling_price_list, s.default_price_list), s.validate_selling_price into v_price_list, v_validate_price
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;
  select a.enable_discount_accounting into v_discount_accounting
  from public.accounts_settings a where a.merchant_id = v_doc.merchant_id;

  if v_company.enable_perpetual_inventory then
    v_inventory := private.warehouse_account(v_warehouse);
  end if;

  -- 20.5, Discount Accounting: "additional discounts [post] to the POS Profile's, falling back to the
  -- Company's Default Discount Account". A return posts back where its sale posted.
  v_additional_account := case
    when v_doc.is_return then v_original.additional_discount_account
    when v_discount_accounting then coalesce(v_profile.discount_account, v_company.default_discount_account)
  end;

  -- 20.3, Allow User to Edit Discount.
  if not v_doc.is_return and v_doc.discount_amount > 0 and not v_profile.allow_discount_change then
    raise exception 'discount_locked' using errcode = '23514', detail = 'This POS Profile does not allow a discount on the sale.';
  end if;
  -- Apply Discounts: a discount on the sale, or a line priced by hand away from its Price List Rate (below).
  v_discounts := private.has_permission(v_doc.merchant_id, 'apply_discounts');
  if not v_doc.is_return and v_doc.discount_amount > 0 and not v_discounts then
    raise exception 'discounts_not_permitted' using errcode = '42501';
  end if;

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom, i.max_discount,
      i.item_group_id as item_group, i.brand_id as brand,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      coalesce(v_profile.cost_center, i.selling_cost_center, g.selling_cost_center, b.selling_cost_center, v_company.cost_center) as center,
      -- 20.5: "item discounts post to the Item's Discount Account … falling back to the Company's".
      coalesce(i.discount_account, v_company.default_discount_account) as item_discount_account,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor,
      -- The line of the sale a return's line takes back, and what earlier returns took of it (below zero).
      o.pos_invoice_id as o_invoice, o.item_id as o_item, o.item_name as o_name, o.uom_id as o_uom, o.conversion_factor as o_factor,
      o.qty as o_qty, o.price_list_rate as o_price_list_rate, o.rate as o_rate, o.amount as o_amount, o.net_amount as o_net_amount,
      o.income_account as o_income, o.expense_account as o_expense, o.cost_center as o_center, o.valuation_rate as o_valuation,
      o.discount_percentage as o_discount_percentage, o.discount_amount as o_discount_amount,
      o.distributed_discount_amount as o_distributed, o.pricing_rule_id as o_rule, o.discount_account as o_discount_account,
      coalesce((
        select sum(x.qty) from public.pos_invoice_items x
        join public.pos_invoices xi on xi.id = x.pos_invoice_id
        where x.return_against_item = o.id and xi.docstatus = 1
      ), 0) as o_returned
    from public.pos_invoice_items r
    join public.items i on i.id = r.item_id
    join public.item_groups g on g.id = i.item_group_id
    left join public.brands b on b.id = i.brand_id
    left join public.pos_invoice_items o on o.id = r.return_against_item
    where r.pos_invoice_id = p_id
    order by r.idx
  loop
    v_rows := v_rows + 1;

    if v_doc.is_return then
      -- "Rate: Original selling rate used to calculate the returned value." The line is the sale's own, in
      -- the unit it was sold in, under the discount it was sold at, with a quantity below zero.
      if v_row.o_invoice is distinct from v_doc.return_against or v_row.qty > 0
        or v_row.item_id <> v_row.o_item or v_row.uom_id <> v_row.o_uom or v_row.conversion_factor <> v_row.o_factor
        or v_row.rate <> v_row.o_rate or v_row.price_list_rate <> v_row.o_price_list_rate
        or abs(v_row.discount_percentage - v_row.o_discount_percentage) > 0.000001
        or v_row.discount_amount <> v_row.o_discount_amount or v_row.pricing_rule_id is distinct from v_row.o_rule
        or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
        raise exception 'return_line_invalid' using errcode = '23514',
          detail = 'A returned line names a line of the sale, with its item, unit, rate and discount, and a quantity below zero.';
      end if;
      -- "Returned quantity is rejected: confirm it does not exceed the quantity available to return."
      if -v_row.qty > v_row.o_qty + v_row.o_returned then
        raise exception 'return_qty_exceeds' using errcode = '23514',
          detail = format('%s sold, %s already returned.', v_row.o_qty, -v_row.o_returned);
      end if;
      if abs(v_row.amount - v_row.o_amount * v_row.qty / v_row.o_qty) > v_unit
        or abs(v_row.net_amount - v_row.o_net_amount * v_row.qty / v_row.o_qty) > v_unit
        or abs(v_row.distributed_discount_amount - v_row.o_distributed * v_row.qty / v_row.o_qty) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned line is not its share of the line sold.';
      end if;

      -- Where the sale posted, the return posts back.
      v_income := v_row.o_income;
      v_center := v_row.o_center;
      v_discount_account := v_row.o_discount_account;
    else
      if v_row.qty < 0 or v_row.return_against_item is not null then
        raise exception 'return_line_invalid' using errcode = '23514', detail = 'A sale''s lines are sold, not returned.';
      end if;
      if v_row.disabled then
        raise exception 'item_unusable' using errcode = '23514', detail = 'A disabled item cannot be sold.';
      end if;
      -- 13.4: sold in the stock unit, or in one of the item's units at its conversion factor.
      if v_row.conversion_factor is distinct from (case when v_row.uom_id = v_row.stock_uom then 1 else v_row.unit_factor end)
        or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
        raise exception 'uom_not_on_item' using errcode = '23514', detail = 'A line is sold in a unit its item does not have, or at another conversion factor.';
      end if;
      -- 20.1: "calculated against the Price List Rate". The discount is what the rate is under the list's,
      -- per unit, and the percentage says the same; a typed lower rate is a discount too.
      if abs(v_row.discount_amount - greatest(v_row.price_list_rate - v_row.rate, 0)) > v_unit
        or abs(v_row.discount_amount - v_row.price_list_rate * v_row.discount_percentage / 100) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s discount is not its Price List Rate less its rate.';
      end if;
      if abs(v_row.amount - v_row.qty * v_row.rate) > v_unit or v_row.net_amount < 0 or v_row.distributed_discount_amount < 0
        or v_row.net_amount + v_row.distributed_discount_amount > v_row.amount + v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s amount is not its quantity times its rate.';
      end if;

      if v_row.pricing_rule_id is not null then
        -- 20.4: the rule the line claims is enabled, valid today, for this price list, covers the item — by
        -- itself, its brand, or its item group or one above it — within its quantity and amount, and gives
        -- this rate. "POS Profile Ignore Pricing Rule switches it off for a register."
        select * into v_rule from public.pricing_rules p where p.id = v_row.pricing_rule_id;
        if v_profile.ignore_pricing_rule or v_rule.disable is distinct from false
          or v_rule.valid_from > v_today or v_rule.valid_upto < v_today
          or (v_rule.for_price_list is not null and v_rule.for_price_list is distinct from v_price_list)
          or v_row.stock_qty < v_rule.min_qty or (v_rule.max_qty > 0 and v_row.stock_qty > v_rule.max_qty)
          or v_row.qty * v_row.price_list_rate < v_rule.min_amt
          or (v_rule.max_amt > 0 and v_row.qty * v_row.price_list_rate > v_rule.max_amt)
          or not exists (
            select 1 from public.pricing_rule_targets t
            where t.pricing_rule_id = v_rule.id
              and (t.item_id = v_row.item_id or t.brand_id = v_row.brand or t.item_group_id in (
                with recursive up as (
                  select g.id, g.parent_id from public.item_groups g where g.id = v_row.item_group
                  union all
                  select g.id, g.parent_id from public.item_groups g join up on g.id = up.parent_id
                )
                select up.id from up
              ))
          )
          or abs(v_row.rate - case v_rule.rate_or_discount
            when 'Rate' then v_rule.rate * v_row.conversion_factor
            when 'Discount Percentage' then v_row.price_list_rate * (1 - v_rule.discount_percentage / 100)
            else greatest(v_row.price_list_rate - v_rule.discount_amount, 0)
          end) > v_unit then
          raise exception 'pricing_rule_mismatch' using errcode = '23514', detail = 'A line''s Pricing Rule does not apply to it, or gives another rate.';
        end if;
      elsif v_row.rate > v_row.price_list_rate and not v_profile.allow_rate_change then
        raise exception 'rate_locked' using errcode = '23514', detail = 'This POS Profile does not allow a line''s rate to be changed.';
      elsif v_row.discount_amount > 0 and not (v_profile.allow_discount_change or v_profile.allow_rate_change) then
        -- 20.3, Allow User to Edit Discount.
        raise exception 'discount_locked' using errcode = '23514', detail = 'This POS Profile does not allow a discount on a line.';
      elsif abs(v_row.rate - v_row.price_list_rate) > v_unit and not v_discounts then
        raise exception 'discounts_not_permitted' using errcode = '42501';
      end if;
      -- 20.3, Item Max Discount (%), whoever gave the discount.
      if v_row.max_discount > 0 and v_row.discount_percentage > v_row.max_discount then
        raise exception 'max_discount_exceeded' using errcode = '23514',
          detail = format('%s takes at most %s%%.', v_row.current_name, v_row.max_discount);
      end if;

      v_income := v_row.income;
      v_center := v_row.center;
      v_discount_account := case when v_discount_accounting then v_row.item_discount_account end;
    end if;

    v_net := v_net + v_row.net_amount;
    v_distributed := v_distributed + v_row.distributed_discount_amount;
    v_expense := null;
    v_cost := null;

    -- 20.5, Discount Accounting: "Sales shows the full price." Each discount is debited to its account net
    -- of tax and income credited by as much more, so the taxes stay what the customer was charged.
    -- Rejected: ERPNext's Grand Total variant, which credits tax at the amount before the discount.
    -- With no account for it, a discount only reduces the sale.
    v_item_discount := case when v_discount_account is null then 0 else round(
      v_row.qty * v_row.discount_amount
        * case when v_row.amount = 0 then 1 else (v_row.net_amount + v_row.distributed_discount_amount) / v_row.amount end,
      v_precision) end;
    v_additional := case when v_additional_account is null then 0 else v_row.distributed_discount_amount end;
    v_gl := v_gl
      || jsonb_build_object('account_id', v_income, 'amount', -(v_row.net_amount + v_item_discount + v_additional), 'cost_center_id', v_center)
      || jsonb_build_object('account_id', v_discount_account, 'amount', v_item_discount, 'cost_center_id', v_center)
      || jsonb_build_object('account_id', v_additional_account, 'amount', v_additional, 'cost_center_id', v_center);

    -- "Posts at once: stock out and Cost of Goods Sold." A service moves no stock. Negative stock, a
    -- fraction in a whole-number unit and a backdated posting are the engine's to refuse. A return brings
    -- back what the sale moved, at the valuation it left at.
    if (v_doc.is_return and v_row.o_valuation is not null) or (not v_doc.is_return and v_row.is_stock_item) then
      v_cost := -private.post_sle(
        v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_row.item_id, v_warehouse, -v_row.stock_qty,
        case when v_doc.is_return then v_row.o_valuation end
      );
      -- 20.3, Selling Settings' Validate Selling Price: the line sells for no less than it is valued at.
      if not v_doc.is_return and v_validate_price and v_row.net_amount < v_cost - v_unit then
        raise exception 'below_valuation' using errcode = '23514',
          detail = format('%s sells for %s and is valued at %s.', v_row.current_name, v_row.net_amount, v_cost);
      end if;
      if v_company.enable_perpetual_inventory then
        if v_inventory is null then
          raise exception 'no_inventory_account' using errcode = '23514',
            detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
        end if;
        v_expense := case when v_doc.is_return then coalesce(v_row.o_expense, v_row.expense) else v_row.expense end;
        v_gl := v_gl
          || jsonb_build_object('account_id', v_expense, 'amount', v_cost, 'cost_center_id', v_center)
          || jsonb_build_object('account_id', v_inventory, 'amount', -v_cost);
      end if;
    end if;

    update public.pos_invoice_items r set
      item_name = case when v_doc.is_return then v_row.o_name else v_row.current_name end,
      income_account = v_income, expense_account = v_expense, cost_center = v_center,
      discount_account = case when v_item_discount <> 0 then v_discount_account end,
      valuation_rate = v_cost / v_row.stock_qty
    where r.id = v_row.id;

    -- 14.1, Stock Settings' Auto Insert Price List Rate if Missing: the item's first sale in this unit
    -- writes its rate into the sale's price list.
    if not v_doc.is_return and v_auto_price and v_row.price_list_rate > 0
      and exists (select 1 from public.price_lists p where p.id = v_price_list and p.enabled)
      and not exists (
        select 1 from public.item_prices p
        where p.item_id = v_row.item_id and p.price_list_id = v_price_list and p.uom_id = v_row.uom_id
      ) then
      insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
      values (v_doc.merchant_id, v_row.item_id, v_price_list, v_row.uom_id, v_row.price_list_rate);
    end if;
  end loop;

  if v_rows = 0 then
    raise exception 'no_rows' using errcode = '23514', detail = 'A sale needs at least one item.';
  end if;

  for v_row in
    select
      t.*, o.account_head as o_account,
      -- The sale's row, line by line, for the share of each line this return takes back.
      (
        select sum((o.item_wise_tax_detail ->> (l.pos - 1))::numeric * r.qty / l.qty)
        from public.pos_invoice_items r
        join (
          select x.id, x.qty, (row_number() over (order by x.idx))::integer as pos
          from public.pos_invoice_items x where x.pos_invoice_id = v_doc.return_against
        ) l on l.id = r.return_against_item
        where r.pos_invoice_id = p_id
      ) as o_share
    from public.pos_invoice_taxes t
    left join public.pos_invoice_taxes o on o.pos_invoice_id = v_doc.return_against and o.idx = t.idx
    where t.pos_invoice_id = p_id
    order by t.idx
  loop
    v_tax_rows := v_tax_rows + 1;

    if v_doc.is_return then
      if v_row.o_account is distinct from v_row.account_head or abs(v_row.tax_amount - coalesce(v_row.o_share, 0)) > v_unit then
        raise exception 'totals_mismatch' using errcode = '23514', detail = 'A returned tax is not its share of the tax charged.';
      end if;
    elsif jsonb_array_length(v_row.item_wise_tax_detail) <> v_rows
      or abs(v_row.tax_amount - coalesce((select sum(d.value::numeric) from jsonb_array_elements_text(v_row.item_wise_tax_detail) as d (value)), 0)) > v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A tax row''s amounts per line do not add up to it.';
    end if;

    v_tax := v_tax + v_row.tax_amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount, 'cost_center_id', v_row.cost_center);
  end loop;

  if v_doc.is_return and v_tax_rows <> (select count(*) from public.pos_invoice_taxes o where o.pos_invoice_id = v_doc.return_against) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'A return carries every tax row of its sale.';
  end if;

  -- 20.2: the additional discount. Its lines' shares are all of it when it was taken from the Net Total,
  -- and the net part of it from the Grand Total (the rest is tax); a percentage is of that total before it.
  -- A return's is the share of the sale's that its lines took.
  if v_doc.is_return then
    if v_doc.apply_discount_on <> v_original.apply_discount_on
      or v_doc.additional_discount_percentage <> v_original.additional_discount_percentage
      or abs(v_doc.discount_amount - coalesce(v_original.discount_amount * v_distributed / nullif((
        select sum(o.distributed_discount_amount) from public.pos_invoice_items o where o.pos_invoice_id = v_doc.return_against
      ), 0), 0)) > v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A return''s discount is not its share of the sale''s.';
    end if;
  elsif v_distributed > v_doc.discount_amount + v_unit
    or (v_doc.apply_discount_on = 'Net Total' and abs(v_distributed - v_doc.discount_amount) > v_unit)
    or (v_doc.additional_discount_percentage > 0 and abs(v_doc.discount_amount - v_doc.additional_discount_percentage / 100
      * case when v_doc.apply_discount_on = 'Net Total' then v_net + v_distributed else v_doc.grand_total + v_doc.discount_amount end) > v_unit) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'The additional discount does not add up.';
  end if;

  -- The totals add up. An inclusive tax, or a discount off the Grand Total, can leave the grand total a few
  -- units off net + tax (the entered prices are kept); the Rounded Total is the grand total at the
  -- currency's smallest coin, or itself.
  if abs(v_doc.net_total - v_net) > v_unit or abs(v_doc.total_taxes_and_charges - v_tax) > v_unit
    or abs(v_doc.grand_total - v_net - v_tax) > 5 * v_unit
    or abs(v_doc.rounding_adjustment - (v_doc.rounded_total - v_doc.grand_total)) > v_unit
    or abs(v_doc.rounding_adjustment) > greatest(1, coalesce((
      select c.smallest_currency_fraction_value from public.currencies c
      where c.merchant_id = v_doc.merchant_id and c.code = v_company.default_currency
    ), 0)) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'The sale''s totals do not add up.';
  end if;

  -- "Only the modes set here will be available when using POS", and for a refund only those with
  -- "Allow in Returns".
  for v_row in
    select r.id, r.amount, m.default_account, pp.id as offered, pp.allow_in_returns
    from public.pos_invoice_payments r
    join public.modes_of_payment m on m.id = r.mode_of_payment_id
    left join public.pos_profile_payments pp on pp.pos_profile_id = v_doc.pos_profile_id and pp.mode_of_payment_id = r.mode_of_payment_id
    where r.pos_invoice_id = p_id
  loop
    if v_row.offered is null then
      raise exception 'payment_method_not_offered' using errcode = '23514', detail = 'The POS Profile does not offer that mode of payment.';
    end if;
    if v_doc.is_return and not v_row.allow_in_returns then
      raise exception 'refund_method_not_allowed' using errcode = '23514', detail = 'That mode of payment is not marked Allow in Returns on the POS Profile.';
    end if;
    if (v_row.amount < 0) is distinct from v_doc.is_return then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A sale is paid in; a return is paid out.';
    end if;
    v_paid := v_paid + v_row.amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.default_account, 'amount', v_row.amount);
    update public.pos_invoice_payments r set account = v_row.default_account where r.id = v_row.id;
  end loop;

  if v_doc.is_return then
    -- The refund is the whole of the return: nothing to hand back, nothing to write off.
    if abs(v_paid - v_doc.rounded_total) > v_unit then
      raise exception 'refund_mismatch' using errcode = '23514', detail = 'The refund is not the return''s total.';
    end if;
  else
    -- "Paid in full, change returned, a small difference written off within the limit."
    v_change := greatest(v_paid - v_doc.rounded_total, 0);
    v_write_off := greatest(v_doc.rounded_total - v_paid, 0);
    if v_write_off > v_profile.write_off_limit then
      raise exception 'underpaid' using errcode = '23514', detail = 'The payments do not cover the total, and the shortfall is over the Write Off Limit.';
    end if;
  end if;
  if abs(v_doc.paid_amount - v_paid) > v_unit or abs(v_doc.change_amount - v_change) > v_unit
    or abs(v_doc.write_off_amount - v_write_off) > v_unit then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'Paid, change and write-off do not match the payments.';
  end if;

  v_gl := v_gl
    -- Change goes back out of the till.
    || jsonb_build_object('account_id', coalesce(v_profile.account_for_change_amount, v_company.default_cash_account), 'amount', -v_change)
    || jsonb_build_object(
      'account_id', coalesce(v_profile.write_off_account, v_company.write_off_account), 'amount', v_write_off,
      'cost_center_id', coalesce(v_profile.write_off_cost_center, v_company.cost_center))
    -- What rounding added or took: the Rounded Total less net and taxes.
    || jsonb_build_object(
      'account_id', v_company.round_off_account, 'amount', -(v_doc.rounded_total - v_net - v_tax),
      'cost_center_id', coalesce(v_company.round_off_cost_center, v_company.cost_center));

  -- An account still missing here is refused by private.post_gl (account_unusable), as an unbalanced voucher is.
  perform private.post_gl(v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_gl);

  update public.pos_invoices set
    posting_date = v_today,
    warehouse = v_warehouse,
    selling_price_list = case when v_doc.is_return then v_original.selling_price_list else v_price_list end,
    tax_category = case when v_doc.is_return then v_original.tax_category else v_profile.tax_category end,
    additional_discount_account = case when v_doc.discount_amount <> 0 then v_additional_account end
  where id = p_id;
end;
$$;



-- 6. The policy helper (20261012131350_access_for_documents.sql) without User Permissions or doctype links.
-- record/tree: select ← select, insert ← create, update ← write, delete ← delete. single: select and update.
-- ledger: select only. child (p_child): select ← the parent's select, writes ← its write — so whoever may look
-- a document up may read its rows, as a cashier's receipt needs. document: the draft-only guards, as before.
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent text;
  v_cmd text;
  v_key text;
begin
  select d.kind, d.table_name into v_kind, v_parent from public.doctypes d where d.name = p_doctype;
  if v_kind is null then
    raise exception 'unknown doctype %', p_doctype;
  end if;

  foreach v_cmd in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table || '_' || v_cmd, p_table);
  end loop;

  execute format(
    'create policy %I on public.%I for select to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, ''select'')))',
    p_table || '_select', p_table, p_doctype
  );

  if v_kind = 'ledger' then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for update to authenticated
       using (merchant_id in (select private.permitted_merchant_ids(%L, ''write'')))
       with check (merchant_id in (select private.permitted_merchant_ids(%L, ''write'')))',
    p_table || '_update', p_table, p_doctype, p_doctype
  );

  if v_kind = 'single' and not p_child then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for insert to authenticated with check (merchant_id in (select private.permitted_merchant_ids(%L, %L)))',
    p_table || '_insert', p_table, p_doctype, case when p_child then 'write' else 'create' end
  );

  execute format(
    'create policy %I on public.%I for delete to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, %L)))',
    p_table || '_delete', p_table, p_doctype, case when p_child then 'write' else 'delete' end
  );

  if v_kind <> 'document' then
    return;
  end if;

  execute format('drop trigger if exists %I on public.%I', p_table || '_docstatus', p_table);

  if not p_child then
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus()',
      p_table || '_docstatus', p_table
    );
    return;
  end if;

  -- This table's key to its document: the column of its foreign key to the doctype's table.
  select a.attname into v_key
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f'
    and c.conrelid = format('public.%I', p_table)::regclass
    and c.confrelid = format('public.%I', v_parent)::regclass
    and a.attname <> 'merchant_id';

  if v_key is null then
    raise exception '% has no foreign key to %', p_table, v_parent;
  end if;

  execute format(
    'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus_child(%L, %L)',
    p_table || '_docstatus', p_table, v_parent, v_key
  );
end;
$$;

-- Every table the helper governs: 38 doctypes and 17 tables of rows. merchants keeps its own policies.
select private.apply_doctype_policies(t.table_name, t.doctype, t.child)
from (values
  ('accounts', 'Account', false),
  ('accounts_settings', 'Accounts Settings', false),
  ('bins', 'Bin', false),
  ('brands', 'Brand', false),
  ('cost_centers', 'Cost Center', false),
  ('currencies', 'Currency', false),
  ('naming_series', 'Document Naming Settings', false),
  ('fiscal_years', 'Fiscal Year', false),
  ('gl_entries', 'GL Entry', false),
  ('global_defaults', 'Global Defaults', false),
  ('items', 'Item', false),
  ('item_groups', 'Item Group', false),
  ('item_prices', 'Item Price', false),
  ('item_tax_templates', 'Item Tax Template', false),
  ('letter_heads', 'Letter Head', false),
  ('modes_of_payment', 'Mode of Payment', false),
  ('pos_closing_entries', 'POS Closing Entry', false),
  ('pos_invoices', 'POS Invoice', false),
  ('pos_opening_entries', 'POS Opening Entry', false),
  ('pos_profiles', 'POS Profile', false),
  ('price_lists', 'Price List', false),
  ('pricing_rules', 'Pricing Rule', false),
  ('print_formats', 'Print Format', false),
  ('print_settings', 'Print Settings', false),
  ('roles', 'Role', false),
  ('sales_tax_templates', 'Sales Taxes and Charges Template', false),
  ('selling_settings', 'Selling Settings', false),
  ('stock_entries', 'Stock Entry', false),
  ('stock_ledger_entries', 'Stock Ledger Entry', false),
  ('stock_reconciliations', 'Stock Reconciliation', false),
  ('stock_settings', 'Stock Settings', false),
  ('system_settings', 'System Settings', false),
  ('tax_categories', 'Tax Category', false),
  ('tax_rules', 'Tax Rule', false),
  ('uoms', 'UOM', false),
  ('uom_conversion_factors', 'UOM Conversion Factor', false),
  ('merchant_members', 'User', false),
  ('warehouses', 'Warehouse', false),
  ('item_group_taxes', 'Item Group', true),
  ('item_tax_template_rows', 'Item Tax Template', true),
  ('item_taxes', 'Item', true),
  ('item_uoms', 'Item', true),
  ('naming_series_counters', 'Document Naming Settings', true),
  ('pos_closing_entry_payments', 'POS Closing Entry', true),
  ('pos_invoice_items', 'POS Invoice', true),
  ('pos_invoice_payments', 'POS Invoice', true),
  ('pos_invoice_taxes', 'POS Invoice', true),
  ('pos_opening_entry_balances', 'POS Opening Entry', true),
  ('pos_profile_item_groups', 'POS Profile', true),
  ('pos_profile_payments', 'POS Profile', true),
  ('pos_profile_users', 'POS Profile', true),
  ('pricing_rule_targets', 'Pricing Rule', true),
  ('sales_tax_template_rows', 'Sales Taxes and Charges Template', true),
  ('stock_entry_items', 'Stock Entry', true),
  ('stock_reconciliation_items', 'Stock Reconciliation', true)
) as t (table_name, doctype, child);

-- The old model. No policy names these functions any more.
drop table if exists public.role_permissions;
drop table if exists public.standard_role_permissions;
drop table if exists public.role_profile_roles;
drop table if exists public.member_roles;
drop table if exists public.role_profiles;
drop table if exists public.user_permissions;
drop table if exists public.doctype_links;

drop function if exists private.validate_user_permission();
drop function if exists private.restricted_merchant_ids(text, text);
drop function if exists private.allowed_record_ids(text, text);
drop function if exists private.effective_role_ids();
drop function if exists private.sync_standard_permissions(uuid);
drop function if exists public.save_member(jsonb);
drop function if exists public.save_role_profile(jsonb);
drop function if exists public.save_role_permissions(uuid, text, jsonb);

alter table public.doctypes drop column if exists restrictable;
delete from public.doctypes where name in ('Role Profile', 'Role Permission', 'User Permission');


-- 7. The owner's two saves. Security invoker: RLS decides, and only the owner passes role_grants',
-- member_overrides' and a role's or member's write policies.

-- A role, its permissions and — when `member_ids` is given — who holds it: those employees move to it, and
-- whoever held it and is not listed is left with no role.
create or replace function public.save_role(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_keys text[] := array(select jsonb_array_elements_text(coalesce(payload -> 'permissions', '[]'::jsonb)));
  v_members uuid[] := array(select jsonb_array_elements_text(coalesce(payload -> 'member_ids', '[]'::jsonb)))::uuid[];
  v_missing text;
begin
  select p.label into v_missing
  from public.permissions p
  where p.key = any (v_keys) and p.requires is not null and not (p.requires = any (v_keys))
  limit 1;
  if v_missing is not null then
    raise exception 'permission_requires' using errcode = '23514', detail = v_missing;
  end if;

  if v_id is null then
    insert into public.roles (merchant_id, role_name, description, color)
    values (v_merchant, btrim(payload ->> 'role_name'), nullif(btrim(payload ->> 'description'), ''), coalesce(payload ->> 'color', 'grey'))
    returning id into v_id;
  else
    update public.roles set
      role_name = btrim(payload ->> 'role_name'),
      description = nullif(btrim(payload ->> 'description'), ''),
      color = coalesce(payload ->> 'color', 'grey')
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'role_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.role_grants g where g.role_id = v_id and not (g.permission = any (v_keys));
  insert into public.role_grants (merchant_id, role_id, permission)
  select v_merchant, v_id, k.key from unnest(v_keys) as k (key)
  on conflict (role_id, permission) do nothing;

  if payload ? 'member_ids' then
    update public.merchant_members mm set role_id = null
    where mm.role_id = v_id and not (mm.id = any (v_members));
    update public.merchant_members mm set role_id = v_id
    where mm.merchant_id = v_merchant and mm.id = any (v_members) and mm.role_id is distinct from v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_role(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_role(jsonb) to authenticated;

-- One employee's role and their exceptions to it, replaced as a set: p_overrides is [{permission, allowed}],
-- only where the employee differs from the role. No p_role: no role — the generated RPC types forbid null, so
-- the app leaves out an argument it means as none.
create or replace function public.save_member_access(p_member uuid, p_role uuid default null, p_overrides jsonb default '[]'::jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_merchant uuid;
  v_missing text;
begin
  update public.merchant_members set role_id = p_role where id = p_member
  returning merchant_id into v_merchant;

  -- RLS filters an UPDATE rather than refusing it.
  if v_merchant is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  delete from public.member_overrides o
  where o.member_id = p_member
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) as x (value)
      where x.value ->> 'permission' = o.permission
    );

  insert into public.member_overrides (merchant_id, member_id, permission, allowed)
  select v_merchant, p_member, x.value ->> 'permission', (x.value ->> 'allowed')::boolean
  from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) as x (value)
  on conflict (member_id, permission) do update set allowed = excluded.allowed
  where public.member_overrides.allowed is distinct from excluded.allowed;

  -- What the employee holds now: a permission comes with the one it requires.
  with effective as (
    select g.permission from public.role_grants g
    where g.role_id = p_role
      and not exists (
        select 1 from public.member_overrides o where o.member_id = p_member and o.permission = g.permission and not o.allowed
      )
    union
    select o.permission from public.member_overrides o where o.member_id = p_member and o.allowed
  )
  select p.label into v_missing
  from effective e
  join public.permissions p on p.key = e.permission
  where p.requires is not null and p.requires not in (select f.permission from effective f)
  limit 1;

  if v_missing is not null then
    raise exception 'permission_requires' using errcode = '23514', detail = v_missing;
  end if;
end;
$$;

revoke execute on function public.save_member_access(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_member_access(uuid, uuid, jsonb) to authenticated;

-- "Access changed", once per employee until they read it: a role's permissions changed (role_grants), their
-- role (merchant_members.role_id) or their own exceptions (member_overrides). Skipped when the system, the
-- employee or their account is going — removing any of them takes these rows with it.
create or replace function private.notify_access_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.notifications (user_id, merchant_id, kind, title, body)
  select mm.user_id, mm.merchant_id, 'access_changed', 'Access changed',
    format('The owner of %s changed what you can do there.', m.name)
  from public.merchant_members mm
  join public.merchants m on m.id = mm.merchant_id
  where case tg_table_name
      when 'role_grants' then mm.role_id = (v_row ->> 'role_id')::uuid
      when 'member_overrides' then mm.id = (v_row ->> 'member_id')::uuid
      else mm.id = (v_row ->> 'id')::uuid
    end
    and exists (select 1 from auth.users u where u.id = mm.user_id)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = mm.user_id and n.merchant_id = mm.merchant_id and n.kind = 'access_changed' and n.read_at is null
    );
  return null;
end;
$$;

revoke execute on function private.notify_access_changed() from public, anon, authenticated, service_role;

drop trigger if exists role_grants_notify on public.role_grants;
create trigger role_grants_notify
  after insert or delete on public.role_grants
  for each row execute function private.notify_access_changed();

drop trigger if exists member_overrides_notify on public.member_overrides;
create trigger member_overrides_notify
  after insert or update or delete on public.member_overrides
  for each row execute function private.notify_access_changed();

drop trigger if exists merchant_members_notify_role on public.merchant_members;
create trigger merchant_members_notify_role
  after update of role_id on public.merchant_members
  for each row when (old.role_id is distinct from new.role_id)
  execute function private.notify_access_changed();


-- 8. Every system's starter roles, with their permissions — only for a role this run made, so a role the
-- owner has edited keeps their changes.
create or replace function private.seed_roles(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  with made as (
    insert into public.roles (merchant_id, role_name, description, color)
    values
      (p_merchant, 'Cashier', 'Rings up sales and opens and closes their register.', 'green'),
      (p_merchant, 'Stock Clerk', 'Sees stock levels and receives shipments.', 'orange'),
      (p_merchant, 'Store Manager', 'Every permission in the system.', 'maroon')
    on conflict (merchant_id, role_name) do nothing
    returning id, role_name
  )
  insert into public.role_grants (merchant_id, role_id, permission)
  select p_merchant, r.id, p.key
  from made r
  join public.permissions p on case r.role_name
    when 'Cashier' then p.key in ('process_sales', 'open_close_register')
    when 'Stock Clerk' then p.key in ('view_stock', 'move_stock')
    else true
  end;
$$;

revoke execute on function private.seed_roles(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_roles(new.id);
  return new;
end;
$$;

-- The systems that already exist.
select private.seed_roles(m.id) from public.merchants m;
