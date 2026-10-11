-- Step 15 of the POS system, on ERPNext's model: the Ledgers — the posting engine every later step uses
-- (.claude/erpnext-docs/POS-System-Added-Features.md 15.1–15.4, and 21.1's Submit and Cancel;
-- docs.frappe.io/erpnext/accounting-entries, /general-ledger, /immutable-ledger-in-erpnext,
-- /freeze-accounting-entries, /stock-ledger, /stock-level-report, /fifo-and-moving-average,
-- /perpetual-inventory, /stock-adjustment-cogs-with-negative-stock, /role-based-permissions).
--
-- 1. Submit and Cancel join the permission matrix and the functions that read it.
-- 2. Two doctype kinds. `document`: submittable — docstatus 0 draft, 1 submitted, 2 cancelled; a signed-in
--    person writes a draft and nothing else. `ledger`: read-only for everyone, the owner included.
-- 3. The ledgers: gl_entries (General Ledger), stock_ledger_entries (Stock Ledger), bins (Stock Balance).
-- 4. The engine, in `private` and out of every role's reach: when a date may be posted to, balanced GL
--    rows, stock movements valued by FIFO or Moving Average, and their reversal.
-- 5. public.submit_document() and public.cancel_document(): the two doors into the engine.
--
-- Known ceiling (ponytail): there is no repost engine. A stock posting dated before the item's last
-- movement in that warehouse is refused, and a cancel is the exact reversal at today's date or it is
-- refused. ERPNext recalculates every later entry instead (Repost Item Valuation).
--
-- Out of scope, so absent: parties and receivables, finance books, accounting dimensions beyond the cost
-- center, multi-currency, batches and serial numbers, Stock Frozen Upto, period closing.
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Submit and Cancel (docs: "Permissions are applied on each stage of the document like Creation, Saving,
-- Submission, Cancellation"). Amend, print, report and export stay out of scope.

alter table public.standard_role_permissions
  add column if not exists can_submit boolean not null default false,
  add column if not exists can_cancel boolean not null default false;

alter table public.role_permissions
  add column if not exists can_submit boolean not null default false,
  add column if not exists can_cancel boolean not null default false;

-- The seam (20261008145056_users_and_access.sql), with the two new permission types.
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


-- 2. The two kinds.

alter table public.doctypes drop constraint if exists doctypes_kind;
alter table public.doctypes add constraint doctypes_kind
  check (kind in ('record', 'single', 'tree', 'document', 'ledger'));

-- A document's table carries `name`, `posting_date` and `docstatus`. A signed-in person writes a draft and
-- nothing else: a submitted or cancelled document changes only inside the engine, whose functions are
-- security definer — inside them current_user is their owner, not `authenticated` (as private.guard_roles
-- tells a seed from a client).
create or replace function private.guard_docstatus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.docstatus <> 0 then
      raise exception 'not_a_draft' using errcode = '23514', detail = 'A document starts as a draft; Submit posts it.';
    end if;
    return new;
  end if;

  if old.docstatus <> 0 then
    raise exception 'document_locked' using errcode = '23514', detail = 'A submitted or cancelled document cannot be changed or deleted.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.docstatus <> 0 then
    raise exception 'not_a_draft' using errcode = '23514', detail = 'Submit posts a document; its status cannot be written.';
  end if;
  if new.name is distinct from old.name then
    raise exception 'document_name_locked' using errcode = '23514', detail = 'A document keeps its name.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_docstatus() from public, anon, authenticated, service_role;

-- The same for a document's rows. tg_argv[0] is the document's table, tg_argv[1] this table's key to it.
-- A parent the caller cannot read counts as locked.
create or replace function private.guard_docstatus_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_status smallint;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if current_user in ('authenticated', 'anon') then
    execute format('select d.docstatus from public.%I d where d.id = $1', tg_argv[0])
      into v_status using (v_row ->> tg_argv[1])::uuid;
    if v_status is distinct from 0 then
      raise exception 'document_locked' using errcode = '23514', detail = 'A submitted or cancelled document cannot be changed or deleted.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_docstatus_child() from public, anon, authenticated, service_role;

-- A document takes its name from the first series of its Document Naming Settings row, when it is first
-- saved — as ERPNext names a draft. tg_argv[0] is the document type. Security definer: private.make_name()
-- is out of every role's reach.
create or replace function private.name_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series text;
begin
  select n.options[1] into v_series
  from public.naming_series n
  where n.merchant_id = new.merchant_id and n.document_type = tg_argv[0];

  if v_series is null then
    raise exception 'no_document_series' using errcode = '23514',
      detail = format('Document Naming Settings has no series for %s.', tg_argv[0]);
  end if;

  new.name := private.make_name(new.merchant_id, v_series);
  return new;
end;
$$;

revoke execute on function private.name_document() from public, anon, authenticated, service_role;

-- The policy helper (20261008145056_users_and_access.sql), with the two kinds.
-- ledger: a select policy and nothing else — only the engine writes it.
-- document: the record's four policies, and the draft-only guard on the table and on each of its rows'
-- tables (found by the row table's foreign key to the document).
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent text;
  v_restrictable boolean;
  v_restrict text := '';
  v_cmd text;
  v_key text;
begin
  select d.kind, d.restrictable, d.table_name into v_kind, v_restrictable, v_parent from public.doctypes d where d.name = p_doctype;
  if v_kind is null then
    raise exception 'unknown doctype %', p_doctype;
  end if;

  foreach v_cmd in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table || '_' || v_cmd, p_table);
  end loop;

  if v_restrictable and not p_child then
    v_restrict := format(
      ' and (merchant_id not in (select private.restricted_merchant_ids(%L)) or id in (select private.allowed_record_ids(%L)))',
      p_doctype, p_doctype
    );
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
    'create policy %I on public.%I for insert to authenticated with check (merchant_id in (select private.permitted_merchant_ids(%L, %L)))',
    p_table || '_insert', p_table, p_doctype, case when p_child then 'write' else 'create' end
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


-- 3. The ledgers. Written only by the engine below; a bigint identity key, so rows read in the order they
-- were posted.

-- ERPNext's GL Entry: one debit or credit of one account, from one submitted document.
create table if not exists public.gl_entries (
  id bigint generated always as identity primary key,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  posting_date date not null,
  account_id uuid not null,
  debit numeric not null default 0,
  credit numeric not null default 0,
  cost_center_id uuid,
  -- The document that posted it: its doctype, its id and its name.
  voucher_type text not null,
  voucher_id uuid not null,
  voucher_no text not null,
  remarks text,
  -- Set when the document is cancelled with Immutable Ledger off: the row leaves every balance.
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint gl_entries_amounts check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0)),
  -- Deleting an account or cost center with entries fails with 23503 ("in use").
  constraint gl_entries_account_fk foreign key (account_id, merchant_id) references public.accounts (id, merchant_id),
  constraint gl_entries_cost_center_fk foreign key (cost_center_id, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.gl_entries enable row level security;
create index if not exists gl_entries_posting_idx on public.gl_entries (merchant_id, posting_date desc, id desc);
create index if not exists gl_entries_account_idx on public.gl_entries (account_id, merchant_id);
create index if not exists gl_entries_cost_center_idx on public.gl_entries (cost_center_id, merchant_id);
create index if not exists gl_entries_voucher_idx on public.gl_entries (voucher_id);

-- ERPNext's Stock Ledger Entry: one movement of one item in one warehouse, and what the bin held after it.
create table if not exists public.stock_ledger_entries (
  id bigint generated always as identity primary key,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  posting_date date not null,
  item_id uuid not null,
  warehouse_id uuid not null,
  -- In above zero, out below.
  actual_qty numeric not null,
  -- "The actual value of the stock at which it was brought under your inventory"; 0 on the way out.
  incoming_rate numeric not null default 0,
  valuation_rate numeric not null default 0,
  qty_after_transaction numeric not null,
  -- Balance Value.
  stock_value numeric not null,
  stock_value_difference numeric not null,
  voucher_type text not null,
  voucher_id uuid not null,
  voucher_no text not null,
  -- The row, or its reversal, of a cancelled document. Stock rows stay in the report either way.
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),

  -- Deleting an item or warehouse with movements fails with 23503 ("in use").
  constraint stock_ledger_entries_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id),
  constraint stock_ledger_entries_warehouse_fk foreign key (warehouse_id, merchant_id) references public.warehouses (id, merchant_id)
);

