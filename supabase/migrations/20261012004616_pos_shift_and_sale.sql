-- Step 18 of the POS batch, on ERPNext's model: the cashier's shift and the sale
-- (.claude/erpnext-docs/POS-System-Added-Features.md 18.1–18.5; docs.frappe.io/erpnext/pos-workflows,
-- /point-of-sale, /sales-invoice).
--
-- 1. Naming: POS Opening Entry and POS Closing Entry join Document Naming Settings.
-- 2. pos_opening_entries (+ balances): a cashier's session on a POS Profile, with the opening amount per
--    mode of payment. One open session per cashier and profile.
-- 3. pos_invoices (+ items, taxes, payments): the submitted sale.
-- 4. pos_closing_entries (+ payments): the end of the session — per mode the opening, expected and counted
--    amount and the difference.
-- 5. The posters public.submit_document() dispatches to: private.submit_pos_opening_entries(),
--    submit_pos_invoices(), submit_pos_closing_entries().
-- 6. public.open_pos_session(), pos_checkout(), close_pos_session(): security invoker — the caller's own
--    policies decide every row, then the document is submitted in the same transaction.
-- 7. Doctypes, permissions, policies.
--
-- The app calculates, the database checks (the human's decision, 2026-10-11): the cart's prices, taxes and
-- totals come from the app's one engine (src/features/pos-invoices/cart.ts), and the poster refuses what it
-- can check without a second one — the session, the items and their units, each line's amount, that the
-- totals add up, what was paid — then posts what only it knows: the name, the valuation, Cost of Goods Sold
-- and the ledger rows.
--
-- Out of scope, so absent: Customer, held (draft) sales, partial payment, loyalty, POS Invoice
-- Consolidation — every sale posts at once. Returns and voids are Step 19, discounts Step 20. Re-runnable,
-- like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Naming series (20261010064803_naming_series.sql). ERPNext ships POS-OPE-.YYYY.- and POS-CLE-.YYYY.-;
-- the POS Invoice has had ACC-PSINV-.YYYY.- since that migration.

alter table public.naming_series drop constraint if exists naming_series_document_type;
alter table public.naming_series add constraint naming_series_document_type
  check (document_type in (
    'POS Invoice', 'Sales Invoice', 'Item', 'Stock Reconciliation', 'Stock Entry', 'POS Opening Entry', 'POS Closing Entry'
  ));

-- merchants_seed_94_naming calls this for every new system.
create or replace function private.seed_naming_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.naming_series (merchant_id, document_type, options)
  values
    (p_merchant, 'POS Invoice', array['ACC-PSINV-.YYYY.-']),
    (p_merchant, 'Sales Invoice', array['ACC-SINV-.YYYY.-']),
    (p_merchant, 'Item', array['STO-ITEM-.YYYY.-']),
    (p_merchant, 'Stock Reconciliation', array['MAT-RECO-.YYYY.-']),
    (p_merchant, 'Stock Entry', array['MAT-STE-.YYYY.-']),
    (p_merchant, 'POS Opening Entry', array['POS-OPE-.YYYY.-']),
    (p_merchant, 'POS Closing Entry', array['POS-CLE-.YYYY.-'])
  on conflict (merchant_id, document_type) do nothing;
$$;

-- The systems that already exist.
select private.seed_naming_for(m.id) from public.merchants m;


-- 2. POS Opening Entry (18.1): "Before selling, open a session with an Opening Entry. This sets the session
-- start and can capture opening cash." user_id is the cashier — no foreign key to auth.users, so deleting an
-- account neither fails on its sessions nor takes a shop's records with it.

create table if not exists public.pos_opening_entries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  posting_date date not null,
  pos_profile_id uuid not null,
  user_id uuid not null default auth.uid(),
  period_start timestamptz not null default now(),
  -- Open until its POS Closing Entry is submitted.
  status text not null default 'Open',
  docstatus smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint pos_opening_entries_id_merchant unique (id, merchant_id),
  constraint pos_opening_entries_name_unique unique (merchant_id, name),
  constraint pos_opening_entries_status check (status in ('Open', 'Closed')),
  constraint pos_opening_entries_docstatus check (docstatus in (0, 1, 2)),
  constraint pos_opening_entries_profile_fk foreign key (pos_profile_id, merchant_id) references public.pos_profiles (id, merchant_id)
);

alter table public.pos_opening_entries enable row level security;
create index if not exists pos_opening_entries_profile_idx on public.pos_opening_entries (pos_profile_id, merchant_id);
create index if not exists pos_opening_entries_user_idx on public.pos_opening_entries (user_id);
-- "One open session per cashier and profile": a second one fails with 23505.
create unique index if not exists pos_opening_entries_one_open
  on public.pos_opening_entries (pos_profile_id, user_id) where docstatus = 1 and status = 'Open';

