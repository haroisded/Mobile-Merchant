-- Revert of 20261014034106_employees_and_permissions.sql: ERPNext's roles come back — the standard roles and
-- their matrix in every system, role profiles, the Role Permissions Manager, User Permissions and the doctype
-- links — with the functions and policies exactly as 20261012131350_access_for_documents.sql and Pass 1 left
-- them.
--
-- DESTROYS every role, role permission and employee exception made under Employees & permissions. Employees stay
-- members of their systems with no role but ERPNext's All, until the owner gives them roles again.

create schema if not exists private;


-- 1. The new saves, notifications and per-system tables. Dropped first, so removing the roles below notifies
-- nobody.
drop trigger if exists merchant_members_notify_role on public.merchant_members;
drop table if exists public.member_overrides;
drop table if exists public.role_grants;
drop function if exists private.notify_access_changed();
drop function if exists public.save_role(jsonb);
drop function if exists public.save_member_access(uuid, uuid, jsonb);


-- 2. The registry: Restrictable, the three doctypes, the standard matrix and the links.
alter table public.doctypes add column if not exists restrictable boolean not null default false;
update public.doctypes set restrictable = true where name in ('Account', 'Cost Center', 'Fiscal Year', 'Item Group', 'Warehouse');

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Role Profile', 'role_profiles', 'record', false),
  ('Role Permission', 'role_permissions', 'record', false),
  ('User Permission', 'user_permissions', 'record', false)
on conflict (name) do nothing;

create table if not exists public.standard_role_permissions (
  role_name text not null,
  doctype text not null references public.doctypes (name) on delete cascade,
  can_select boolean not null default false,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_create boolean not null default false,
  can_delete boolean not null default false,
  can_submit boolean not null default false,
  can_cancel boolean not null default false,

  primary key (role_name, doctype)
);

alter table public.standard_role_permissions enable row level security;

drop policy if exists standard_role_permissions_select on public.standard_role_permissions;
create policy standard_role_permissions_select on public.standard_role_permissions
  for select to authenticated
  using (true);

-- The matrix as Steps 11–21 left it: select, read, write, create, delete, submit, cancel.
insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete, can_submit, can_cancel)
select r.role_name, r.doctype, substr(r.bits, 1, 1) = '1', substr(r.bits, 2, 1) = '1', substr(r.bits, 3, 1) = '1',
  substr(r.bits, 4, 1) = '1', substr(r.bits, 5, 1) = '1', substr(r.bits, 6, 1) = '1', substr(r.bits, 7, 1) = '1'
