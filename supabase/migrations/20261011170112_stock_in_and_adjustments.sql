-- Step 16 of the POS system, on ERPNext's model: Stock In & Adjustments
-- (.claude/erpnext-docs/POS-System-Added-Features.md 16.1–16.3, and 13.2's Opening Stock;
-- docs.frappe.io/erpnext/opening-stock, /stock-reconciliation, /stock-entry, /stock-entry-purpose,
-- /perpetual-inventory 2.6–2.8).
--
-- 1. Their naming series join Document Naming Settings.
-- 2. stock_reconciliations (+ rows): Opening Stock, and the count against the books.
-- 3. stock_entries (+ rows): Material Receipt, Material Issue, Material Transfer.
-- 4. public.save_stock_reconciliation() and public.save_stock_entry(): a draft and its rows.
-- 5. private.submit_stock_reconciliations() and private.submit_stock_entries(): what public.submit_document()
--    posts for each (20261011165554_ledgers.sql). A cancel needs nothing of its own.
-- 6. public.save_item_with_opening_stock(): a new item's Opening Stock and Valuation Rate.
-- 7. The doctypes, their permissions and policies.
--
-- Both documents count in the item's stock unit and name their warehouses once, on the document.
--
-- Out of scope, so absent: the manufacturing, repack and subcontracting purposes, Add to Transit, additional
-- costs, per-row units and warehouses, batches and serial numbers, the spreadsheet upload, barcode scanning,
-- Allow Zero Valuation Rate. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Naming series (20261010064803_naming_series.sql). ERPNext ships MAT-RECO-.YYYY.- and MAT-STE-.YYYY.-.

alter table public.naming_series drop constraint if exists naming_series_document_type;
alter table public.naming_series add constraint naming_series_document_type
  check (document_type in ('POS Invoice', 'Sales Invoice', 'Item', 'Stock Reconciliation', 'Stock Entry'));

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
    (p_merchant, 'Stock Entry', array['MAT-STE-.YYYY.-'])
  on conflict (merchant_id, document_type) do nothing;
$$;

-- The systems that already exist.
select private.seed_naming_for(m.id) from public.merchants m;