drop trigger if exists pos_opening_entries_name on public.pos_opening_entries;
create trigger pos_opening_entries_name
  before insert on public.pos_opening_entries
  for each row execute function private.name_document('POS Opening Entry');

create table if not exists public.pos_opening_entry_balances (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_opening_entry_id uuid not null,
  idx integer not null,
  mode_of_payment_id uuid not null,
  opening_amount numeric not null default 0,

  constraint pos_opening_entry_balances_unique unique (pos_opening_entry_id, mode_of_payment_id),
  constraint pos_opening_entry_balances_amount check (opening_amount >= 0),
  constraint pos_opening_entry_balances_parent_fk foreign key (pos_opening_entry_id, merchant_id)
    references public.pos_opening_entries (id, merchant_id) on delete cascade,
  constraint pos_opening_entry_balances_mode_fk foreign key (mode_of_payment_id, merchant_id) references public.modes_of_payment (id, merchant_id)
);

alter table public.pos_opening_entry_balances enable row level security;
create index if not exists pos_opening_entry_balances_mode_idx on public.pos_opening_entry_balances (mode_of_payment_id, merchant_id);


-- 3. POS Invoice (18.3). The app sends what it calculated; the poster fills what only the database knows —
-- the date, the warehouse, the price list and tax category of the profile, and on each line its name as
-- sold, the accounts it posted to and the valuation it left at.

create table if not exists public.pos_invoices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  posting_date date not null,
  pos_profile_id uuid not null,
  pos_opening_entry_id uuid not null,
  user_id uuid not null default auth.uid(),
  warehouse uuid,
  selling_price_list uuid,
  -- The Sales Taxes and Charges Template the cart applied; its rows as applied are pos_invoice_taxes.
  taxes_and_charges uuid,
  tax_category uuid,
  net_total numeric not null default 0,
  total_taxes_and_charges numeric not null default 0,
  grand_total numeric not null default 0,
  -- Rounded Total less Grand Total (Global Defaults: Disable Rounded Total leaves it 0).
  rounding_adjustment numeric not null default 0,
  rounded_total numeric not null default 0,
  paid_amount numeric not null default 0,
  change_amount numeric not null default 0,
  write_off_amount numeric not null default 0,
  docstatus smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint pos_invoices_id_merchant unique (id, merchant_id),
  constraint pos_invoices_name_unique unique (merchant_id, name),
  constraint pos_invoices_docstatus check (docstatus in (0, 1, 2)),
  constraint pos_invoices_profile_fk foreign key (pos_profile_id, merchant_id) references public.pos_profiles (id, merchant_id),
  constraint pos_invoices_session_fk foreign key (pos_opening_entry_id, merchant_id) references public.pos_opening_entries (id, merchant_id),
  constraint pos_invoices_warehouse_fk foreign key (warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint pos_invoices_price_list_fk foreign key (selling_price_list, merchant_id) references public.price_lists (id, merchant_id),
  constraint pos_invoices_template_fk foreign key (taxes_and_charges, merchant_id) references public.sales_tax_templates (id, merchant_id),
  constraint pos_invoices_tax_category_fk foreign key (tax_category, merchant_id) references public.tax_categories (id, merchant_id)
);

alter table public.pos_invoices enable row level security;
create index if not exists pos_invoices_profile_idx on public.pos_invoices (pos_profile_id, merchant_id);
create index if not exists pos_invoices_session_idx on public.pos_invoices (pos_opening_entry_id, merchant_id);
create index if not exists pos_invoices_warehouse_idx on public.pos_invoices (warehouse, merchant_id);
create index if not exists pos_invoices_price_list_idx on public.pos_invoices (selling_price_list, merchant_id);
create index if not exists pos_invoices_template_idx on public.pos_invoices (taxes_and_charges, merchant_id);
create index if not exists pos_invoices_tax_category_idx on public.pos_invoices (tax_category, merchant_id);
-- Orders and the dashboard read the newest first.
create index if not exists pos_invoices_date_idx on public.pos_invoices (merchant_id, posting_date desc, created_at desc);

drop trigger if exists pos_invoices_name on public.pos_invoices;
create trigger pos_invoices_name
  before insert on public.pos_invoices
  for each row execute function private.name_document('POS Invoice');