from (values
  ('Accounts Manager', 'Account', '1111100'),
  ('Accounts User', 'Account', '1100000'),
  ('All', 'Account', '1000000'),
  ('Accounts Manager', 'Accounts Settings', '1110000'),
  ('Accounts User', 'Accounts Settings', '1100000'),
  ('All', 'Accounts Settings', '1100000'),
  ('System Manager', 'Accounts Settings', '1110000'),
  ('Accounts Manager', 'Bin', '1100000'),
  ('Item Manager', 'Bin', '1100000'),
  ('Sales Manager', 'Bin', '1100000'),
  ('Sales User', 'Bin', '1100000'),
  ('Stock Manager', 'Bin', '1100000'),
  ('Stock User', 'Bin', '1100000'),
  ('All', 'Brand', '1000000'),
  ('Item Manager', 'Brand', '1111100'),
  ('Sales Master Manager', 'Brand', '1111100'),
  ('Sales User', 'Brand', '1100000'),
  ('Stock Manager', 'Brand', '1100000'),
  ('Stock User', 'Brand', '1100000'),
  ('Accounts Manager', 'Company', '1110000'),
  ('Accounts User', 'Company', '1100000'),
  ('All', 'Company', '1000000'),
  ('Sales Manager', 'Company', '1100000'),
  ('Sales Master Manager', 'Company', '1100000'),
  ('Stock Manager', 'Company', '1100000'),
  ('System Manager', 'Company', '1110000'),
  ('Accounts Manager', 'Cost Center', '1111100'),
  ('Accounts User', 'Cost Center', '1100000'),
  ('All', 'Cost Center', '1000000'),
  ('Accounts Manager', 'Currency', '1111100'),
  ('All', 'Currency', '1100000'),
  ('System Manager', 'Currency', '1111100'),
  ('System Manager', 'Document Naming Settings', '1110000'),
  ('Accounts Manager', 'Fiscal Year', '1111100'),
  ('Accounts User', 'Fiscal Year', '1100000'),
  ('All', 'Fiscal Year', '1000000'),
  ('System Manager', 'Fiscal Year', '1111100'),
  ('Accounts Manager', 'GL Entry', '1100000'),
  ('Accounts User', 'GL Entry', '1100000'),
  ('All', 'Global Defaults', '1100000'),
  ('System Manager', 'Global Defaults', '1110000'),
  ('Accounts Manager', 'Item', '1100000'),
  ('Accounts User', 'Item', '1100000'),
  ('All', 'Item', '1000000'),
  ('Item Manager', 'Item', '1111100'),
  ('Sales Manager', 'Item', '1100000'),
  ('Sales Master Manager', 'Item', '1100000'),
  ('Sales User', 'Item', '1100000'),
  ('Stock Manager', 'Item', '1100000'),
  ('Stock User', 'Item', '1100000'),
  ('All', 'Item Group', '1000000'),
  ('Item Manager', 'Item Group', '1111100'),
  ('Sales Master Manager', 'Item Group', '1111100'),
  ('Sales User', 'Item Group', '1100000'),
  ('Stock Manager', 'Item Group', '1100000'),
  ('Stock User', 'Item Group', '1100000'),
  ('Accounts Manager', 'Item Price', '1100000'),
  ('Accounts User', 'Item Price', '1100000'),
  ('Item Manager', 'Item Price', '1111100'),
  ('Sales Manager', 'Item Price', '1100000'),
  ('Sales Master Manager', 'Item Price', '1111100'),
  ('Sales User', 'Item Price', '1100000'),
  ('Stock Manager', 'Item Price', '1100000'),
  ('Stock User', 'Item Price', '1100000'),
  ('Accounts Manager', 'Item Tax Template', '1111100'),
  ('Accounts User', 'Item Tax Template', '1100000'),
  ('All', 'Item Tax Template', '1000000'),
  ('Sales User', 'Item Tax Template', '1100000'),
  ('All', 'Letter Head', '1100000'),
  ('System Manager', 'Letter Head', '1111100'),
  ('Accounts Manager', 'Mode of Payment', '1111100'),
  ('Accounts User', 'Mode of Payment', '1100000'),
  ('All', 'Mode of Payment', '1000000'),
  ('Sales User', 'Mode of Payment', '1100000'),
  ('Accounts Manager', 'POS Closing Entry', '1100000'),
  ('Sales Manager', 'POS Closing Entry', '1111111'),
  ('Sales User', 'POS Closing Entry', '1111010'),
  ('Accounts Manager', 'POS Invoice', '1111111'),
  ('Accounts User', 'POS Invoice', '1100000'),
  ('Sales Manager', 'POS Invoice', '1111111'),
  ('Sales User', 'POS Invoice', '1111010'),
  ('Accounts Manager', 'POS Opening Entry', '1100000'),
  ('Sales Manager', 'POS Opening Entry', '1111111'),
  ('Sales User', 'POS Opening Entry', '1111010'),
  ('Accounts Manager', 'POS Profile', '1111100'),
  ('Sales Manager', 'POS Profile', '1111100'),
  ('Sales User', 'POS Profile', '1100000'),
  ('Accounts User', 'Price List', '1100000'),
  ('All', 'Price List', '1000000'),
  ('Item Manager', 'Price List', '1100000'),
  ('Sales Manager', 'Price List', '1100000'),
  ('Sales Master Manager', 'Price List', '1111100'),
  ('Sales User', 'Price List', '1100000'),
  ('Stock Manager', 'Price List', '1100000'),
  ('Accounts Manager', 'Pricing Rule', '1100000'),
  ('Sales Manager', 'Pricing Rule', '1111100'),
  ('Sales Master Manager', 'Pricing Rule', '1111100'),
  ('Sales User', 'Pricing Rule', '1100000'),
  ('All', 'Print Format', '1100000'),
  ('System Manager', 'Print Format', '1111100'),
  ('All', 'Print Settings', '1100000'),
  ('System Manager', 'Print Settings', '1110000'),
  ('All', 'Role', '1000000'),
  ('System Manager', 'Role', '1111100'),
  ('System Manager', 'Role Permission', '1111100'),
  ('System Manager', 'Role Profile', '1111100'),
  ('Accounts Manager', 'Sales Taxes and Charges Template', '1111100'),
  ('Accounts User', 'Sales Taxes and Charges Template', '1100000'),
  ('All', 'Sales Taxes and Charges Template', '1000000'),
  ('Sales Master Manager', 'Sales Taxes and Charges Template', '1111100'),
  ('Sales User', 'Sales Taxes and Charges Template', '1100000'),
  ('All', 'Selling Settings', '1100000'),
  ('Sales Manager', 'Selling Settings', '1110000'),
  ('System Manager', 'Selling Settings', '1110000'),
  ('Stock Manager', 'Stock Entry', '1111111'),
  ('Stock User', 'Stock Entry', '1111010'),
  ('Accounts Manager', 'Stock Ledger Entry', '1100000'),
  ('Stock Manager', 'Stock Ledger Entry', '1100000'),
  ('Stock User', 'Stock Ledger Entry', '1100000'),
  ('Stock Manager', 'Stock Reconciliation', '1111111'),
  ('All', 'Stock Settings', '1100000'),
  ('Stock Manager', 'Stock Settings', '1110000'),
  ('System Manager', 'Stock Settings', '1110000'),
  ('All', 'System Settings', '1100000'),
  ('System Manager', 'System Settings', '1110000'),
  ('Accounts Manager', 'Tax Category', '1111100'),
  ('Accounts User', 'Tax Category', '1100000'),
  ('All', 'Tax Category', '1000000'),
  ('Sales User', 'Tax Category', '1100000'),
  ('Accounts Manager', 'Tax Rule', '1111100'),
  ('Accounts User', 'Tax Rule', '1100000'),
  ('All', 'Tax Rule', '1000000'),
  ('Sales Master Manager', 'Tax Rule', '1111100'),
  ('Sales User', 'Tax Rule', '1100000'),
  ('All', 'UOM', '1100000'),
  ('Item Manager', 'UOM', '1111100'),
  ('Stock Manager', 'UOM', '1111100'),
  ('All', 'UOM Conversion Factor', '1100000'),
  ('Item Manager', 'UOM Conversion Factor', '1111100'),
  ('Stock Manager', 'UOM Conversion Factor', '1111100'),
  ('System Manager', 'User', '1111100'),
  ('System Manager', 'User Permission', '1111100'),
  ('Accounts User', 'Warehouse', '1100000'),
  ('All', 'Warehouse', '1000000'),
  ('Item Manager', 'Warehouse', '1111100'),
  ('Sales User', 'Warehouse', '1100000'),
  ('Stock Manager', 'Warehouse', '1111100'),
  ('Stock User', 'Warehouse', '1100000')
) as r (role_name, doctype, bits)
on conflict (role_name, doctype) do nothing;