-- The links both documents carry. On a new document an empty Difference Account and Cost Center are filled
-- as ERPNext fills them: the Company's Stock Adjustment Account — or, for Opening Stock, the Temporary
-- ledger ("The Difference Account will be set as 'Temporary Opening'") — and the Company's cost center.
-- Then each changed link must be a record its field takes: a warehouse an enabled one that is not a group,
-- the account and the cost center enabled ledgers; and an Opening Stock's difference never goes to income
-- or expense ("Difference Account must be a Asset/Liability type account, since this Stock Reconciliation
-- is an Opening Entry"). Columns are read through to_jsonb, so the table without warehouses skips them.
-- Security definer, as private.validate_defaults: a User Permission must not hide the record from the check.
create or replace function private.validate_stock_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.difference_account is null then
      new.difference_account := case
        when to_jsonb(new) ->> 'purpose' = 'Opening Stock' then (
          select a.id from public.accounts a
          where a.merchant_id = new.merchant_id and a.account_type = 'Temporary' and not a.is_group and not a.disabled
          order by a.account_name limit 1
        )
        else (select m.stock_adjustment_account from public.merchants m where m.id = new.merchant_id)
      end;
    end if;
    if new.cost_center is null then
      new.cost_center := (select m.cost_center from public.merchants m where m.id = new.merchant_id);
    end if;
  end if;

  v_new := to_jsonb(new);

  foreach v_column in array array['from_warehouse', 'to_warehouse', 'difference_account', 'cost_center'] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case
      when v_column in ('from_warehouse', 'to_warehouse') then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when v_column = 'difference_account' then
        (select not a.is_group and not a.disabled from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      else
        (select not c.is_group and not c.disabled from public.cost_centers c where c.id = v_id and c.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'document_link_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  if v_new ->> 'purpose' = 'Opening Stock' and (
    select a.root_type in ('Income', 'Expense') from public.accounts a where a.id = new.difference_account
  ) then
    raise exception 'opening_account_invalid' using errcode = '23514',
      detail = 'An Opening Stock''s Difference Account is an asset or liability account.';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_stock_document() from public, anon, authenticated, service_role;


-- 2. Stock Reconciliation: "the process of counting and evaluating" — each row sets one item's quantity and
-- valuation rate in one warehouse.

create table if not exists public.stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- From the Stock Reconciliation series, when the draft is first saved (private.name_document).
  name text not null,
  posting_date date not null,
  purpose text not null default 'Stock Reconciliation',
  -- Where the change in stock value goes. Needed only while Perpetual Inventory is on.
  difference_account uuid,
  cost_center uuid,
  -- 0 draft, 1 submitted, 2 cancelled. Moved only by public.submit_document() and public.cancel_document().
  docstatus smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint stock_reconciliations_id_merchant unique (id, merchant_id),
  constraint stock_reconciliations_name_unique unique (merchant_id, name),
  constraint stock_reconciliations_purpose check (purpose in ('Opening Stock', 'Stock Reconciliation')),
  constraint stock_reconciliations_docstatus check (docstatus in (0, 1, 2)),
  -- Deleting an account or cost center a document names fails with 23503 ("in use").
  constraint stock_reconciliations_account_fk foreign key (difference_account, merchant_id) references public.accounts (id, merchant_id),
  constraint stock_reconciliations_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.stock_reconciliations enable row level security;
create index if not exists stock_reconciliations_account_idx on public.stock_reconciliations (difference_account, merchant_id);
create index if not exists stock_reconciliations_cost_center_idx on public.stock_reconciliations (cost_center, merchant_id);

drop trigger if exists stock_reconciliations_name on public.stock_reconciliations;
create trigger stock_reconciliations_name
  before insert on public.stock_reconciliations
  for each row execute function private.name_document('Stock Reconciliation');

drop trigger if exists stock_reconciliations_validate on public.stock_reconciliations;
create trigger stock_reconciliations_validate
  before insert or update on public.stock_reconciliations
  for each row execute function private.validate_stock_document();

create table if not exists public.stock_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  stock_reconciliation_id uuid not null,
  idx integer not null,
  item_id uuid not null,
  warehouse_id uuid not null,
  -- What the count found, and what each unit is worth.
  qty numeric not null,
  valuation_rate numeric not null,
  -- Written on submit: what the books held, and the value the count changed.
  current_qty numeric,
  current_valuation_rate numeric,
  amount_difference numeric,

  constraint stock_reconciliation_items_qty check (qty >= 0),
  constraint stock_reconciliation_items_rate check (valuation_rate >= 0),
  -- One count of one item in one warehouse per document.
  constraint stock_reconciliation_items_unique unique (stock_reconciliation_id, item_id, warehouse_id),
  constraint stock_reconciliation_items_parent_fk foreign key (stock_reconciliation_id, merchant_id)
    references public.stock_reconciliations (id, merchant_id) on delete cascade,
  -- Deleting an item or warehouse a document names fails with 23503 ("in use").
  constraint stock_reconciliation_items_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id),
  constraint stock_reconciliation_items_warehouse_fk foreign key (warehouse_id, merchant_id) references public.warehouses (id, merchant_id)
);

alter table public.stock_reconciliation_items enable row level security;
create index if not exists stock_reconciliation_items_parent_idx on public.stock_reconciliation_items (stock_reconciliation_id, merchant_id);
create index if not exists stock_reconciliation_items_item_idx on public.stock_reconciliation_items (item_id, merchant_id);
create index if not exists stock_reconciliation_items_warehouse_idx on public.stock_reconciliation_items (warehouse_id, merchant_id);


-- 3. Stock Entry: stock received (Material Receipt), issued — damage, wastage, own use (Material Issue) —
-- or moved between two warehouses (Material Transfer).