create table if not exists public.pos_invoice_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_invoice_id uuid not null,
  idx integer not null,
  item_id uuid not null,
  -- The item's name on the day it was sold, written on submit: a receipt reopened later prints it.
  item_name text,
  qty numeric not null,
  uom_id uuid not null,
  -- Stock units in one of the unit sold in; stock_qty is what leaves the warehouse.
  conversion_factor numeric not null default 1,
  stock_qty numeric not null,
  price_list_rate numeric not null default 0,
  -- As entered: tax-inclusive when an inclusive tax row applies. net_rate and net_amount leave that tax out.
  rate numeric not null,
  amount numeric not null,
  net_rate numeric not null,
  net_amount numeric not null,
  item_tax_template_id uuid,
  -- Written on submit: where the line posted, and the valuation per stock unit it left at.
  income_account uuid,
  expense_account uuid,
  cost_center uuid,
  valuation_rate numeric,

  constraint pos_invoice_items_qty check (qty > 0 and stock_qty > 0 and conversion_factor > 0),
  constraint pos_invoice_items_rate check (rate >= 0 and price_list_rate >= 0),
  constraint pos_invoice_items_parent_fk foreign key (pos_invoice_id, merchant_id) references public.pos_invoices (id, merchant_id) on delete cascade,
  constraint pos_invoice_items_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id),
  constraint pos_invoice_items_uom_fk foreign key (uom_id, merchant_id) references public.uoms (id, merchant_id),
  constraint pos_invoice_items_template_fk foreign key (item_tax_template_id, merchant_id) references public.item_tax_templates (id, merchant_id),
  constraint pos_invoice_items_income_fk foreign key (income_account, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_invoice_items_expense_fk foreign key (expense_account, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_invoice_items_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.pos_invoice_items enable row level security;
create index if not exists pos_invoice_items_parent_idx on public.pos_invoice_items (pos_invoice_id, merchant_id);
create index if not exists pos_invoice_items_item_idx on public.pos_invoice_items (item_id, merchant_id);
create index if not exists pos_invoice_items_uom_idx on public.pos_invoice_items (uom_id, merchant_id);
create index if not exists pos_invoice_items_template_idx on public.pos_invoice_items (item_tax_template_id, merchant_id);
create index if not exists pos_invoice_items_income_idx on public.pos_invoice_items (income_account, merchant_id);
create index if not exists pos_invoice_items_expense_idx on public.pos_invoice_items (expense_account, merchant_id);
create index if not exists pos_invoice_items_cost_center_idx on public.pos_invoice_items (cost_center, merchant_id);

-- The tax rows as the sale applied them: a template edited afterwards changes no receipt.
create table if not exists public.pos_invoice_taxes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_invoice_id uuid not null,
  idx integer not null,
  charge_type text not null,
  account_head uuid not null,
  description text not null,
  rate numeric not null default 0,
  row_id integer,
  included_in_print_rate boolean not null default false,
  cost_center uuid,
  tax_amount numeric not null default 0,
  -- The running total after this row.
  total numeric not null default 0,

  constraint pos_invoice_taxes_charge_type
    check (charge_type in ('On Net Total', 'Actual', 'On Previous Row Amount', 'On Previous Row Total', 'On Item Quantity')),
  constraint pos_invoice_taxes_parent_fk foreign key (pos_invoice_id, merchant_id) references public.pos_invoices (id, merchant_id) on delete cascade,
  constraint pos_invoice_taxes_account_fk foreign key (account_head, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_invoice_taxes_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.pos_invoice_taxes enable row level security;
create index if not exists pos_invoice_taxes_parent_idx on public.pos_invoice_taxes (pos_invoice_id, merchant_id);
create index if not exists pos_invoice_taxes_account_idx on public.pos_invoice_taxes (account_head, merchant_id);
create index if not exists pos_invoice_taxes_cost_center_idx on public.pos_invoice_taxes (cost_center, merchant_id);

-- What the customer handed over, per mode; the change is the invoice's change_amount.
create table if not exists public.pos_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_invoice_id uuid not null,
  idx integer not null,
  mode_of_payment_id uuid not null,
  amount numeric not null,
  -- Written on submit: the mode's account that day.
  account uuid,

  constraint pos_invoice_payments_amount check (amount > 0),
  constraint pos_invoice_payments_parent_fk foreign key (pos_invoice_id, merchant_id) references public.pos_invoices (id, merchant_id) on delete cascade,
  constraint pos_invoice_payments_mode_fk foreign key (mode_of_payment_id, merchant_id) references public.modes_of_payment (id, merchant_id),
  constraint pos_invoice_payments_account_fk foreign key (account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.pos_invoice_payments enable row level security;
create index if not exists pos_invoice_payments_parent_idx on public.pos_invoice_payments (pos_invoice_id, merchant_id);
create index if not exists pos_invoice_payments_mode_idx on public.pos_invoice_payments (mode_of_payment_id, merchant_id);
create index if not exists pos_invoice_payments_account_idx on public.pos_invoice_payments (account, merchant_id);


-- 4. POS Closing Entry (18.5). The session's invoices are read through pos_invoices.pos_opening_entry_id,
-- not copied into a child table.

create table if not exists public.pos_closing_entries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  posting_date date not null,
  pos_opening_entry_id uuid not null,
  -- Who closed it: the cashier, or a manager closing a session left open.
  user_id uuid not null default auth.uid(),
  period_end timestamptz not null default now(),
  -- Written on submit, from the session's submitted invoices.
  grand_total numeric not null default 0,
  net_total numeric not null default 0,
  total_quantity numeric not null default 0,
  docstatus smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint pos_closing_entries_id_merchant unique (id, merchant_id),
  constraint pos_closing_entries_name_unique unique (merchant_id, name),
  constraint pos_closing_entries_docstatus check (docstatus in (0, 1, 2)),
  constraint pos_closing_entries_session_fk foreign key (pos_opening_entry_id, merchant_id) references public.pos_opening_entries (id, merchant_id)
);

alter table public.pos_closing_entries enable row level security;
create index if not exists pos_closing_entries_session_idx on public.pos_closing_entries (pos_opening_entry_id, merchant_id);
-- A session is closed once.
create unique index if not exists pos_closing_entries_one_per_session on public.pos_closing_entries (pos_opening_entry_id) where docstatus = 1;

drop trigger if exists pos_closing_entries_name on public.pos_closing_entries;
create trigger pos_closing_entries_name
  before insert on public.pos_closing_entries
  for each row execute function private.name_document('POS Closing Entry');

create table if not exists public.pos_closing_entry_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_closing_entry_id uuid not null,
  idx integer not null,
  mode_of_payment_id uuid not null,
  -- Counted by the cashier. The other three are written on submit.
  closing_amount numeric not null default 0,
  opening_amount numeric not null default 0,
  expected_amount numeric not null default 0,
  difference numeric not null default 0,

  constraint pos_closing_entry_payments_unique unique (pos_closing_entry_id, mode_of_payment_id),
  constraint pos_closing_entry_payments_amount check (closing_amount >= 0),
  constraint pos_closing_entry_payments_parent_fk foreign key (pos_closing_entry_id, merchant_id)
    references public.pos_closing_entries (id, merchant_id) on delete cascade,
  constraint pos_closing_entry_payments_mode_fk foreign key (mode_of_payment_id, merchant_id) references public.modes_of_payment (id, merchant_id)
);

alter table public.pos_closing_entry_payments enable row level security;
create index if not exists pos_closing_entry_payments_mode_idx on public.pos_closing_entry_payments (mode_of_payment_id, merchant_id);

-- A session is closed, not voided: public.cancel_document() would leave its sales without one.
create or replace function private.keep_pos_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.docstatus = 2 then
    raise exception 'not_cancellable' using errcode = '23514', detail = 'A POS session is closed with a POS Closing Entry, not cancelled.';
  end if;
  return new;
end;
$$;

revoke execute on function private.keep_pos_entry() from public, anon, authenticated, service_role;

drop trigger if exists pos_opening_entries_keep on public.pos_opening_entries;
create trigger pos_opening_entries_keep
  before update of docstatus on public.pos_opening_entries
  for each row execute function private.keep_pos_entry();

drop trigger if exists pos_closing_entries_keep on public.pos_closing_entries;
create trigger pos_closing_entries_keep
  before update of docstatus on public.pos_closing_entries
  for each row execute function private.keep_pos_entry();


-- 5. The posters. Called only by public.submit_document(), which has checked the caller's Submit permission
-- and locked the draft. Security definer, search_path pinned, out of every role's reach; each still holds
-- the caller to their own session ((select auth.uid())).

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
        where u.pos_profile_id = p.id and mm.user_id = (select auth.uid()) and mm.enabled
      )
    )
    from public.pos_profiles p
    join public.merchants m on m.id = p.merchant_id
    where p.id = p_profile
  ), false);