create table if not exists public.doctype_links (
  doctype text not null references public.doctypes (name) on delete cascade,
  link_doctype text not null references public.doctypes (name) on delete cascade,
  column_name text not null,

  primary key (doctype, column_name)
);

alter table public.doctype_links enable row level security;
create index if not exists doctype_links_link_doctype_idx on public.doctype_links (link_doctype);

drop policy if exists doctype_links_select on public.doctype_links;
create policy doctype_links_select on public.doctype_links
  for select to authenticated
  using (true);

insert into public.doctype_links (doctype, link_doctype, column_name)
values
  ('GL Entry', 'Account', 'account_id'),
  ('GL Entry', 'Cost Center', 'cost_center_id'),
  ('Stock Ledger Entry', 'Warehouse', 'warehouse_id'),
  ('Bin', 'Warehouse', 'warehouse_id'),
  ('Stock Entry', 'Warehouse', 'from_warehouse'),
  ('Stock Entry', 'Warehouse', 'to_warehouse'),
  ('POS Invoice', 'Warehouse', 'warehouse'),
  ('POS Profile', 'Warehouse', 'warehouse'),
  ('Item', 'Item Group', 'item_group_id')
on conflict (doctype, column_name) do nothing;


-- 3. Roles: every role goes (with its permissions and holders), then the standard roles' columns and guard.
delete from public.roles;