create table if not exists public.stock_entries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  posting_date date not null,
  purpose text not null,
  -- Source and Target Warehouse: a receipt has only a target, an issue only a source, a transfer both.
  from_warehouse uuid,
  to_warehouse uuid,
  difference_account uuid,
  cost_center uuid,
  docstatus smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint stock_entries_id_merchant unique (id, merchant_id),
  constraint stock_entries_name_unique unique (merchant_id, name),
  constraint stock_entries_purpose check (purpose in ('Material Receipt', 'Material Issue', 'Material Transfer')),
  constraint stock_entries_docstatus check (docstatus in (0, 1, 2)),
  constraint stock_entries_warehouses check (case purpose
    when 'Material Receipt' then from_warehouse is null and to_warehouse is not null
    when 'Material Issue' then from_warehouse is not null and to_warehouse is null
    else from_warehouse is not null and to_warehouse is not null and from_warehouse <> to_warehouse
  end),
  constraint stock_entries_from_warehouse_fk foreign key (from_warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint stock_entries_to_warehouse_fk foreign key (to_warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint stock_entries_account_fk foreign key (difference_account, merchant_id) references public.accounts (id, merchant_id),
  constraint stock_entries_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.stock_entries enable row level security;
create index if not exists stock_entries_from_warehouse_idx on public.stock_entries (from_warehouse, merchant_id);
create index if not exists stock_entries_to_warehouse_idx on public.stock_entries (to_warehouse, merchant_id);
create index if not exists stock_entries_account_idx on public.stock_entries (difference_account, merchant_id);
create index if not exists stock_entries_cost_center_idx on public.stock_entries (cost_center, merchant_id);

drop trigger if exists stock_entries_name on public.stock_entries;
create trigger stock_entries_name
  before insert on public.stock_entries
  for each row execute function private.name_document('Stock Entry');

drop trigger if exists stock_entries_validate on public.stock_entries;
create trigger stock_entries_validate
  before insert or update on public.stock_entries
  for each row execute function private.validate_stock_document();

create table if not exists public.stock_entry_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  stock_entry_id uuid not null,
  idx integer not null,
  item_id uuid not null,
  qty numeric not null,
  -- Typed on a receipt ("Item Valuation becomes a mandatory field in the Material Receipt entry"); on an
  -- issue or a transfer, the valuation it left at, written on submit.
  basic_rate numeric,
  -- Written on submit: the value the row moved.
  amount numeric,

  constraint stock_entry_items_qty check (qty > 0),
  constraint stock_entry_items_rate check (basic_rate >= 0),
  constraint stock_entry_items_parent_fk foreign key (stock_entry_id, merchant_id)
    references public.stock_entries (id, merchant_id) on delete cascade,
  constraint stock_entry_items_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id)
);

alter table public.stock_entry_items enable row level security;
create index if not exists stock_entry_items_parent_idx on public.stock_entry_items (stock_entry_id, merchant_id);
create index if not exists stock_entry_items_item_idx on public.stock_entry_items (item_id, merchant_id);


-- 4. Saving a draft with its rows. Security invoker, like public.save_item: the caller's own policies decide
-- every row, and private.guard_docstatus() refuses anything but a draft. The rows are replaced as a set; idx
-- is their order in the payload. An empty posting date is today in the system's time zone.