alter table public.stock_ledger_entries enable row level security;
create index if not exists stock_ledger_entries_posting_idx on public.stock_ledger_entries (merchant_id, posting_date desc, id desc);
create index if not exists stock_ledger_entries_item_idx on public.stock_ledger_entries (item_id, merchant_id);
create index if not exists stock_ledger_entries_warehouse_idx on public.stock_ledger_entries (warehouse_id, merchant_id);
create index if not exists stock_ledger_entries_voucher_idx on public.stock_ledger_entries (voucher_id);

-- ERPNext's Bin: what one warehouse holds of one item now — Stock Balance.
create table if not exists public.bins (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id uuid not null,
  warehouse_id uuid not null,
  actual_qty numeric not null default 0,
  valuation_rate numeric not null default 0,
  -- What the stock is worth: the figure the warehouse's inventory account follows.
  stock_value numeric not null default 0,
  -- FIFO layers, oldest first, each [quantity, rate]. Empty under Moving Average and at or below zero.
  fifo_queue jsonb not null default '[]'::jsonb,
  -- The date of its last movement: nothing is posted before it.
  last_posting_date date,

  primary key (item_id, warehouse_id),
  constraint bins_item_fk foreign key (item_id, merchant_id) references public.items (id, merchant_id),
  constraint bins_warehouse_fk foreign key (warehouse_id, merchant_id) references public.warehouses (id, merchant_id)
);