alter table public.roles drop constraint if exists roles_color;
alter table public.roles drop constraint if exists roles_description_length;
alter table public.roles drop column if exists description;
alter table public.roles drop column if exists color;
alter table public.roles add column if not exists is_standard boolean not null default false;
alter table public.roles add column if not exists disabled boolean not null default false;

create or replace function private.guard_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_standard and current_user in ('authenticated', 'anon') then
      raise exception 'standard_role_reserved' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_standard and current_user in ('authenticated', 'anon') then
      raise exception 'standard_role_locked' using errcode = '42501',
        detail = 'A standard role cannot be deleted; disable it instead.';
    end if;
    return old;
  end if;

  if old.is_standard and (new.role_name is distinct from old.role_name or not new.is_standard) then
    raise exception 'standard_role_locked' using errcode = '42501', detail = 'A standard role cannot be renamed.';
  end if;
  if not old.is_standard and new.is_standard then
    raise exception 'standard_role_reserved' using errcode = '42501';
  end if;
  if new.is_standard and new.role_name = 'All' and new.disabled then
    raise exception 'all_role_required' using errcode = '42501', detail = 'Every member holds All; it cannot be disabled.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_roles() from public, anon, authenticated, service_role;

drop trigger if exists roles_guard on public.roles;
create trigger roles_guard
  before insert or update or delete on public.roles
  for each row execute function private.guard_roles();


-- 4. Role profiles, members' roles, profiles and Enabled, the Role Permissions Manager and User Permissions.
create table if not exists public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  role_profile_name text not null,
  created_at timestamptz not null default now(),

  constraint role_profiles_id_merchant unique (id, merchant_id),
  constraint role_profiles_name_unique unique (merchant_id, role_profile_name),
  constraint role_profiles_name_length check (length(btrim(role_profile_name)) between 1 and 60)
);

alter table public.role_profiles enable row level security;

