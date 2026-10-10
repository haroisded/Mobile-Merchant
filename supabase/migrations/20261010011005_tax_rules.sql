-- Step 7 of the POS foundation, on ERPNext's model: Tax Rule
-- (.claude/erpnext-docs/POS-System-Only-Features.md 7.1; docs.frappe.io/erpnext/tax-rule).
--
-- tax_rules: which Sales Taxes and Charges Template a sale takes, chosen from its context — a tax category, an
-- item group, the date — and a priority. A rule only selects a template; the template's rows do the tax.
--
-- Picking the rule for a sale is src/features/tax-rules/resolve.ts, as the tax arithmetic is
-- calculate.ts: the POS Invoice builds its sale on the device. Rejected: a resolve RPC here — a second copy of
-- the same ranking for nothing to call yet.
--
-- Out of scope, so absent: Purchase rules and the Purchase Tax Template (no Supplier), Customer and Customer
-- Group, Supplier, Item (no Item yet), billing and shipping locations (no Address), Use for Shopping Cart, and
-- Company (one company). Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  sales_tax_template_id uuid not null,
  -- A blank condition matches every sale; each one filled in narrows the rule.
  tax_category_id uuid,
  item_group_id uuid,
  from_date date,
  to_date date,
  -- 1 is the highest: among rules that match as closely, the lowest number wins.
  priority integer not null default 1,
  created_at timestamptz not null default now(),

  constraint tax_rules_id_merchant unique (id, merchant_id),
  constraint tax_rules_priority check (priority >= 1),
  -- "From Date cannot be greater than To Date."
  constraint tax_rules_dates check (from_date is null or to_date is null or from_date <= to_date),
  -- Deleting a template, category or item group a rule names fails with 23503 ("in use").
  constraint tax_rules_template_fk foreign key (sales_tax_template_id, merchant_id) references public.sales_tax_templates (id, merchant_id),
  constraint tax_rules_category_fk foreign key (tax_category_id, merchant_id) references public.tax_categories (id, merchant_id),
  constraint tax_rules_item_group_fk foreign key (item_group_id, merchant_id) references public.item_groups (id, merchant_id),
  -- ERPNext's "Tax Rule Conflicts with …": the same conditions at the same priority on overlapping dates
  -- (23P01). A blank condition counts as its own value; a blank date as open-ended. btree_gist is installed by
  -- 20261008101635_company_and_fiscal_year.sql.
  constraint tax_rules_no_conflict exclude using gist (
    merchant_id with =,
    (coalesce(tax_category_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(item_group_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    priority with =,
    (daterange(from_date, to_date, '[]')) with &&
  )
);

alter table public.tax_rules enable row level security;
create index if not exists tax_rules_template_idx on public.tax_rules (sales_tax_template_id, merchant_id);
create index if not exists tax_rules_category_idx on public.tax_rules (tax_category_id, merchant_id);
create index if not exists tax_rules_item_group_idx on public.tax_rules (item_group_id, merchant_id);


-- Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). No seed: ERPNext
-- makes no rule, and one tax treatment needs none.

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Tax Rule', 'tax_rules', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Accounts Manager', 'Tax Rule', true, true, true, true, true),
  ('Sales Master Manager', 'Tax Rule', true, true, true, true, true),
  ('Accounts User', 'Tax Rule', true, true, false, false, false),
  ('Sales User', 'Tax Rule', true, true, false, false, false),
  ('All', 'Tax Rule', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('tax_rules', 'Tax Rule');