alter table public.bins enable row level security;
create index if not exists bins_merchant_idx on public.bins (merchant_id);
create index if not exists bins_item_idx on public.bins (item_id, merchant_id);
create index if not exists bins_warehouse_idx on public.bins (warehouse_id, merchant_id);

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('GL Entry', 'gl_entries', 'ledger', false),
  ('Stock Ledger Entry', 'stock_ledger_entries', 'ledger', false),
  ('Bin', 'bins', 'ledger', false)
on conflict (name) do nothing;

-- ERPNext's matrix for the reports: accounts read the General Ledger, stock and the Accounts Manager the
-- Stock Ledger, and whoever sells or keeps items sees what is on hand.
insert into public.standard_role_permissions (role_name, doctype, can_select, can_read)
values
  ('Accounts Manager', 'GL Entry', true, true),
  ('Accounts User', 'GL Entry', true, true),

  ('Stock Manager', 'Stock Ledger Entry', true, true),
  ('Stock User', 'Stock Ledger Entry', true, true),
  ('Accounts Manager', 'Stock Ledger Entry', true, true),

  ('Stock Manager', 'Bin', true, true),
  ('Stock User', 'Bin', true, true),
  ('Accounts Manager', 'Bin', true, true),
  ('Sales Manager', 'Bin', true, true),
  ('Sales User', 'Bin', true, true),
  ('Item Manager', 'Bin', true, true)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('gl_entries', 'GL Entry');
select private.apply_doctype_policies('stock_ledger_entries', 'Stock Ledger Entry');
select private.apply_doctype_policies('bins', 'Bin');


-- 4. The engine. Every function is security definer with search_path pinned and every name qualified
-- (CLAUDE.md §6.2), revoked from every role: only public.submit_document(), public.cancel_document() and
-- the posters they call reach it, and those check the caller first.

-- frappe's rounded(): Banker's sends an exact half to the even neighbour, Commercial away from zero. Must
-- agree with roundTo() in src/lib/money.ts.
create or replace function private.money_round(p_value numeric, p_precision integer, p_method text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_method = 'Commercial Rounding' then round(p_value, p_precision)
    when (abs(p_value) * power(10::numeric, p_precision)) % 1 = 0.5
      and trunc(abs(p_value) * power(10::numeric, p_precision)) % 2 = 0
      then sign(p_value) * trunc(abs(p_value) * power(10::numeric, p_precision)) / power(10::numeric, p_precision)
    else round(p_value, p_precision)
  end;
$$;

revoke execute on function private.money_round(numeric, integer, text) from public, anon, authenticated, service_role;

-- An amount at the system's Currency Precision and Rounding Method (System Settings).
create or replace function private.currency_round(p_merchant uuid, p_value numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.money_round(p_value, s.currency_precision, s.rounding_method) from public.system_settings s where s.merchant_id = p_merchant),
    round(p_value, 2)
  );
$$;

revoke execute on function private.currency_round(uuid, numeric) from public, anon, authenticated, service_role;

-- Today in the system's time zone (System Settings), as private.series_prefix() reads it. Invoker, and
-- granted: the save RPCs default a document's posting date with it, and every member may read System
-- Settings.
create or replace function private.merchant_today(p_merchant uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone s.time_zone)::date from public.system_settings s where s.merchant_id = p_merchant),
    (now() at time zone 'UTC')::date
  );
$$;

revoke execute on function private.merchant_today(uuid) from public, anon, authenticated, service_role;
grant execute on function private.merchant_today(uuid) to authenticated;

-- "Posting is refused outside an enabled Fiscal Year and on or before Accounts Frozen Till." The owner and
-- the role Accounts Settings names may still post into a frozen period. A future date is refused too:
-- with no repost engine it would block every posting until that day came.
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