create table if not exists public.role_profile_roles (
  role_profile_id uuid not null,
  role_id uuid not null,
  merchant_id uuid not null,

  primary key (role_profile_id, role_id),
  constraint role_profile_roles_profile_fk foreign key (role_profile_id, merchant_id)
    references public.role_profiles (id, merchant_id) on delete cascade,
  constraint role_profile_roles_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.role_profile_roles enable row level security;
create index if not exists role_profile_roles_role_id_idx on public.role_profile_roles (role_id, merchant_id);
create index if not exists role_profile_roles_merchant_id_idx on public.role_profile_roles (merchant_id);

alter table public.merchant_members drop column if exists role_id;
alter table public.merchant_members add column if not exists enabled boolean not null default true;
alter table public.merchant_members add column if not exists role_profile_id uuid;
alter table public.merchant_members drop constraint if exists merchant_members_role_profile_fk;
alter table public.merchant_members add constraint merchant_members_role_profile_fk foreign key (role_profile_id, merchant_id)
  references public.role_profiles (id, merchant_id) on delete set null (role_profile_id);
create index if not exists merchant_members_role_profile_id_idx on public.merchant_members (role_profile_id, merchant_id);

create table if not exists public.member_roles (
  member_id uuid not null,
  role_id uuid not null,
  merchant_id uuid not null,

  primary key (member_id, role_id),
  constraint member_roles_member_fk foreign key (member_id, merchant_id)
    references public.merchant_members (id, merchant_id) on delete cascade,
  constraint member_roles_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.member_roles enable row level security;
create index if not exists member_roles_role_id_idx on public.member_roles (role_id, merchant_id);
create index if not exists member_roles_merchant_id_idx on public.member_roles (merchant_id);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  role_id uuid not null,
  doctype text not null references public.doctypes (name) on delete cascade,
  can_select boolean not null default false,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_create boolean not null default false,
  can_delete boolean not null default false,
  can_submit boolean not null default false,
  can_cancel boolean not null default false,

  constraint role_permissions_id_merchant unique (id, merchant_id),
  constraint role_permissions_role_doctype_unique unique (role_id, doctype),
  constraint role_permissions_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.role_permissions enable row level security;
create index if not exists role_permissions_merchant_doctype_idx on public.role_permissions (merchant_id, doctype);
create index if not exists role_permissions_doctype_idx on public.role_permissions (doctype);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  member_id uuid not null,
  allow text not null references public.doctypes (name) on delete cascade,
  for_value uuid not null,
  is_default boolean not null default false,
  apply_to_all_doctypes boolean not null default true,
  applicable_for text references public.doctypes (name) on delete cascade,
  hide_descendants boolean not null default false,
  created_at timestamptz not null default now(),

  constraint user_permissions_id_merchant unique (id, merchant_id),
  constraint user_permissions_unique unique nulls not distinct (member_id, allow, for_value, applicable_for),
  constraint user_permissions_applicable_for check ((apply_to_all_doctypes and applicable_for is null) or (not apply_to_all_doctypes and applicable_for is not null)),
  constraint user_permissions_member_fk foreign key (member_id, merchant_id)
    references public.merchant_members (id, merchant_id) on delete cascade
);

alter table public.user_permissions enable row level security;
create index if not exists user_permissions_merchant_id_idx on public.user_permissions (merchant_id);
create index if not exists user_permissions_allow_idx on public.user_permissions (allow);
create index if not exists user_permissions_applicable_for_idx on public.user_permissions (applicable_for);
create unique index if not exists user_permissions_one_default on public.user_permissions (member_id, allow) where is_default;


-- 5. The engine as it was.
create or replace function private.effective_role_ids()
returns table (merchant_id uuid, role_id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select mm.merchant_id, r.id
  from public.merchant_members mm
  join public.roles r on r.merchant_id = mm.merchant_id and not r.disabled
  where mm.user_id = (select auth.uid())
    and mm.enabled
    and (
      (r.is_standard and r.role_name = 'All')
      or (mm.role_profile_id is not null and exists (
        select 1 from public.role_profile_roles rpr where rpr.role_profile_id = mm.role_profile_id and rpr.role_id = r.id
      ))
      or (mm.role_profile_id is null and exists (
        select 1 from public.member_roles mr where mr.member_id = mm.id and mr.role_id = r.id
      ))
    );
$$;

revoke execute on function private.effective_role_ids() from public, anon, authenticated, service_role;

create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select mm.merchant_id from public.merchant_members mm where mm.user_id = (select auth.uid()) and mm.enabled;
$$;

create or replace function private.permitted_merchant_ids(p_doctype text, p_ptype text)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select e.merchant_id
  from private.effective_role_ids() e
  join public.role_permissions rp on rp.role_id = e.role_id and rp.doctype = p_doctype
  where case p_ptype
    when 'select' then rp.can_select or rp.can_read
    when 'read' then rp.can_read
    when 'write' then rp.can_write
    when 'create' then rp.can_create
    when 'delete' then rp.can_delete
    when 'submit' then rp.can_submit
    when 'cancel' then rp.can_cancel
    else false
  end;
$$;

create or replace function private.restricted_merchant_ids(p_allow text, p_applicable text)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct mm.merchant_id
  from public.user_permissions up
  join public.merchant_members mm on mm.id = up.member_id
  where mm.user_id = (select auth.uid())
    and mm.enabled
    and up.allow = p_allow
    and (up.apply_to_all_doctypes or up.applicable_for = p_applicable);
$$;

revoke execute on function private.restricted_merchant_ids(text, text) from public, anon, authenticated, service_role;
grant execute on function private.restricted_merchant_ids(text, text) to authenticated;

create or replace function private.allowed_record_ids(p_allow text, p_applicable text)
returns setof uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_table text;
  v_kind text;
begin
  select d.table_name, d.kind into v_table, v_kind from public.doctypes d where d.name = p_allow;

  if v_kind = 'tree' then
    return query execute format(
      'with recursive granted as (
         select up.for_value, up.hide_descendants
         from public.user_permissions up
         join public.merchant_members mm on mm.id = up.member_id
         where mm.user_id = $1 and mm.enabled and up.allow = $2
           and (up.apply_to_all_doctypes or up.applicable_for = $3)
       ),
       descendants (id) as (
         select g.for_value from granted g where not g.hide_descendants
         union
         select c.id from public.%I c join descendants d on c.parent_id = d.id
       )
       select g.for_value from granted g
       union
       select d.id from descendants d',
      v_table
    ) using (select auth.uid()), p_allow, p_applicable;
  else
    return query
      select up.for_value
      from public.user_permissions up
      join public.merchant_members mm on mm.id = up.member_id
      where mm.user_id = (select auth.uid()) and mm.enabled and up.allow = p_allow
        and (up.apply_to_all_doctypes or up.applicable_for = p_applicable);
  end if;
end;
$$;

revoke execute on function private.allowed_record_ids(text, text) from public, anon, authenticated, service_role;
grant execute on function private.allowed_record_ids(text, text) to authenticated;

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
  elsif exists (select 1 from public.merchant_members mm where mm.merchant_id = p_merchant and mm.user_id = v_uid and mm.enabled) then
    select coalesce(jsonb_object_agg(x.doctype, jsonb_build_object(
      'select', x.can_select, 'read', x.can_read, 'write', x.can_write, 'create', x.can_create, 'delete', x.can_delete,
      'submit', x.can_submit, 'cancel', x.can_cancel
    )), '{}'::jsonb)
    into v_perms
    from (
      select rp.doctype,
        bool_or(rp.can_select or rp.can_read) as can_select,
        bool_or(rp.can_read) as can_read,
        bool_or(rp.can_write) as can_write,
        bool_or(rp.can_create) as can_create,
        bool_or(rp.can_delete) as can_delete,
        bool_or(rp.can_submit) as can_submit,
        bool_or(rp.can_cancel) as can_cancel
      from private.effective_role_ids() e
      join public.role_permissions rp on rp.role_id = e.role_id
      where e.merchant_id = p_merchant
      group by rp.doctype
    ) x;
  else
    return null;
  end if;

  return jsonb_build_object(
    'is_owner', v_owner = v_uid,
    'owner_email', v_owner_email,
    'owner_name', v_owner_name,
    'perms', v_perms
  );
end;
$$;

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
        where u.pos_profile_id = p.id and mm.user_id = (select auth.uid()) and mm.enabled
      )
    )
    from public.pos_profiles p
    join public.merchants m on m.id = p.merchant_id
    where p.id = p_profile
  ), false);