$$;

revoke execute on function private.pos_profile_usable(uuid) from public, anon, authenticated, service_role;

create or replace function private.submit_pos_opening_entries(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.pos_opening_entries;
begin
  select * into v_doc from public.pos_opening_entries d where d.id = p_id;

  if v_doc.user_id is distinct from (select auth.uid()) then
    raise exception 'not_your_session' using errcode = '42501', detail = 'A session is opened by its own cashier.';
  end if;
  if not private.pos_profile_usable(v_doc.pos_profile_id) then
    raise exception 'pos_profile_unusable' using errcode = '23514', detail = 'The POS Profile is disabled, or not applicable for this user.';
  end if;

  if exists (
    select 1 from public.pos_opening_entry_balances b
    where b.pos_opening_entry_id = p_id and not exists (
      select 1 from public.pos_profile_payments pp
      where pp.pos_profile_id = v_doc.pos_profile_id and pp.mode_of_payment_id = b.mode_of_payment_id
    )
  ) then
    raise exception 'payment_method_not_offered' using errcode = '23514', detail = 'An opening amount names a mode of payment the POS Profile does not offer.';
  end if;

  -- The day the database posts by, whatever the device's clock says.
  update public.pos_opening_entries set posting_date = private.merchant_today(v_doc.merchant_id), period_start = now() where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_opening_entries(uuid) from public, anon, authenticated, service_role;

-- The sale. ponytail: the tax amounts, each line's net amount and its Price List Rate are trusted from the
-- app — the invoice stores the template and its rows as applied, so a query can re-run them. Upgrade path:
-- port taxes_and_totals and the price lookup to SQL.
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
  v_row record;
  v_today date;
  -- One unit of the currency's smallest decimal: what two roundings of the same figure may differ by.
  v_unit numeric;
  v_price_list uuid;
  v_auto_price boolean;
  v_inventory uuid;
  v_income uuid;
  v_expense uuid;
  v_center uuid;
  v_cost numeric;
  v_rows integer := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_paid numeric := 0;
  v_change numeric;
  v_write_off numeric;
  v_gl jsonb := '[]'::jsonb;
begin
  select * into v_doc from public.pos_invoices d where d.id = p_id;
  select * into v_profile from public.pos_profiles p where p.id = v_doc.pos_profile_id;
  select * into v_company from public.merchants m where m.id = v_doc.merchant_id;
  select * into v_session from public.pos_opening_entries s where s.id = v_doc.pos_opening_entry_id;
  v_today := private.merchant_today(v_doc.merchant_id);
  select 1 / power(10::numeric, coalesce(s.currency_precision, 2)) into v_unit from public.system_settings s where s.merchant_id = v_doc.merchant_id;
  v_unit := coalesce(v_unit, 0.01);

  -- "No sale without an open session": the caller's own, on this profile.
  if v_doc.user_id is distinct from (select auth.uid())
    or v_session.docstatus is distinct from 1 or v_session.status is distinct from 'Open'
    or v_session.user_id is distinct from (select auth.uid())
    or v_session.pos_profile_id is distinct from v_doc.pos_profile_id then
    raise exception 'no_open_session' using errcode = '23514', detail = 'A sale needs the cashier''s own open session on that POS Profile.';
  end if;
  if not private.pos_profile_usable(v_doc.pos_profile_id) then
    raise exception 'pos_profile_unusable' using errcode = '23514', detail = 'The POS Profile is disabled, or not applicable for this user.';
  end if;

  select coalesce(v_profile.selling_price_list, s.default_price_list) into v_price_list
  from public.selling_settings s where s.merchant_id = v_doc.merchant_id;
  select coalesce(s.auto_insert_price_list_rate_if_missing, false) into v_auto_price
  from public.stock_settings s where s.merchant_id = v_doc.merchant_id;

  if v_company.enable_perpetual_inventory then
    v_inventory := private.warehouse_account(v_profile.warehouse);
  end if;

  for v_row in
    select
      r.*, i.item_name as current_name, i.disabled, i.is_stock_item, i.stock_uom,
      -- 13.3: POS Profile → Item → Item Group → Brand → Company.
      coalesce(v_profile.income_account, i.income_account, g.income_account, b.income_account, v_company.default_income_account) as income,
      coalesce(v_profile.expense_account, i.expense_account, g.expense_account, v_company.default_expense_account) as expense,
      coalesce(v_profile.cost_center, i.selling_cost_center, g.selling_cost_center, b.selling_cost_center, v_company.cost_center) as center,
      (select u.conversion_factor from public.item_uoms u where u.item_id = i.id and u.uom_id = r.uom_id) as unit_factor
    from public.pos_invoice_items r
    join public.items i on i.id = r.item_id
    join public.item_groups g on g.id = i.item_group_id
    left join public.brands b on b.id = i.brand_id
    where r.pos_invoice_id = p_id
    order by r.idx
  loop
    v_rows := v_rows + 1;

    if v_row.disabled then
      raise exception 'item_unusable' using errcode = '23514', detail = 'A disabled item cannot be sold.';
    end if;
    -- 13.4: sold in the stock unit, or in one of the item's units at its conversion factor.
    if v_row.conversion_factor is distinct from (case when v_row.uom_id = v_row.stock_uom then 1 else v_row.unit_factor end)
      or v_row.stock_qty <> v_row.qty * v_row.conversion_factor then
      raise exception 'uom_not_on_item' using errcode = '23514', detail = 'A line is sold in a unit its item does not have, or at another conversion factor.';
    end if;
    if not v_profile.allow_rate_change and v_row.rate <> v_row.price_list_rate then
      raise exception 'rate_locked' using errcode = '23514', detail = 'This POS Profile does not allow a line''s rate to be changed.';
    end if;
    if abs(v_row.amount - v_row.qty * v_row.rate) > v_unit or v_row.net_amount < 0 or v_row.net_amount > v_row.amount + v_unit then
      raise exception 'totals_mismatch' using errcode = '23514', detail = 'A line''s amount is not its quantity times its rate.';
    end if;

    v_net := v_net + v_row.net_amount;
    v_income := v_row.income;
    v_center := v_row.center;
    v_expense := null;
    v_cost := null;
    v_gl := v_gl || jsonb_build_object('account_id', v_income, 'amount', -v_row.net_amount, 'cost_center_id', v_center);

    -- "Posts at once: stock out and Cost of Goods Sold." A service moves no stock. Negative stock, a
    -- fraction in a whole-number unit and a backdated posting are the engine's to refuse.
    if v_row.is_stock_item then
      v_cost := -private.post_sle(
        v_doc.merchant_id, 'POS Invoice', p_id, v_doc.name, v_today, v_row.item_id, v_profile.warehouse, -v_row.stock_qty
      );
      if v_company.enable_perpetual_inventory then
        if v_inventory is null then
          raise exception 'no_inventory_account' using errcode = '23514',
            detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
        end if;
        v_expense := v_row.expense;
        v_gl := v_gl
          || jsonb_build_object('account_id', v_expense, 'amount', v_cost, 'cost_center_id', v_center)
          || jsonb_build_object('account_id', v_inventory, 'amount', -v_cost);
      end if;
    end if;

    update public.pos_invoice_items r set
      item_name = v_row.current_name, income_account = v_income, expense_account = v_expense, cost_center = v_center,
      valuation_rate = v_cost / v_row.stock_qty
    where r.id = v_row.id;

    -- 14.1, Stock Settings' Auto Insert Price List Rate if Missing: the item's first sale in this unit
    -- writes its rate into the sale's price list.
    if v_auto_price and v_row.price_list_rate > 0
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

  for v_row in select t.* from public.pos_invoice_taxes t where t.pos_invoice_id = p_id order by t.idx loop
    v_tax := v_tax + v_row.tax_amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.account_head, 'amount', -v_row.tax_amount, 'cost_center_id', v_row.cost_center);
  end loop;

  -- The totals add up. An inclusive tax can leave the grand total a few units off net + tax (the entered
  -- prices are kept); the Rounded Total is the grand total at the currency's smallest coin, or itself.
  if abs(v_doc.net_total - v_net) > v_unit or abs(v_doc.total_taxes_and_charges - v_tax) > v_unit
    or abs(v_doc.grand_total - v_net - v_tax) > 5 * v_unit
    or abs(v_doc.rounding_adjustment - (v_doc.rounded_total - v_doc.grand_total)) > v_unit
    or abs(v_doc.rounding_adjustment) > greatest(1, coalesce((
      select c.smallest_currency_fraction_value from public.currencies c
      where c.merchant_id = v_doc.merchant_id and c.code = v_company.default_currency
    ), 0)) then
    raise exception 'totals_mismatch' using errcode = '23514', detail = 'The sale''s totals do not add up.';
  end if;

  -- "Only the modes set here will be available when using POS."
  for v_row in
    select r.id, r.amount, m.default_account, pp.id as offered
    from public.pos_invoice_payments r
    join public.modes_of_payment m on m.id = r.mode_of_payment_id
    left join public.pos_profile_payments pp on pp.pos_profile_id = v_doc.pos_profile_id and pp.mode_of_payment_id = r.mode_of_payment_id
    where r.pos_invoice_id = p_id
  loop
    if v_row.offered is null then
      raise exception 'payment_method_not_offered' using errcode = '23514', detail = 'The POS Profile does not offer that mode of payment.';
    end if;
    v_paid := v_paid + v_row.amount;
    v_gl := v_gl || jsonb_build_object('account_id', v_row.default_account, 'amount', v_row.amount);
    update public.pos_invoice_payments r set account = v_row.default_account where r.id = v_row.id;
  end loop;

  -- "Paid in full, change returned, a small difference written off within the limit."
  v_change := greatest(v_paid - v_doc.rounded_total, 0);
  v_write_off := greatest(v_doc.rounded_total - v_paid, 0);
  if v_write_off > v_profile.write_off_limit then
    raise exception 'underpaid' using errcode = '23514', detail = 'The payments do not cover the total, and the shortfall is over the Write Off Limit.';
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
    posting_date = v_today, warehouse = v_profile.warehouse, selling_price_list = v_price_list, tax_category = v_profile.tax_category
  where id = p_id;