create or replace function public.save_stock_reconciliation(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_reconciliations (merchant_id, posting_date, purpose, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_reconciliations set
      posting_date = v_date,
      purpose = coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'stock_reconciliation_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_reconciliation_items where stock_reconciliation_id = v_id;

  insert into public.stock_reconciliation_items (merchant_id, stock_reconciliation_id, idx, item_id, warehouse_id, qty, valuation_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'warehouse_id')::uuid,
    (r.value ->> 'qty')::numeric,
    coalesce(nullif(r.value ->> 'valuation_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_stock_reconciliation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stock_reconciliation(jsonb) to authenticated;

create or replace function public.save_stock_entry(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_entries (merchant_id, posting_date, purpose, from_warehouse, to_warehouse, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      payload ->> 'purpose',
      nullif(payload ->> 'from_warehouse', '')::uuid,
      nullif(payload ->> 'to_warehouse', '')::uuid,
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_entries set
      posting_date = v_date,
      purpose = payload ->> 'purpose',
      from_warehouse = nullif(payload ->> 'from_warehouse', '')::uuid,
      to_warehouse = nullif(payload ->> 'to_warehouse', '')::uuid,
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'stock_entry_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_entry_items where stock_entry_id = v_id;

  insert into public.stock_entry_items (merchant_id, stock_entry_id, idx, item_id, qty, basic_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'qty')::numeric,
    nullif(r.value ->> 'basic_rate', '')::numeric
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_stock_entry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_stock_entry(jsonb) to authenticated;


-- 5. What each document posts. Called only by public.submit_document(), which has checked the caller and
-- locked the draft. Security definer, search_path pinned, out of every role's reach.
--
-- With Perpetual Inventory, each change in stock value moves the warehouse's inventory account, and the
-- other side is the document's Difference Account (docs.frappe.io/erpnext/perpetual-inventory). Off, only
-- the stock ledger is written.

-- Each row sets its bin; a row that changes nothing posts nothing, and a document of such rows is refused.
create or replace function private.submit_stock_reconciliations(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_reconciliations;
  v_row public.stock_reconciliation_items;
  v_perpetual boolean;
  v_account uuid;
  v_bin record;
  v_value numeric;
  v_gl jsonb := '[]'::jsonb;
  v_changed boolean := false;
begin
  select * into v_doc from public.stock_reconciliations d where d.id = p_id;
  select m.enable_perpetual_inventory into v_perpetual from public.merchants m where m.id = v_doc.merchant_id;

  if v_perpetual and v_doc.difference_account is null then
    raise exception 'difference_account_required' using errcode = '23514',
      detail = 'With Perpetual Inventory on, the change in stock value needs a Difference Account.';
  end if;

  for v_row in
    select * from public.stock_reconciliation_items r where r.stock_reconciliation_id = p_id order by r.idx
  loop
    if v_row.qty > 0 and v_row.valuation_rate <= 0 then
      raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Stock on hand needs a valuation rate above zero.';
    end if;

    select b.actual_qty, b.valuation_rate into v_bin
    from public.bins b where b.item_id = v_row.item_id and b.warehouse_id = v_row.warehouse_id;

    v_value := private.reconcile_sle(
      v_doc.merchant_id, 'Stock Reconciliation', p_id, v_doc.name, v_doc.posting_date,
      v_row.item_id, v_row.warehouse_id, v_row.qty, v_row.valuation_rate
    );

    update public.stock_reconciliation_items r set
      current_qty = coalesce(v_bin.actual_qty, 0),
      current_valuation_rate = coalesce(v_bin.valuation_rate, 0),
      amount_difference = coalesce(v_value, 0)
    where r.id = v_row.id;

    continue when v_value is null;
    v_changed := true;

    if v_perpetual then
      v_account := private.warehouse_account(v_row.warehouse_id);
      if v_account is null then
        raise exception 'no_inventory_account' using errcode = '23514',
          detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
      end if;

      v_gl := v_gl || jsonb_build_array(
        jsonb_build_object('account_id', v_account, 'amount', v_value),
        jsonb_build_object('account_id', v_doc.difference_account, 'amount', -v_value, 'cost_center_id', v_doc.cost_center)
      );
    end if;
  end loop;

  if not v_changed then
    raise exception 'nothing_to_reconcile' using errcode = '23514', detail = 'None of the items have any change in quantity or value.';
  end if;

  perform private.post_gl(v_doc.merchant_id, 'Stock Reconciliation', p_id, v_doc.name, v_doc.posting_date, v_gl);
end;
$$;

revoke execute on function private.submit_stock_reconciliations(uuid) from public, anon, authenticated, service_role;

-- A receipt brings each row in at its rate; an issue takes it out at its valuation; a transfer takes it
-- out of the source and into the target at that same value. Two warehouses that share an inventory account
-- net to nothing in the books (private.post_gl merges an account's rows).
create or replace function private.submit_stock_entries(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_entries;
  v_row public.stock_entry_items;
  v_perpetual boolean;
  v_from uuid;
  v_to uuid;
  v_out numeric;
  v_in numeric;
  v_gl jsonb := '[]'::jsonb;
  v_rows integer := 0;
begin
  select * into v_doc from public.stock_entries d where d.id = p_id;
  select m.enable_perpetual_inventory into v_perpetual from public.merchants m where m.id = v_doc.merchant_id;

  if v_perpetual then
    v_from := private.warehouse_account(v_doc.from_warehouse);
    v_to := private.warehouse_account(v_doc.to_warehouse);

    if (v_doc.from_warehouse is not null and v_from is null) or (v_doc.to_warehouse is not null and v_to is null) then
      raise exception 'no_inventory_account' using errcode = '23514',
        detail = 'Neither the warehouse, its parents nor the Company names an inventory account.';
    end if;
    if v_doc.difference_account is null then
      raise exception 'difference_account_required' using errcode = '23514',
        detail = 'With Perpetual Inventory on, the change in stock value needs a Difference Account.';
    end if;
  end if;

  for v_row in
    select * from public.stock_entry_items r where r.stock_entry_id = p_id order by r.idx
  loop
    v_rows := v_rows + 1;
    v_out := 0;
    v_in := 0;

    if v_doc.purpose = 'Material Receipt' then
      if coalesce(v_row.basic_rate, 0) <= 0 then
        raise exception 'rate_required' using errcode = '23514', detail = 'A receipt needs each row''s rate.';
      end if;
      v_in := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, v_row.basic_rate
      );
    else
      v_out := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.from_warehouse, -v_row.qty
      );
      if v_doc.purpose = 'Material Transfer' then
        v_in := private.post_sle(
          v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, -v_out / v_row.qty
        );
      end if;
    end if;

    -- What the row moved, for the page: the rate it came in at, or the valuation it left at.
    update public.stock_entry_items r set
      basic_rate = case when v_doc.purpose = 'Material Receipt' then r.basic_rate else -v_out / r.qty end,
      amount = case when v_doc.purpose = 'Material Receipt' then v_in else -v_out end
    where r.id = v_row.id;

    v_gl := v_gl || jsonb_build_array(
      jsonb_build_object('account_id', v_from, 'amount', v_out),
      jsonb_build_object('account_id', v_to, 'amount', v_in),
      -- The stock value that came or went with no warehouse on the other side.
      jsonb_build_object('account_id', v_doc.difference_account, 'amount', -(v_out + v_in), 'cost_center_id', v_doc.cost_center)
    );
  end loop;

  if v_rows = 0 then
    raise exception 'no_rows' using errcode = '23514', detail = 'A stock entry needs at least one item.';
  end if;

  if v_perpetual then
    perform private.post_gl(v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_gl);
  end if;
end;
$$;

revoke execute on function private.submit_stock_entries(uuid) from public, anon, authenticated, service_role;


-- 6. A new item's Opening Stock (docs.frappe.io/erpnext/item 2.2; POS-System-Added-Features 13.2 and 16.1):
-- public.save_item(), then an Opening Stock reconciliation of that quantity in the item's Default Warehouse,
-- else Stock Settings', submitted in the same transaction. "Valuation Rate is mandatory if Opening Stock
-- entered"; ERPNext falls back to the Standard Selling Rate, and so does this. Read on creation only, and
-- only for an item that maintains stock.
--
-- Security invoker: the creator needs Stock Reconciliation create and submit, as the Standard Selling Rate
-- needs Item Price create. A wrapper rather than a third copy of save_item's body.
create or replace function public.save_item_with_opening_stock(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new boolean := nullif(payload ->> 'id', '') is null;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_opening numeric := nullif(payload ->> 'opening_stock', '')::numeric;
  v_rate numeric := coalesce(nullif(payload ->> 'valuation_rate', '')::numeric, nullif(payload ->> 'standard_rate', '')::numeric);
  v_id uuid;
  v_warehouse uuid;
  v_reconciliation uuid;
begin
  v_id := public.save_item(payload);

  if not v_new or coalesce(v_opening, 0) <= 0 or not coalesce((payload ->> 'is_stock_item')::boolean, true) then
    return v_id;
  end if;

  if coalesce(v_rate, 0) <= 0 then
    raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Valuation Rate is mandatory if Opening Stock is entered.';
  end if;

  v_warehouse := coalesce(
    nullif(payload ->> 'default_warehouse', '')::uuid,
    (select s.default_warehouse from public.stock_settings s where s.merchant_id = v_merchant)
  );
  if v_warehouse is null then
    raise exception 'no_default_warehouse' using errcode = '23514',
      detail = 'Neither the item nor Stock Settings names a warehouse for the opening stock.';
  end if;

  v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
    'merchant_id', v_merchant,
    'purpose', 'Opening Stock',
    'items', jsonb_build_array(jsonb_build_object(
      'item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate
    ))
  ));
  perform public.submit_document('Stock Reconciliation', v_reconciliation);

  return v_id;
end;
$$;

revoke execute on function public.save_item_with_opening_stock(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_with_opening_stock(jsonb) to authenticated;


-- 7. Doctypes, permissions, policies (20261008145056_users_and_access.sql, 20261011165554_ledgers.sql).
-- ERPNext gives Stock Reconciliation to the Stock Manager alone; a Stock User keeps and submits Stock
-- Entries, and only the Stock Manager cancels or deletes one.

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Stock Reconciliation', 'stock_reconciliations', 'document', false),
  ('Stock Entry', 'stock_entries', 'document', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete, can_submit, can_cancel)
values
  ('Stock Manager', 'Stock Reconciliation', true, true, true, true, true, true, true),
  ('Stock Manager', 'Stock Entry', true, true, true, true, true, true, true),
  ('Stock User', 'Stock Entry', true, true, true, true, false, true, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('stock_reconciliations', 'Stock Reconciliation');
select private.apply_doctype_policies('stock_reconciliation_items', 'Stock Reconciliation', true);
select private.apply_doctype_policies('stock_entries', 'Stock Entry');
select private.apply_doctype_policies('stock_entry_items', 'Stock Entry', true);