revoke execute on function private.assert_postable(uuid, date) from public, anon, authenticated, service_role;

-- Post a document's accounting entries. p_rows is [{account_id, amount, cost_center_id}]: an amount above
-- zero is a debit, below zero a credit. Each is rounded to the currency precision, rows of one account and
-- cost center are merged (so a transfer between warehouses that share an account posts nothing), and the
-- total must come to zero: "Every posting must balance." A difference no bigger than rounding can make
-- goes to the Company's Round Off Account; anything more is refused.
create or replace function private.post_gl(
  p_merchant uuid, p_voucher_type text, p_voucher_id uuid, p_voucher_no text, p_date date, p_rows jsonb, p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precision integer;
  v_method text;
  v_company public.merchants;
  v_rows jsonb;
  v_diff numeric;
  v_bad text;
begin
  select s.currency_precision, s.rounding_method into v_precision, v_method
  from public.system_settings s where s.merchant_id = p_merchant;
  v_precision := coalesce(v_precision, 2);

  select * into v_company from public.merchants m where m.id = p_merchant;

  select
    coalesce(jsonb_agg(jsonb_build_object('account_id', t.account_id, 'cost_center_id', t.cost_center_id, 'amount', t.amount)), '[]'::jsonb),
    coalesce(sum(t.amount), 0)
  into v_rows, v_diff
  from (
    select
      r.account_id,
      -- "Cost Center is required for a Profit and Loss account": the row's, else the Company's.
      case when a.root_type in ('Income', 'Expense') then coalesce(r.cost_center_id, v_company.cost_center) end as cost_center_id,
      sum(private.money_round(r.amount, v_precision, coalesce(v_method, 'Banker''s Rounding'))) as amount
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r (account_id uuid, cost_center_id uuid, amount numeric)
    left join public.accounts a on a.id = r.account_id and a.merchant_id = p_merchant
    group by 1, 2
    having sum(private.money_round(r.amount, v_precision, coalesce(v_method, 'Banker''s Rounding'))) <> 0
  ) t;

  if v_rows = '[]'::jsonb then
    return;
  end if;

  perform private.assert_postable(p_merchant, p_date);

  select coalesce(a.account_name, 'An account') into v_bad
  from jsonb_to_recordset(v_rows) as r (account_id uuid, cost_center_id uuid, amount numeric)
  left join public.accounts a on a.id = r.account_id and a.merchant_id = p_merchant
  where a.id is null or a.is_group or a.disabled
  limit 1;
  if found then
    raise exception 'account_unusable' using errcode = '23514', detail = format('%s is missing, a group or disabled.', v_bad);
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows) as r (account_id uuid, cost_center_id uuid, amount numeric)
    join public.accounts a on a.id = r.account_id
    left join public.cost_centers c on c.id = r.cost_center_id and c.merchant_id = p_merchant
    where (a.root_type in ('Income', 'Expense') and r.cost_center_id is null)
      or (r.cost_center_id is not null and (c.id is null or c.is_group or c.disabled))
  ) then
    raise exception 'cost_center_unusable' using errcode = '23514',
      detail = 'An income or expense entry needs an enabled cost center that is not a group.';
  end if;

  if v_diff <> 0 then
    if abs(v_diff) > 5 / power(10::numeric, v_precision) or v_company.round_off_account is null then
      raise exception 'gl_unbalanced' using errcode = '23514', detail = format('Debits and credits differ by %s.', v_diff);
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'account_id', v_company.round_off_account,
      'cost_center_id', coalesce(v_company.round_off_cost_center, v_company.cost_center),
      'amount', -v_diff
    ));
  end if;

  insert into public.gl_entries (merchant_id, posting_date, account_id, debit, credit, cost_center_id, voucher_type, voucher_id, voucher_no, remarks)
  select p_merchant, p_date, r.account_id, greatest(r.amount, 0), greatest(-r.amount, 0), r.cost_center_id,
    p_voucher_type, p_voucher_id, p_voucher_no, p_remarks
  from jsonb_to_recordset(v_rows) as r (account_id uuid, cost_center_id uuid, amount numeric);
end;
$$;

revoke execute on function private.post_gl(uuid, text, uuid, text, date, jsonb, text) from public, anon, authenticated, service_role;