end;
$$;

revoke execute on function private.submit_pos_invoices(uuid) from public, anon, authenticated, service_role;

-- "Ends the session: lists its POS Invoices and totals; per mode of payment shows opening, expected and
-- counted amount and the difference. Sales already posted, so it posts nothing."
create or replace function private.submit_pos_closing_entries(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.pos_closing_entries;
  v_session public.pos_opening_entries;
begin
  select * into v_doc from public.pos_closing_entries d where d.id = p_id;
  select * into v_session from public.pos_opening_entries s where s.id = v_doc.pos_opening_entry_id for update;

  if v_session.docstatus is distinct from 1 or v_session.status is distinct from 'Open' then
    raise exception 'session_not_open' using errcode = '23514', detail = 'That session is not open.';
  end if;
  -- Its cashier; or whoever may cancel a POS Opening Entry, for a session left open.
  if v_session.user_id is distinct from (select auth.uid())
    and v_session.merchant_id not in (select private.permitted_merchant_ids('POS Opening Entry', 'cancel')) then
    raise exception 'not_your_session' using errcode = '42501', detail = 'A session is closed by its cashier, or by a manager.';
  end if;

  -- Every mode the session touched or the profile offers gets a row; a mode nobody counted counts as 0.
  -- ponytail: change is taken off the invoice's first Cash-type payment, else its first payment — a change
  -- mode column on the invoice if a shop ever hands change out of another till.
  with sales as (
    select i.id, i.change_amount from public.pos_invoices i where i.pos_opening_entry_id = v_session.id and i.docstatus = 1
  ),
  paid as (
    select p.mode_of_payment_id as mode, sum(p.amount) as amount
    from public.pos_invoice_payments p join sales s on s.id = p.pos_invoice_id
    group by 1
  ),
  change as (
    select (
      select p.mode_of_payment_id
      from public.pos_invoice_payments p join public.modes_of_payment m on m.id = p.mode_of_payment_id
      where p.pos_invoice_id = s.id
      order by (m.type = 'Cash') desc, p.idx
      limit 1
    ) as mode, sum(s.change_amount) as amount
    from sales s where s.change_amount > 0
    group by 1
  ),
  opening as (
    select b.mode_of_payment_id as mode, b.opening_amount as amount
    from public.pos_opening_entry_balances b where b.pos_opening_entry_id = v_session.id
  ),
  modes as (
    select mode from paid union select mode from change where mode is not null union select mode from opening
    union select pp.mode_of_payment_id from public.pos_profile_payments pp where pp.pos_profile_id = v_session.pos_profile_id
  )
  insert into public.pos_closing_entry_payments as t
    (merchant_id, pos_closing_entry_id, idx, mode_of_payment_id, closing_amount, opening_amount, expected_amount, difference)
  select
    v_doc.merchant_id, p_id, 1000 + row_number() over (), m.mode, 0, coalesce(o.amount, 0),
    coalesce(o.amount, 0) + coalesce(p.amount, 0) - coalesce(c.amount, 0),
    -(coalesce(o.amount, 0) + coalesce(p.amount, 0) - coalesce(c.amount, 0))
  from modes m
  left join opening o on o.mode = m.mode
  left join paid p on p.mode = m.mode
  left join change c on c.mode = m.mode
  on conflict (pos_closing_entry_id, mode_of_payment_id) do update set
    opening_amount = excluded.opening_amount,
    expected_amount = excluded.expected_amount,
    difference = t.closing_amount - excluded.expected_amount;

  update public.pos_closing_entries set
    posting_date = private.merchant_today(v_doc.merchant_id),
    period_end = now(),
    grand_total = coalesce((select sum(i.grand_total) from public.pos_invoices i where i.pos_opening_entry_id = v_session.id and i.docstatus = 1), 0),
    net_total = coalesce((select sum(i.net_total) from public.pos_invoices i where i.pos_opening_entry_id = v_session.id and i.docstatus = 1), 0),
    total_quantity = coalesce((
      select sum(r.qty) from public.pos_invoice_items r
      join public.pos_invoices i on i.id = r.pos_invoice_id
      where i.pos_opening_entry_id = v_session.id and i.docstatus = 1
    ), 0)
  where id = p_id;

  update public.pos_opening_entries set status = 'Closed' where id = v_session.id;
end;
$$;

revoke execute on function private.submit_pos_closing_entries(uuid) from public, anon, authenticated, service_role;


-- 6. The three calls the register makes. Security invoker, like public.save_item_with_opening_stock: the
-- caller's own policies decide every row written (Create on the document, Write for its rows), and
-- public.submit_document() checks Submit — all in one transaction, so a refused sale leaves no draft and
-- uses no number. Rejected: a definer RPC per document — a second copy of submit_document's lock,
-- (select auth.uid()) and permission check, each one more definer function PostgREST serves.

create or replace function public.open_pos_session(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  insert into public.pos_opening_entries (merchant_id, posting_date, pos_profile_id)
  values (v_merchant, private.merchant_today(v_merchant), (payload ->> 'pos_profile_id')::uuid)
  returning id into v_id;

  insert into public.pos_opening_entry_balances (merchant_id, pos_opening_entry_id, idx, mode_of_payment_id, opening_amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, coalesce(t.opening_amount, 0)
  from jsonb_populate_recordset(null::public.pos_opening_entry_balances, coalesce(payload -> 'balances', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Opening Entry', v_id);
  return v_id;
end;
$$;

revoke execute on function public.open_pos_session(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.open_pos_session(jsonb) to authenticated;

create or replace function public.pos_checkout(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_doc public.pos_invoices := jsonb_populate_record(null::public.pos_invoices, payload);
begin
  insert into public.pos_invoices (
    merchant_id, posting_date, pos_profile_id, pos_opening_entry_id, taxes_and_charges, net_total, total_taxes_and_charges,
    grand_total, rounding_adjustment, rounded_total, paid_amount, change_amount, write_off_amount
  )
  values (
    v_merchant, private.merchant_today(v_merchant), v_doc.pos_profile_id, v_doc.pos_opening_entry_id, v_doc.taxes_and_charges,
    coalesce(v_doc.net_total, 0), coalesce(v_doc.total_taxes_and_charges, 0), coalesce(v_doc.grand_total, 0),
    coalesce(v_doc.rounding_adjustment, 0), coalesce(v_doc.rounded_total, 0), coalesce(v_doc.paid_amount, 0),
    coalesce(v_doc.change_amount, 0), coalesce(v_doc.write_off_amount, 0)
  )
  returning id into v_id;

  insert into public.pos_invoice_items (
    merchant_id, pos_invoice_id, idx, item_id, qty, uom_id, conversion_factor, stock_qty, price_list_rate, rate, amount,
    net_rate, net_amount, item_tax_template_id
  )
  select
    v_merchant, v_id, t.ordinality, t.item_id, t.qty, t.uom_id, t.conversion_factor, t.stock_qty, coalesce(t.price_list_rate, 0),
    t.rate, t.amount, t.net_rate, t.net_amount, t.item_tax_template_id
  from jsonb_populate_recordset(null::public.pos_invoice_items, coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_taxes (
    merchant_id, pos_invoice_id, idx, charge_type, account_head, description, rate, row_id, included_in_print_rate, cost_center,
    tax_amount, total
  )
  select
    v_merchant, v_id, t.ordinality, t.charge_type, t.account_head, t.description, coalesce(t.rate, 0), t.row_id,
    coalesce(t.included_in_print_rate, false), t.cost_center, coalesce(t.tax_amount, 0), coalesce(t.total, 0)
  from jsonb_populate_recordset(null::public.pos_invoice_taxes, coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_payments (merchant_id, pos_invoice_id, idx, mode_of_payment_id, amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, t.amount
  from jsonb_populate_recordset(null::public.pos_invoice_payments, coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Invoice', v_id);
  return v_id;
end;
$$;

revoke execute on function public.pos_checkout(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pos_checkout(jsonb) to authenticated;

create or replace function public.close_pos_session(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  insert into public.pos_closing_entries (merchant_id, posting_date, pos_opening_entry_id)
  values (v_merchant, private.merchant_today(v_merchant), (payload ->> 'pos_opening_entry_id')::uuid)
  returning id into v_id;

  insert into public.pos_closing_entry_payments (merchant_id, pos_closing_entry_id, idx, mode_of_payment_id, closing_amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, coalesce(t.closing_amount, 0)
  from jsonb_populate_recordset(null::public.pos_closing_entry_payments, coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Closing Entry', v_id);
  return v_id;
end;
$$;

revoke execute on function public.close_pos_session(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.close_pos_session(jsonb) to authenticated;


-- 7. Doctypes, permissions, policies (CLAUDE.md §6.7). A cashier is a Sales User: Create and Submit on the
-- three documents, and Write, which a document's rows are written under. Cancelling a sale is the
-- managers'. Accounts Settings becomes readable by every member: the cart reads "Taxes from Item Tax
-- Templates".

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('POS Opening Entry', 'pos_opening_entries', 'document', false),
  ('POS Invoice', 'pos_invoices', 'document', false),
  ('POS Closing Entry', 'pos_closing_entries', 'document', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete, can_submit, can_cancel)
values
  ('Sales User', 'POS Opening Entry', true, true, true, true, false, true, false),
  ('Sales Manager', 'POS Opening Entry', true, true, true, true, true, true, true),
  ('Accounts Manager', 'POS Opening Entry', true, true, false, false, false, false, false),

  ('Sales User', 'POS Invoice', true, true, true, true, false, true, false),
  ('Sales Manager', 'POS Invoice', true, true, true, true, true, true, true),
  ('Accounts Manager', 'POS Invoice', true, true, true, true, true, true, true),
  ('Accounts User', 'POS Invoice', true, true, false, false, false, false, false),

  ('Sales User', 'POS Closing Entry', true, true, true, true, false, true, false),
  ('Sales Manager', 'POS Closing Entry', true, true, true, true, true, true, true),
  ('Accounts Manager', 'POS Closing Entry', true, true, false, false, false, false, false),

  ('All', 'Accounts Settings', true, true, false, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('pos_opening_entries', 'POS Opening Entry');
select private.apply_doctype_policies('pos_opening_entry_balances', 'POS Opening Entry', true);
select private.apply_doctype_policies('pos_invoices', 'POS Invoice');
select private.apply_doctype_policies('pos_invoice_items', 'POS Invoice', true);
select private.apply_doctype_policies('pos_invoice_taxes', 'POS Invoice', true);
select private.apply_doctype_policies('pos_invoice_payments', 'POS Invoice', true);
select private.apply_doctype_policies('pos_closing_entries', 'POS Closing Entry');
select private.apply_doctype_policies('pos_closing_entry_payments', 'POS Closing Entry', true);