$$;

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
    and not exists (select 1 from private.effective_role_ids() e where e.merchant_id = p_merchant and e.role_id = v_role) then
    raise exception 'accounts_frozen' using errcode = '23514',
      detail = format('Accounts are frozen till %s.', v_frozen);
  end if;
end;
$$;

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

create or replace function private.validate_user_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_kind text;
  v_restrictable boolean;
  v_exists boolean;
begin
  select d.table_name, d.kind, d.restrictable into v_table, v_kind, v_restrictable
  from public.doctypes d where d.name = new.allow;

  if not coalesce(v_restrictable, false) then
    raise exception 'not_restrictable' using errcode = '23514', detail = format('%s cannot be restricted by a User Permission.', new.allow);
  end if;

  execute format('select exists (select 1 from public.%I where id = $1 and merchant_id = $2)', v_table)
    into v_exists using new.for_value, new.merchant_id;
  if not v_exists then
    raise exception 'for_value_missing' using errcode = '23503', detail = format('No %s with that id in this system.', new.allow);
  end if;

  if new.applicable_for is not null and new.applicable_for <> new.allow
    and not exists (select 1 from public.doctype_links l where l.doctype = new.applicable_for and l.link_doctype = new.allow) then
    raise exception 'not_applicable' using errcode = '23514', detail = format('%s does not link to a %s.', new.applicable_for, new.allow);
  end if;

  if v_kind <> 'tree' then
    new.hide_descendants := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_user_permission() from public, anon, authenticated, service_role;

drop trigger if exists user_permissions_validate on public.user_permissions;
create trigger user_permissions_validate
  before insert or update on public.user_permissions
  for each row execute function private.validate_user_permission();

