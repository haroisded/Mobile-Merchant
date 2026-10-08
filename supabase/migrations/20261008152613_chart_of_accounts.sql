-- Step 3 of the POS foundation, on ERPNext's model: Financial Structure
-- (.claude/erpnext-docs/POS-System-Only-Features.md 3.1–3.2; docs.frappe.io/erpnext/chart-of-accounts,
-- /cost-center).
--
-- 1. accounts: the Chart of Accounts tree. Group accounts organise it; ledgers are the leaves transactions
--    post to. Every account carries its root's type (Asset, Liability, Equity, Income, Expense), and an
--    Account Type when it has a purpose (Cash, Stock, Tax …) — the type later filters account fields.
-- 2. cost_centers: the tree that tags income and expense lines; one root per system, its company.
-- 3. private.validate_tree(): the rules both trees share.
-- 4. Their doctypes, permissions and policies — restrictable, so a User Permission can hold a user to a
--    branch of either tree.
-- 5. The seed: ERPNext's standard chart, cut to what a POS posts to (current-plan.md, "Seed data"), and the
--    company's cost center with Main under it.
--
-- Names are stored bare: the " - ABBR" suffix ERPNext appends is shown, never stored, so editing the
-- abbreviation renames nothing. Out of scope, so not seeded and not allowed as types: receivable and
-- payable (no Customer or Supplier), fixed assets. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Accounts.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  account_name text not null,
  account_number text,
  -- Null only for the five roots.
  parent_id uuid,
  is_group boolean not null default false,
  root_type text not null,
  account_type text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint accounts_id_merchant unique (id, merchant_id),
  constraint accounts_name_unique unique (merchant_id, account_name),
  constraint accounts_number_unique unique (merchant_id, account_number),
  constraint accounts_name_length check (length(btrim(account_name)) between 1 and 140),
  constraint accounts_number_length check (account_number is null or length(btrim(account_number)) between 1 and 20),
  constraint accounts_root_type check (root_type in ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  -- ERPNext's account types this app uses, each under the root types it belongs to.
  constraint accounts_type_fits_root check (
    account_type is null or account_type = any (case root_type
      when 'Asset' then array['Bank', 'Cash', 'Chargeable', 'Current Asset', 'Stock', 'Tax', 'Temporary']
      when 'Liability' then array['Chargeable', 'Current Liability', 'Stock Received But Not Billed', 'Tax', 'Temporary']
      when 'Equity' then array['Equity', 'Temporary']
      when 'Income' then array['Direct Income', 'Income Account', 'Indirect Income', 'Temporary']
      when 'Expense' then array[
        'Chargeable', 'Cost of Goods Sold', 'Direct Expense', 'Expense Account', 'Expenses Included In Valuation',
        'Indirect Expense', 'Round Off', 'Stock Adjustment', 'Tax', 'Temporary'
      ]
    end)
  ),
  -- A parent of the same system. NO ACTION, not RESTRICT: deleting a system removes the whole tree in one
  -- statement, which RESTRICT would refuse row by row.
  constraint accounts_parent_fk foreign key (parent_id, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.accounts enable row level security;
create index if not exists accounts_parent_idx on public.accounts (parent_id, merchant_id);


-- 2. Cost Centers.

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  cost_center_name text not null,
  cost_center_number text,
  -- Null only for the root: the company.
  parent_id uuid,
  is_group boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint cost_centers_id_merchant unique (id, merchant_id),
  constraint cost_centers_name_unique unique (merchant_id, cost_center_name),
  constraint cost_centers_number_unique unique (merchant_id, cost_center_number),
  constraint cost_centers_name_length check (length(btrim(cost_center_name)) between 1 and 140),
  constraint cost_centers_number_length check (cost_center_number is null or length(btrim(cost_center_number)) between 1 and 20),
  constraint cost_centers_parent_fk foreign key (parent_id, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.cost_centers enable row level security;
create index if not exists cost_centers_parent_idx on public.cost_centers (parent_id, merchant_id);

-- One root per system.
create unique index if not exists cost_centers_one_root on public.cost_centers (merchant_id) where parent_id is null;


-- 3. The tree rules (docs.frappe.io/erpnext/managing-tree-structure-masters): a parent is a group, a node is
-- never its own ancestor, a group keeps its group-ness while it has children, a root is a group; an account
-- takes its root type from its parent and keeps it while it has children. Security definer, as
-- validate_user_permission is: a User Permission with Hide Descendants hides children from their writer,
-- and the checks must see them anyway. Every read is held to the written row's own system.
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
      execute 'select is_group from public.cost_centers where id = $1 and merchant_id = $2'
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
    if tg_table_name = 'accounts' and new.root_type is distinct from old.root_type then
      raise exception 'root_type_locked' using errcode = '23514', detail = 'An account with accounts under it cannot move to another root type.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_tree() from public, anon, authenticated, service_role;

drop trigger if exists accounts_validate_tree on public.accounts;
create trigger accounts_validate_tree
  before insert or update or delete on public.accounts
  for each row execute function private.validate_tree();

drop trigger if exists cost_centers_validate_tree on public.cost_centers;
create trigger cost_centers_validate_tree
  before insert or update or delete on public.cost_centers
  for each row execute function private.validate_tree();


-- 4. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Account', 'accounts', 'tree', true),
  ('Cost Center', 'cost_centers', 'tree', true)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Accounts Manager', 'Account', true, true, true, true, true),
  ('Accounts User', 'Account', true, true, false, false, false),
  ('All', 'Account', true, false, false, false, false),
  ('Accounts Manager', 'Cost Center', true, true, true, true, true),
  ('Accounts User', 'Cost Center', true, true, false, false, false),
  ('All', 'Cost Center', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('accounts', 'Account');
select private.apply_doctype_policies('cost_centers', 'Cost Center');


-- 5. Seeding.

-- One account, found or made, for a re-runnable seed. Returns its id.
create or replace function private.seed_account(
  p_merchant uuid, p_name text, p_parent uuid, p_is_group boolean, p_root_type text, p_account_type text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.accounts (merchant_id, account_name, parent_id, is_group, root_type, account_type)
  values (p_merchant, p_name, p_parent, p_is_group, p_root_type, p_account_type)
  on conflict (merchant_id, account_name) do nothing
  returning id into v_id;

  if v_id is null then
    select a.id into v_id from public.accounts a where a.merchant_id = p_merchant and a.account_name = p_name;
  end if;
  return v_id;
end;
$$;

revoke execute on function private.seed_account(uuid, text, uuid, boolean, text, text) from public, anon, authenticated, service_role;

-- ERPNext's Standard chart, the part a POS posts to: Cash, Stock In Hand, Sales, Cost of Goods Sold, the tax
-- group, Write Off, Round Off, and the stock clearing accounts perpetual inventory needs.
create or replace function private.seed_chart_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_root uuid;
  v_group uuid;
  v_sub uuid;
  v_cc uuid;
begin
  v_root := private.seed_account(p_merchant, 'Application of Funds (Assets)', null, true, 'Asset', null);
  v_group := private.seed_account(p_merchant, 'Current Assets', v_root, true, 'Asset', null);
  perform private.seed_account(p_merchant, 'Bank Accounts', v_group, true, 'Asset', 'Bank');
  v_sub := private.seed_account(p_merchant, 'Cash In Hand', v_group, true, 'Asset', 'Cash');
  perform private.seed_account(p_merchant, 'Cash', v_sub, false, 'Asset', 'Cash');
  v_sub := private.seed_account(p_merchant, 'Stock Assets', v_group, true, 'Asset', 'Stock');
  perform private.seed_account(p_merchant, 'Stock In Hand', v_sub, false, 'Asset', 'Stock');
  perform private.seed_account(p_merchant, 'Tax Assets', v_group, true, 'Asset', null);
  v_group := private.seed_account(p_merchant, 'Temporary Accounts', v_root, true, 'Asset', null);
  perform private.seed_account(p_merchant, 'Temporary Opening', v_group, false, 'Asset', 'Temporary');

  v_root := private.seed_account(p_merchant, 'Source of Funds (Liabilities)', null, true, 'Liability', null);
  v_group := private.seed_account(p_merchant, 'Current Liabilities', v_root, true, 'Liability', null);
  perform private.seed_account(p_merchant, 'Duties and Taxes', v_group, true, 'Liability', 'Tax');
  v_sub := private.seed_account(p_merchant, 'Stock Liabilities', v_group, true, 'Liability', null);
  perform private.seed_account(p_merchant, 'Stock Received But Not Billed', v_sub, false, 'Liability', 'Stock Received But Not Billed');

  v_root := private.seed_account(p_merchant, 'Equity', null, true, 'Equity', null);
  perform private.seed_account(p_merchant, 'Capital Stock', v_root, false, 'Equity', 'Equity');
  perform private.seed_account(p_merchant, 'Opening Balance Equity', v_root, false, 'Equity', 'Equity');
  perform private.seed_account(p_merchant, 'Retained Earnings', v_root, false, 'Equity', 'Equity');

  v_root := private.seed_account(p_merchant, 'Income', null, true, 'Income', null);
  v_group := private.seed_account(p_merchant, 'Direct Income', v_root, true, 'Income', null);
  perform private.seed_account(p_merchant, 'Sales', v_group, false, 'Income', 'Income Account');
  perform private.seed_account(p_merchant, 'Indirect Income', v_root, true, 'Income', null);

  v_root := private.seed_account(p_merchant, 'Expenses', null, true, 'Expense', null);
  v_group := private.seed_account(p_merchant, 'Direct Expenses', v_root, true, 'Expense', null);
  v_sub := private.seed_account(p_merchant, 'Stock Expenses', v_group, true, 'Expense', null);
  perform private.seed_account(p_merchant, 'Cost of Goods Sold', v_sub, false, 'Expense', 'Cost of Goods Sold');
  perform private.seed_account(p_merchant, 'Expenses Included In Valuation', v_sub, false, 'Expense', 'Expenses Included In Valuation');
  perform private.seed_account(p_merchant, 'Stock Adjustment', v_sub, false, 'Expense', 'Stock Adjustment');
  v_group := private.seed_account(p_merchant, 'Indirect Expenses', v_root, true, 'Expense', null);
  perform private.seed_account(p_merchant, 'Write Off', v_group, false, 'Expense', null);
  perform private.seed_account(p_merchant, 'Round Off', v_group, false, 'Expense', 'Round Off');

  -- The company's cost center, named as the company is, with Main under it.
  insert into public.cost_centers (merchant_id, cost_center_name, is_group)
  select m.id, m.name, true from public.merchants m where m.id = p_merchant
  on conflict do nothing;
  select c.id into v_cc from public.cost_centers c where c.merchant_id = p_merchant and c.parent_id is null;
  insert into public.cost_centers (merchant_id, cost_center_name, parent_id, is_group)
  values (p_merchant, 'Main', v_cc, false)
  on conflict do nothing;
end;
$$;

revoke execute on function private.seed_chart_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_accounting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_chart_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_accounting() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_40_accounting on public.merchants;
create trigger merchants_seed_40_accounting
  after insert on public.merchants
  for each row execute function private.seed_accounting();

-- The systems that already exist.
select private.seed_chart_for(m.id) from public.merchants m;