-- Cancel a document's accounting entries, as Accounts Settings say (docs.frappe.io/erpnext/immutable-ledger-in-erpnext).
-- Immutable Ledger on: the entries stay and opposite ones are posted on the day of the cancellation. Off: the
-- entries are marked cancelled and leave every balance.
create or replace function private.cancel_gl(p_merchant uuid, p_voucher_type text, p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_immutable boolean;
  v_today date := private.merchant_today(p_merchant);
  v_date date;
begin
  select min(g.posting_date) into v_date
  from public.gl_entries g
  where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled;

  if v_date is null then
    return;
  end if;

  select s.enable_immutable_ledger into v_immutable from public.accounts_settings s where s.merchant_id = p_merchant;

  if coalesce(v_immutable, true) then
    perform private.assert_postable(p_merchant, v_today);

    insert into public.gl_entries (merchant_id, posting_date, account_id, debit, credit, cost_center_id, voucher_type, voucher_id, voucher_no, remarks)
    select g.merchant_id, v_today, g.account_id, g.credit, g.debit, g.cost_center_id, g.voucher_type, g.voucher_id, g.voucher_no,
      'On cancellation of ' || g.voucher_no
    from public.gl_entries g
    where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled
    order by g.id;
  else
    -- Rewriting entries of a day that is frozen, or outside every fiscal year, is refused like a posting.
    perform private.assert_postable(p_merchant, v_date);

    update public.gl_entries g set is_cancelled = true
    where g.merchant_id = p_merchant and g.voucher_type = p_voucher_type and g.voucher_id = p_voucher_id and not g.is_cancelled;
  end if;
end;
$$;

revoke execute on function private.cancel_gl(uuid, text, uuid) from public, anon, authenticated, service_role;

-- The inventory account a warehouse's stock value posts to: its own, else its nearest parent's, else the
-- Company's Default Inventory Account (docs.frappe.io/erpnext/perpetual-inventory 1.4). Null: none of them.
-- The same walk as inventoryAccount() in src/features/warehouses/queries.ts.
create or replace function private.warehouse_account(p_warehouse uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select w.id, w.parent_id, w.account, w.merchant_id, 0 as depth
    from public.warehouses w where w.id = p_warehouse
    union all
    select w.id, w.parent_id, w.account, w.merchant_id, up.depth + 1
    from public.warehouses w join up on w.id = up.parent_id
  )
  select coalesce(
    (select up.account from up where up.account is not null order by up.depth limit 1),
    (select m.default_inventory_account from public.merchants m join up on up.merchant_id = m.id where up.depth = 0)
  );
$$;

revoke execute on function private.warehouse_account(uuid) from public, anon, authenticated, service_role;

-- The bin of one item in one warehouse, created when missing and locked until the transaction ends, so two
-- postings cannot value the same stock at once. p_check: a new posting needs an enabled item that maintains
-- stock and an enabled warehouse that is not a group; a reversal does not.
--
-- ponytail: no repost engine. A posting dated before the bin's last movement would change every later
-- valuation, so it is refused. Upgrade path: ERPNext's Repost Item Valuation.
create or replace function private.lock_bin(p_merchant uuid, p_item uuid, p_warehouse uuid, p_date date, p_check boolean default true)
returns public.bins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bin public.bins;
begin
  perform private.assert_postable(p_merchant, p_date);

  if p_check then
    if not exists (
      select 1 from public.items i where i.id = p_item and i.merchant_id = p_merchant and i.is_stock_item and not i.disabled
    ) then
      raise exception 'item_unusable' using errcode = '23514', detail = 'Stock moves only for an enabled item that maintains stock.';
    end if;
    if not exists (
      select 1 from public.warehouses w where w.id = p_warehouse and w.merchant_id = p_merchant and not w.is_group and not w.disabled
    ) then
      raise exception 'warehouse_unusable' using errcode = '23514', detail = 'Stock is kept in an enabled warehouse that is not a group.';
    end if;
  end if;

  insert into public.bins (merchant_id, item_id, warehouse_id)
  values (p_merchant, p_item, p_warehouse)
  on conflict (item_id, warehouse_id) do nothing;

  select * into v_bin from public.bins b where b.item_id = p_item and b.warehouse_id = p_warehouse for update;

  if v_bin.last_posting_date is not null and p_date < v_bin.last_posting_date then
    raise exception 'stock_backdated' using errcode = '23514',
      detail = format('This item last moved in that warehouse on %s; a posting cannot be dated before it.', v_bin.last_posting_date);
  end if;

  return v_bin;
end;
$$;

revoke execute on function private.lock_bin(uuid, uuid, uuid, date, boolean) from public, anon, authenticated, service_role;

-- Write one Stock Ledger Entry and bring its bin to what it holds afterwards. Returns the value difference,
-- which is what the warehouse's inventory account moves by. The valuation rate is the stock's value over its
-- quantity; at or below zero the bin keeps its last rate, which is what stock sold from nothing is costed at.
create or replace function private.write_sle(
  p_bin public.bins, p_voucher_type text, p_voucher_id uuid, p_voucher_no text, p_date date,
  p_qty numeric, p_incoming_rate numeric, p_qty_after numeric, p_value_after numeric, p_queue jsonb, p_cancelled boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric := case when p_qty_after > 0 then p_value_after / p_qty_after else p_bin.valuation_rate end;
begin
  update public.bins b set
    actual_qty = p_qty_after,
    stock_value = p_value_after,
    valuation_rate = v_rate,
    fifo_queue = p_queue,
    last_posting_date = p_date
  where b.item_id = p_bin.item_id and b.warehouse_id = p_bin.warehouse_id;

  insert into public.stock_ledger_entries (
    merchant_id, posting_date, item_id, warehouse_id, actual_qty, incoming_rate, valuation_rate,
    qty_after_transaction, stock_value, stock_value_difference, voucher_type, voucher_id, voucher_no, is_cancelled
  )
  values (
    p_bin.merchant_id, p_date, p_bin.item_id, p_bin.warehouse_id, p_qty, coalesce(p_incoming_rate, 0), v_rate,
    p_qty_after, p_value_after, p_value_after - p_bin.stock_value, p_voucher_type, p_voucher_id, p_voucher_no, p_cancelled
  );

  return p_value_after - p_bin.stock_value;
end;
$$;

revoke execute on function private.write_sle(public.bins, text, uuid, text, date, numeric, numeric, numeric, numeric, jsonb, boolean) from public, anon, authenticated, service_role;

-- One stock movement: p_qty above zero comes in at p_rate, below zero goes out at the item's valuation.
-- Returns the value difference (docs.frappe.io/erpnext/fifo-and-moving-average).
--
-- The valuation method is the item's, else Stock Settings'. FIFO takes the oldest layers first; Moving
-- Average takes the bin's rate. Stock may go below zero only when the item or Stock Settings allow it, and
-- then it is costed at the bin's last rate; stock coming in fills that hole at the same rate before the
-- rest enters at its own (docs.frappe.io/erpnext/stock-adjustment-cogs-with-negative-stock). A bin emptied
-- to exactly zero keeps no value.
create or replace function private.post_sle(
  p_merchant uuid, p_voucher_type text, p_voucher_id uuid, p_voucher_no text, p_date date,
  p_item uuid, p_warehouse uuid, p_qty numeric, p_rate numeric default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bin public.bins;
  v_method text;
  v_allow_negative boolean;
  v_whole boolean;
  v_queue jsonb;
  v_layer jsonb;
  v_left numeric;
  v_take numeric;
  v_hole numeric;
  v_value numeric := 0;
  v_qty_after numeric;
begin
  if coalesce(p_qty, 0) = 0 then
    return 0;
  end if;

  v_bin := private.lock_bin(p_merchant, p_item, p_warehouse, p_date);

  select
    coalesce(i.valuation_method, s.valuation_method, 'FIFO'),
    i.allow_negative_stock or coalesce(s.allow_negative_stock, false),
    u.must_be_whole_number
  into v_method, v_allow_negative, v_whole
  from public.items i
  join public.uoms u on u.id = i.stock_uom
  left join public.stock_settings s on s.merchant_id = i.merchant_id
  where i.id = p_item and i.merchant_id = p_merchant;

  if v_whole and p_qty <> trunc(p_qty) then
    raise exception 'whole_number_required' using errcode = '23514', detail = 'This item is counted in a unit that takes whole numbers only.';
  end if;

  v_qty_after := v_bin.actual_qty + p_qty;

  if p_qty > 0 then
    if p_rate is null or p_rate < 0 then
      raise exception 'rate_required' using errcode = '23514', detail = 'Stock comes in at a rate.';
    end if;

    v_hole := least(greatest(-v_bin.actual_qty, 0), p_qty);
    v_value := private.currency_round(p_merchant, v_hole * v_bin.valuation_rate + (p_qty - v_hole) * p_rate);

    v_queue := case
      when v_qty_after <= 0 or v_method <> 'FIFO' then '[]'::jsonb
      when v_bin.actual_qty <= 0 then jsonb_build_array(jsonb_build_array(v_qty_after, p_rate))
      else v_bin.fifo_queue || jsonb_build_array(jsonb_build_array(p_qty, p_rate))
    end;
  else
    if v_qty_after < 0 and not v_allow_negative then
      raise exception 'insufficient_stock' using errcode = '23514',
        detail = format('%s on hand, %s needed.', v_bin.actual_qty, -p_qty);
    end if;

    v_left := -p_qty;
    v_queue := '[]'::jsonb;

    if v_method = 'FIFO' then
      for v_layer in select q.value from jsonb_array_elements(v_bin.fifo_queue) as q (value) loop
        v_take := least((v_layer ->> 0)::numeric, v_left);
        v_value := v_value + v_take * (v_layer ->> 1)::numeric;
        v_left := v_left - v_take;
        if (v_layer ->> 0)::numeric > v_take then
          v_queue := v_queue || jsonb_build_array(jsonb_build_array((v_layer ->> 0)::numeric - v_take, (v_layer ->> 1)::numeric));
        end if;
      end loop;
    end if;

    -- Moving Average, and whatever the FIFO layers could not cover: the bin's rate.
    v_value := -private.currency_round(p_merchant, v_value + v_left * v_bin.valuation_rate);

    if v_qty_after <= 0 then
      v_queue := '[]'::jsonb;
    end if;
  end if;

  if v_qty_after = 0 then
    v_value := -v_bin.stock_value;
  end if;

  return private.write_sle(
    v_bin, p_voucher_type, p_voucher_id, p_voucher_no, p_date,
    p_qty, case when p_qty > 0 then p_rate end, v_qty_after, v_bin.stock_value + v_value, v_queue
  );
end;
$$;

revoke execute on function private.post_sle(uuid, text, uuid, text, date, uuid, uuid, numeric, numeric) from public, anon, authenticated, service_role;

-- A count: the bin is set to p_qty at p_rate, as Stock Reconciliation does ("sets Quantity and Valuation
-- Rate per Item and Warehouse"). Returns the value difference, or null when the bin already holds exactly
-- that — "None of the items have any change in quantity or value".
create or replace function private.reconcile_sle(
  p_merchant uuid, p_voucher_type text, p_voucher_id uuid, p_voucher_no text, p_date date,
  p_item uuid, p_warehouse uuid, p_qty numeric, p_rate numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bin public.bins;
  v_value_after numeric;
begin
  v_bin := private.lock_bin(p_merchant, p_item, p_warehouse, p_date);

  if p_qty <> trunc(p_qty) and (
    select u.must_be_whole_number from public.items i join public.uoms u on u.id = i.stock_uom where i.id = p_item
  ) then
    raise exception 'whole_number_required' using errcode = '23514', detail = 'This item is counted in a unit that takes whole numbers only.';
  end if;

  v_value_after := private.currency_round(p_merchant, p_qty * p_rate);

  if p_qty = v_bin.actual_qty and v_value_after = v_bin.stock_value then
    return null;
  end if;

  return private.write_sle(
    v_bin, p_voucher_type, p_voucher_id, p_voucher_no, p_date,
    p_qty - v_bin.actual_qty, p_rate, p_qty, v_value_after,
    case when p_qty > 0 then jsonb_build_array(jsonb_build_array(p_qty, p_rate)) else '[]'::jsonb end
  );
end;
$$;

revoke execute on function private.reconcile_sle(uuid, text, uuid, text, date, uuid, uuid, numeric, numeric) from public, anon, authenticated, service_role;

-- Undo one Stock Ledger Entry on p_date: the opposite quantity at the value it moved.
--
-- ponytail: no repost engine, so the reversal is exact or refused. It is refused when the stock is no
-- longer there (insufficient_stock, unless negative stock is allowed) and when taking that value back would
-- leave the bin with value and no stock, or stock worth less than nothing (cancel_blocked) — the stock was
-- issued, sold or revalued since. What is left collapses to one FIFO layer at its average rate.
create or replace function private.reverse_sle(p_entry bigint, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sle public.stock_ledger_entries;
  v_bin public.bins;
  v_qty_after numeric;
  v_value_after numeric;
begin
  select * into v_sle from public.stock_ledger_entries s where s.id = p_entry;

  v_bin := private.lock_bin(v_sle.merchant_id, v_sle.item_id, v_sle.warehouse_id, p_date, false);
  v_qty_after := v_bin.actual_qty - v_sle.actual_qty;
  v_value_after := v_bin.stock_value - v_sle.stock_value_difference;

  if v_qty_after < 0 and not coalesce((
    select i.allow_negative_stock or coalesce(s.allow_negative_stock, false)
    from public.items i
    left join public.stock_settings s on s.merchant_id = i.merchant_id
    where i.id = v_sle.item_id
  ), false) then
    raise exception 'insufficient_stock' using errcode = '23514',
      detail = format('%s on hand, %s needed.', v_bin.actual_qty, v_sle.actual_qty);
  end if;

  if (v_qty_after >= 0 and v_value_after < 0) or (v_qty_after = 0 and v_value_after <> 0) or (v_qty_after < 0 and v_value_after > 0) then
    raise exception 'cancel_blocked' using errcode = '23514',
      detail = 'This stock has been issued, sold or counted again since; its value can no longer be taken back.';
  end if;

  perform private.write_sle(
    v_bin, v_sle.voucher_type, v_sle.voucher_id, v_sle.voucher_no, p_date,
    -v_sle.actual_qty, null, v_qty_after, v_value_after,
    case when v_qty_after > 0 then jsonb_build_array(jsonb_build_array(v_qty_after, v_value_after / v_qty_after)) else '[]'::jsonb end,
    true
  );
end;
$$;

revoke execute on function private.reverse_sle(bigint, date) from public, anon, authenticated, service_role;

-- Cancel a document's stock movements: each is reversed today, newest first, and both rows are marked
-- cancelled. Unlike the General Ledger they stay in the Stock Ledger whatever Accounts Settings say — a
-- movement of goods happened, and so did its undoing.
create or replace function private.cancel_sle(p_merchant uuid, p_voucher_type text, p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry bigint;
  v_today date := private.merchant_today(p_merchant);
begin
  for v_entry in
    select s.id from public.stock_ledger_entries s
    where s.merchant_id = p_merchant and s.voucher_type = p_voucher_type and s.voucher_id = p_voucher_id and not s.is_cancelled
    order by s.id desc
  loop
    perform private.reverse_sle(v_entry, v_today);
  end loop;

  update public.stock_ledger_entries s set is_cancelled = true
  where s.merchant_id = p_merchant and s.voucher_type = p_voucher_type and s.voucher_id = p_voucher_id and not s.is_cancelled;
end;
$$;

revoke execute on function private.cancel_sle(uuid, text, uuid) from public, anon, authenticated, service_role;


-- 5. The two doors. Security definer in `public`, so PostgREST serves them — the three rules of
-- CLAUDE.md §6.2: revoked from every role and granted to `authenticated` alone, search_path pinned with
-- every name qualified, and the caller checked inside: signed in, and holding Submit or Cancel on that
-- document type in that system (private.permitted_merchant_ids). The row is locked first, so a second tap
-- waits and then finds the document no longer a draft: one tap, one posting.
--
-- What a document posts is its own function, private.submit_<table>(id), found through the registry
-- (public.doctypes.table_name — written by migrations only, and quoted with %I): a later document adds its
-- function and its doctypes row, and these two stay as they are. A cancel is the same for every document:
-- its stock movements reversed, its accounting entries cancelled.

create or replace function public.submit_document(p_doctype text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_merchant uuid;
  v_status smallint;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select d.table_name into v_table from public.doctypes d where d.name = p_doctype and d.kind = 'document';
  if v_table is null then
    raise exception 'not_a_document' using errcode = '22023';
  end if;

  execute format('select d.merchant_id, d.docstatus from public.%I d where d.id = $1 for update', v_table)
    into v_merchant, v_status using p_id;

  -- One answer for a document that is not there and one the caller may not submit.
  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'submit')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 0 then
    raise exception 'not_a_draft' using errcode = '23514', detail = 'Only a draft can be submitted.';
  end if;

  execute format('select private.%I($1)', 'submit_' || v_table) using p_id;
  execute format('update public.%I set docstatus = 1 where id = $1', v_table) using p_id;
end;
$$;

revoke execute on function public.submit_document(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_document(text, uuid) to authenticated;

create or replace function public.cancel_document(p_doctype text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_merchant uuid;
  v_status smallint;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select d.table_name into v_table from public.doctypes d where d.name = p_doctype and d.kind = 'document';
  if v_table is null then
    raise exception 'not_a_document' using errcode = '22023';
  end if;

  execute format('select d.merchant_id, d.docstatus from public.%I d where d.id = $1 for update', v_table)
    into v_merchant, v_status using p_id;

  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'cancel')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 1 then
    raise exception 'not_submitted' using errcode = '23514', detail = 'Only a submitted document can be cancelled.';
  end if;

  perform private.cancel_sle(v_merchant, p_doctype, p_id);
  perform private.cancel_gl(v_merchant, p_doctype, p_id);
  execute format('update public.%I set docstatus = 2 where id = $1', v_table) using p_id;
end;
$$;

revoke execute on function public.cancel_document(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_document(text, uuid) to authenticated;