create or replace function public.save_member(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_profile uuid := nullif(payload ->> 'role_profile_id', '')::uuid;
begin
  if v_id is null then
    insert into public.merchant_members (merchant_id, email, full_name, enabled, role_profile_id)
    values (v_merchant, payload ->> 'email', nullif(btrim(payload ->> 'full_name'), ''), coalesce((payload ->> 'enabled')::boolean, true), v_profile)
    returning id into v_id;
  else
    update public.merchant_members set
      email = payload ->> 'email',
      full_name = nullif(btrim(payload ->> 'full_name'), ''),
      enabled = coalesce((payload ->> 'enabled')::boolean, true),
      role_profile_id = v_profile
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'member_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.member_roles where member_id = v_id;

  if v_profile is null then
    insert into public.member_roles (member_id, role_id, merchant_id)
    select v_id, r.value::uuid, v_merchant
    from jsonb_array_elements_text(coalesce(payload -> 'role_ids', '[]'::jsonb)) as r (value);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_member(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_member(jsonb) to authenticated;

create or replace function public.save_role_profile(payload jsonb)
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
    insert into public.role_profiles (merchant_id, role_profile_name)
    values (v_merchant, btrim(payload ->> 'role_profile_name'))
    returning id into v_id;
  else
    update public.role_profiles set role_profile_name = btrim(payload ->> 'role_profile_name')
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'role_profile_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.role_profile_roles where role_profile_id = v_id;

  insert into public.role_profile_roles (role_profile_id, role_id, merchant_id)
  select v_id, r.value::uuid, v_merchant
  from jsonb_array_elements_text(coalesce(payload -> 'role_ids', '[]'::jsonb)) as r (value);

  return v_id;
end;
$$;

revoke execute on function public.save_role_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_role_profile(jsonb) to authenticated;

create or replace function public.save_role_permissions(p_merchant uuid, p_doctype text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.role_permissions rp
  where rp.merchant_id = p_merchant and rp.doctype = p_doctype
    and rp.role_id not in (
      select (r.value ->> 'role_id')::uuid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r (value)
    );

  insert into public.role_permissions (merchant_id, role_id, doctype, can_select, can_read, can_write, can_create, can_delete, can_submit, can_cancel)
  select p_merchant, (r.value ->> 'role_id')::uuid, p_doctype,
    coalesce((r.value ->> 'can_select')::boolean, false),
    coalesce((r.value ->> 'can_read')::boolean, false),
    coalesce((r.value ->> 'can_write')::boolean, false),
    coalesce((r.value ->> 'can_create')::boolean, false),
    coalesce((r.value ->> 'can_delete')::boolean, false),
    coalesce((r.value ->> 'can_submit')::boolean, false),
    coalesce((r.value ->> 'can_cancel')::boolean, false)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r (value)
  on conflict (role_id, doctype) do update set
    can_select = excluded.can_select,
    can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_create = excluded.can_create,
    can_delete = excluded.can_delete,
    can_submit = excluded.can_submit,
    can_cancel = excluded.can_cancel;
end;
$$;

revoke execute on function public.save_role_permissions(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_role_permissions(uuid, text, jsonb) to authenticated;

create or replace function private.sync_standard_permissions(p_merchant uuid default null)
returns void
language sql
set search_path = ''
as $$
  insert into public.role_permissions (merchant_id, role_id, doctype, can_select, can_read, can_write, can_create, can_delete, can_submit, can_cancel)
  select r.merchant_id, r.id, s.doctype, s.can_select, s.can_read, s.can_write, s.can_create, s.can_delete, s.can_submit, s.can_cancel
  from public.standard_role_permissions s
  join public.roles r on r.role_name = s.role_name and r.is_standard
  where p_merchant is null or r.merchant_id = p_merchant
  on conflict (role_id, doctype) do nothing;
$$;

revoke execute on function private.sync_standard_permissions(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_roles(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.roles (merchant_id, role_name, is_standard)
  select p_merchant, r.name, true
  from unnest(array[
    'System Manager', 'Accounts Manager', 'Accounts User', 'Stock Manager', 'Stock User',
    'Item Manager', 'Sales Manager', 'Sales Master Manager', 'Sales User', 'All'
  ]) as r (name)
  on conflict (merchant_id, role_name) do nothing;
$$;

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
  perform private.sync_standard_permissions(new.id);
  return new;
end;
$$;


-- 6. The policies, through the helper with User Permissions and the links: the 55 tables Employees &
-- permissions re-applied, and the five it dropped.
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent text;
  v_restrictable boolean;
  -- What limits the rows a person may see or change, and the part of it a new row can be held to.
  v_restrict text := '';
  v_check text := '';
  v_cmd text;
  v_key text;
  v_link record;
begin
  select d.kind, d.restrictable, d.table_name into v_kind, v_restrictable, v_parent from public.doctypes d where d.name = p_doctype;
  if v_kind is null then
    raise exception 'unknown doctype %', p_doctype;
  end if;

  foreach v_cmd in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table || '_' || v_cmd, p_table);
  end loop;

  if p_child then
    -- This table's key to its document: the column of its foreign key to the doctype's table.
    select a.attname into v_key
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid = format('public.%I', p_table)::regclass
      and c.confrelid = format('public.%I', v_parent)::regclass
      and a.attname <> 'merchant_id';

    if exists (select 1 from public.doctype_links l where l.doctype = p_doctype) then
      if v_key is null then
        raise exception '% has no foreign key to %', p_table, v_parent;
      end if;
      v_check := format(' and exists (select 1 from public.%I p where p.id = %I.%I)', v_parent, p_table, v_key);
      v_restrict := v_check;
    end if;
  else
    for v_link in
      select l.link_doctype, l.column_name from public.doctype_links l where l.doctype = p_doctype order by l.column_name
    loop
      v_check := v_check || format(
        ' and (merchant_id not in (select private.restricted_merchant_ids(%L, %L)) or %I is null or %I in (select private.allowed_record_ids(%L, %L)))',
        v_link.link_doctype, p_doctype, v_link.column_name, v_link.column_name, v_link.link_doctype, p_doctype
      );
    end loop;

    if v_restrictable then
      v_restrict := format(
        ' and (merchant_id not in (select private.restricted_merchant_ids(%L, %L)) or id in (select private.allowed_record_ids(%L, %L)))',
        p_doctype, p_doctype, p_doctype, p_doctype
      );
    end if;
    v_restrict := v_restrict || v_check;
  end if;

  execute format(
    'create policy %I on public.%I for select to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_select', p_table, p_doctype, case when p_child then 'read' else 'select' end, v_restrict
  );

  if v_kind = 'ledger' then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for update to authenticated
       using (merchant_id in (select private.permitted_merchant_ids(%L, ''write''))%s)
       with check (merchant_id in (select private.permitted_merchant_ids(%L, ''write''))%s)',
    p_table || '_update', p_table, p_doctype, v_restrict, p_doctype, v_restrict
  );

  if v_kind = 'single' and not p_child then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for insert to authenticated with check (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_insert', p_table, p_doctype, case when p_child then 'write' else 'create' end, v_check
  );

  execute format(
    'create policy %I on public.%I for delete to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_delete', p_table, p_doctype, case when p_child then 'write' else 'delete' end, v_restrict
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

  if v_key is null then
    raise exception '% has no foreign key to %', p_table, v_parent;
  end if;

  execute format(
    'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus_child(%L, %L)',
    p_table || '_docstatus', p_table, v_parent, v_key
  );
end;
$$;

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
  ('role_profiles', 'Role Profile', false),
  ('role_permissions', 'Role Permission', false),
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
  ('user_permissions', 'User Permission', false),
  ('warehouses', 'Warehouse', false),
  ('item_group_taxes', 'Item Group', true),
  ('item_tax_template_rows', 'Item Tax Template', true),
  ('item_taxes', 'Item', true),
  ('item_uoms', 'Item', true),
  ('member_roles', 'User', true),
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
  ('role_profile_roles', 'Role Profile', true),
  ('sales_tax_template_rows', 'Sales Taxes and Charges Template', true),
  ('stock_entry_items', 'Stock Entry', true),
  ('stock_reconciliation_items', 'Stock Reconciliation', true)
) as t (table_name, doctype, child);


-- 7. The permission catalog.
drop function if exists private.has_permission(uuid, text);
drop function if exists private.my_permission_keys();
drop table if exists public.permission_rules;
drop table if exists public.permissions;


-- 8. Every system's standard roles and their matrix.
select private.seed_roles(m.id) from public.merchants m;
select private.sync_standard_permissions();
