-- Step 6 of the POS foundation, on ERPNext's model: Sales Tax Setup
-- (.claude/erpnext-docs/POS-System-Only-Features.md 6.1–6.5; docs.frappe.io/erpnext/setting-up-taxes,
-- /tax-category, /sales-taxes-and-charges-template, /item-tax-template, /types-in-tax-template,
-- /tax-inclusive-accounting).
--
-- 1. tax_categories: a named tax treatment (Standard, Exempt …). No rate of its own.
-- 2. sales_tax_templates + sales_tax_template_rows: the reusable tax and charge rows a POS Profile applies —
--    each row a calculation type, a ledger, a rate (or a fixed amount), optionally on an earlier row, and
--    optionally already included in the shelf price.
-- 3. item_tax_templates + item_tax_template_rows: a different rate, or Not Applicable, for particular items,
--    per tax account. Linked on an Item or Item Group later (Step 9).
-- 4. The checks ERPNext runs on save (accounts_controller.validate_taxes_and_charges, validate_inclusive_tax,
--    valdiate_taxes_and_charges_template, item_tax_template.validate_tax_accounts), held by the database.
-- 5. save_sales_tax_template / save_item_tax_template: a template and its rows in one transaction.
-- 6. Doctypes, permissions, policies.
-- 7. tax_presets and the seed: what ERPNext's setup wizard creates for the company's country
--    (setup_wizard/data/country_wise_tax.json, taxes_setup.simple_to_detailed) — a tax ledger under
--    Duties and Taxes, a Sales Taxes and Charges Template and an Item Tax Template per preset.
--
-- Out of scope, so absent: purchase tax templates (no Supplier), Tax Withholding (separate workflow),
-- Considered In Paid Amount, regional fields. The Tax Rule that picks a template is Step 7.
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Tax Categories.

create table if not exists public.tax_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  title text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint tax_categories_id_merchant unique (id, merchant_id),
  constraint tax_categories_title_unique unique (merchant_id, title),
  constraint tax_categories_title_length check (length(btrim(title)) between 1 and 140)
);

alter table public.tax_categories enable row level security;


-- 2. Sales Taxes and Charges Templates.

create table if not exists public.sales_tax_templates (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  title text not null,
  is_default boolean not null default false,
  disabled boolean not null default false,
  tax_category_id uuid,
  created_at timestamptz not null default now(),

  constraint sales_tax_templates_id_merchant unique (id, merchant_id),
  constraint sales_tax_templates_title_unique unique (merchant_id, title),
  constraint sales_tax_templates_title_length check (length(btrim(title)) between 1 and 140),
  -- "Disabled template must not be default template."
  constraint sales_tax_templates_default_enabled check (not (is_default and disabled)),
  -- A category of the same system. Deleting one a template still names fails with 23503 ("in use").
  constraint sales_tax_templates_category_fk foreign key (tax_category_id, merchant_id) references public.tax_categories (id, merchant_id)
);

alter table public.sales_tax_templates enable row level security;
create index if not exists sales_tax_templates_category_idx on public.sales_tax_templates (tax_category_id, merchant_id);

-- One default per system.
create unique index if not exists sales_tax_templates_one_default on public.sales_tax_templates (merchant_id) where is_default;

-- "Only one template is allowed with each tax category" — among the enabled ones.
create unique index if not exists sales_tax_templates_one_per_category
  on public.sales_tax_templates (merchant_id, tax_category_id) where tax_category_id is not null and not disabled;

-- Making a template the default clears the old one in the same statement, as ERPNext does on save.
-- Invoker, like private.fiscal_years_single_default: RLS decides whether the caller may touch the other row.
create or replace function private.sales_tax_templates_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.sales_tax_templates
    set is_default = false
    where merchant_id = new.merchant_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

revoke execute on function private.sales_tax_templates_single_default() from public, anon, authenticated, service_role;

drop trigger if exists sales_tax_templates_single_default on public.sales_tax_templates;
create trigger sales_tax_templates_single_default
  before insert or update of is_default on public.sales_tax_templates
  for each row execute function private.sales_tax_templates_single_default();

-- The rows, in calculation order. Amounts are computed on a transaction, never stored on the template.
create table if not exists public.sales_tax_template_rows (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  template_id uuid not null,
  idx integer not null,
  charge_type text not null,
  account uuid not null,
  description text not null,
  -- A percentage, or for On Item Quantity an amount per unit.
  rate numeric not null default 0,
  -- The fixed amount of an Actual row.
  tax_amount numeric not null default 0,
  -- Reference Row #: the earlier row a previous-row type is calculated on.
  row_id integer,
  -- "Is this Tax included in Basic Rate?"
  included_in_print_rate boolean not null default false,
  cost_center uuid,

  constraint sales_tax_template_rows_idx unique (template_id, idx),
  constraint sales_tax_template_rows_idx_positive check (idx >= 1),
  constraint sales_tax_template_rows_charge_type check (
    charge_type in ('Actual', 'On Net Total', 'On Previous Row Amount', 'On Previous Row Total', 'On Item Quantity')
  ),
  constraint sales_tax_template_rows_description_length check (length(btrim(description)) between 1 and 140),
  -- "Can refer row only if the charge type is 'On Previous Row Amount' or 'Previous Row Total'", and then
  -- only an earlier row — which also refuses a previous-row type on row 1.
  constraint sales_tax_template_rows_reference check (
    case when charge_type in ('On Previous Row Amount', 'On Previous Row Total')
      then row_id is not null and row_id between 1 and idx - 1
      else row_id is null
    end
  ),
  -- "Charge of type 'Actual' cannot be included in Item Rate."
  constraint sales_tax_template_rows_inclusive_actual check (not (included_in_print_rate and charge_type = 'Actual')),
  constraint sales_tax_template_rows_template_fk foreign key (template_id, merchant_id) references public.sales_tax_templates (id, merchant_id) on delete cascade,
  -- NO ACTION: deleting a system removes its accounts and rows in one statement; deleting an account a row
  -- names fails with 23503 ("in use").
  constraint sales_tax_template_rows_account_fk foreign key (account, merchant_id) references public.accounts (id, merchant_id),
  constraint sales_tax_template_rows_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.sales_tax_template_rows enable row level security;
create index if not exists sales_tax_template_rows_template_idx on public.sales_tax_template_rows (template_id, merchant_id);
create index if not exists sales_tax_template_rows_account_idx on public.sales_tax_template_rows (account, merchant_id);
create index if not exists sales_tax_template_rows_cost_center_idx on public.sales_tax_template_rows (cost_center, merchant_id);


-- 3. Item Tax Templates.

create table if not exists public.item_tax_templates (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  title text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint item_tax_templates_id_merchant unique (id, merchant_id),
  constraint item_tax_templates_title_unique unique (merchant_id, title),
  constraint item_tax_templates_title_length check (length(btrim(title)) between 1 and 140)
);

alter table public.item_tax_templates enable row level security;

create table if not exists public.item_tax_template_rows (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  template_id uuid not null,
  idx integer not null,
  -- ERPNext's "Tax" column: the tax account whose rate this overrides.
  account uuid not null,
  tax_rate numeric not null default 0,
  -- The tax does not apply to the item at all — not the same as 0% for reporting.
  not_applicable boolean not null default false,

  -- "{account} entered twice in Item Tax."
  constraint item_tax_template_rows_account_unique unique (template_id, account),
  constraint item_tax_template_rows_template_fk foreign key (template_id, merchant_id) references public.item_tax_templates (id, merchant_id) on delete cascade,
  constraint item_tax_template_rows_account_fk foreign key (account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.item_tax_template_rows enable row level security;
create index if not exists item_tax_template_rows_template_idx on public.item_tax_template_rows (template_id, merchant_id);
create index if not exists item_tax_template_rows_account_idx on public.item_tax_template_rows (account, merchant_id);


-- 4. The checks.

-- A tax row's account is an enabled ledger of the types ERPNext's tax tables offer; a sales row's cost
-- center an enabled ledger. Security definer, as private.validate_mode_of_payment_account is: a User
-- Permission must not hide the account from the check.
create or replace function private.validate_tax_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select not a.is_group and not a.disabled
    and a.account_type = any (array['Tax', 'Chargeable', 'Income Account', 'Expense Account', 'Expenses Included In Valuation'])
  into v_ok
  from public.accounts a where a.id = new.account and a.merchant_id = new.merchant_id;

  if not coalesce(v_ok, false) then
    raise exception 'tax_account_invalid' using errcode = '23514',
      detail = 'A tax row''s account is an enabled ledger of type Tax, Chargeable, Income Account, Expense Account or Expenses Included In Valuation.';
  end if;

  -- Nested, not and-ed: item_tax_template_rows has no cost_center (the 42703 trap,
  -- 20261008224129_tree_and_profile_fixes.sql).
  if tg_table_name = 'sales_tax_template_rows' then
    if new.cost_center is not null then
      select not c.is_group and not c.disabled into v_ok
      from public.cost_centers c where c.id = new.cost_center and c.merchant_id = new.merchant_id;

      if not coalesce(v_ok, false) then
        raise exception 'tax_cost_center_invalid' using errcode = '23514', detail = 'A tax row''s cost center is an enabled ledger.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_tax_account() from public, anon, authenticated, service_role;

drop trigger if exists sales_tax_template_rows_validate_account on public.sales_tax_template_rows;
create trigger sales_tax_template_rows_validate_account
  before insert or update of account, cost_center on public.sales_tax_template_rows
  for each row execute function private.validate_tax_account();

drop trigger if exists item_tax_template_rows_validate_account on public.item_tax_template_rows;
create trigger item_tax_template_rows_validate_account
  before insert or update of account on public.item_tax_template_rows
  for each row execute function private.validate_tax_account();

-- The rules that read other rows of the template (ERPNext validate_inclusive_tax): a Reference Row # names a
-- row that exists; an inclusive tax calculated on an earlier row needs that row inclusive (On Previous Row
-- Amount) or every row up to it inclusive (On Previous Row Total). A deferred constraint trigger, so a save
-- that replaces all rows is checked once they are all in place, at commit. Checks the whole template, so a
-- change to the referenced row is caught too.
create or replace function private.validate_tax_row_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid := coalesce(new.template_id, old.template_id);
begin
  if exists (
    select 1 from public.sales_tax_template_rows r
    where r.template_id = v_template and r.row_id is not null
      and not exists (select 1 from public.sales_tax_template_rows p where p.template_id = r.template_id and p.idx = r.row_id)
  ) then
    raise exception 'tax_row_reference_missing' using errcode = '23514', detail = 'A Reference Row # names a row of the same template.';
  end if;

  if exists (
    select 1 from public.sales_tax_template_rows r
    where r.template_id = v_template and r.included_in_print_rate and (
      (r.charge_type = 'On Previous Row Amount' and exists (
        select 1 from public.sales_tax_template_rows p
        where p.template_id = r.template_id and p.idx = r.row_id and not p.included_in_print_rate
      ))
      or (r.charge_type = 'On Previous Row Total' and exists (
        select 1 from public.sales_tax_template_rows p
        where p.template_id = r.template_id and p.idx <= r.row_id and not p.included_in_print_rate
      ))
    )
  ) then
    raise exception 'tax_inclusive_reference' using errcode = '23514',
      detail = 'To include a tax in the rate, the rows it is calculated on must be included too.';
  end if;
  return null;
end;
$$;

revoke execute on function private.validate_tax_row_references() from public, anon, authenticated, service_role;

drop trigger if exists sales_tax_template_rows_validate_references on public.sales_tax_template_rows;
create constraint trigger sales_tax_template_rows_validate_references
  after insert or update or delete on public.sales_tax_template_rows
  deferrable initially deferred
  for each row execute function private.validate_tax_row_references();


-- 5. Saving a template with its rows. Security invoker, like public.save_role_profile: the caller's own
-- policies decide every row. The rows are replaced as a set; idx is their order in the payload.

create or replace function public.save_sales_tax_template(payload jsonb)
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
    insert into public.sales_tax_templates (merchant_id, title, is_default, disabled, tax_category_id)
    values (
      v_merchant,
      btrim(payload ->> 'title'),
      coalesce((payload ->> 'is_default')::boolean, false),
      coalesce((payload ->> 'disabled')::boolean, false),
      nullif(payload ->> 'tax_category_id', '')::uuid
    )
    returning id into v_id;
  else
    update public.sales_tax_templates set
      title = btrim(payload ->> 'title'),
      is_default = coalesce((payload ->> 'is_default')::boolean, false),
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      tax_category_id = nullif(payload ->> 'tax_category_id', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.sales_tax_template_rows where template_id = v_id;

  insert into public.sales_tax_template_rows (
    merchant_id, template_id, idx, charge_type, account, description, rate, tax_amount, row_id, included_in_print_rate, cost_center
  )
  select
    v_merchant, v_id, r.idx::integer,
    r.value ->> 'charge_type',
    (r.value ->> 'account')::uuid,
    btrim(r.value ->> 'description'),
    coalesce(nullif(r.value ->> 'rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'tax_amount', '')::numeric, 0),
    nullif(r.value ->> 'row_id', '')::integer,
    coalesce((r.value ->> 'included_in_print_rate')::boolean, false),
    nullif(r.value ->> 'cost_center', '')::uuid
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_sales_tax_template(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_sales_tax_template(jsonb) to authenticated;

create or replace function public.save_item_tax_template(payload jsonb)
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
    insert into public.item_tax_templates (merchant_id, title, disabled)
    values (v_merchant, btrim(payload ->> 'title'), coalesce((payload ->> 'disabled')::boolean, false))
    returning id into v_id;
  else
    update public.item_tax_templates set
      title = btrim(payload ->> 'title'),
      disabled = coalesce((payload ->> 'disabled')::boolean, false)
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_tax_template_rows where template_id = v_id;

  insert into public.item_tax_template_rows (merchant_id, template_id, idx, account, tax_rate, not_applicable)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'account')::uuid,
    coalesce(nullif(r.value ->> 'tax_rate', '')::numeric, 0),
    coalesce((r.value ->> 'not_applicable')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;

revoke execute on function public.save_item_tax_template(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_item_tax_template(jsonb) to authenticated;


-- 6. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Tax Category', 'tax_categories', 'record', false),
  ('Sales Taxes and Charges Template', 'sales_tax_templates', 'record', false),
  ('Item Tax Template', 'item_tax_templates', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Accounts Manager', 'Tax Category', true, true, true, true, true),
  ('Accounts User', 'Tax Category', true, true, false, false, false),
  ('Sales User', 'Tax Category', true, true, false, false, false),
  ('All', 'Tax Category', true, false, false, false, false),

  ('Accounts Manager', 'Sales Taxes and Charges Template', true, true, true, true, true),
  ('Sales Master Manager', 'Sales Taxes and Charges Template', true, true, true, true, true),
  ('Accounts User', 'Sales Taxes and Charges Template', true, true, false, false, false),
  ('Sales User', 'Sales Taxes and Charges Template', true, true, false, false, false),
  ('All', 'Sales Taxes and Charges Template', true, false, false, false, false),

  ('Accounts Manager', 'Item Tax Template', true, true, true, true, true),
  ('Accounts User', 'Item Tax Template', true, true, false, false, false),
  ('Sales User', 'Item Tax Template', true, true, false, false, false),
  ('All', 'Item Tax Template', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('tax_categories', 'Tax Category');
select private.apply_doctype_policies('sales_tax_templates', 'Sales Taxes and Charges Template');
select private.apply_doctype_policies('sales_tax_template_rows', 'Sales Taxes and Charges Template', true);
select private.apply_doctype_policies('item_tax_templates', 'Item Tax Template');
select private.apply_doctype_policies('item_tax_template_rows', 'Item Tax Template', true);


-- 7. Seeding, as ERPNext's setup wizard does for the company's country.

-- ERPNext's setup_wizard/data/country_wise_tax.json (GPL-3.0, (c) Frappe Technologies), the entries in its
-- simple format { template: { account_name, tax_rate, default } } — 212 templates for 165 countries, matched
-- to public.countries by name (and by hand for the 12 its file spells differently). Australia, France,
-- Germany and Sweden have only the chart-specific format there, so they get no preset.
-- ponytail: their detailed format, if a shop there needs it.
create table if not exists public.tax_presets (
  country_code text not null references public.countries (code),
  template text not null,
  account_name text not null,
  tax_rate numeric not null,
  is_default boolean not null default false,

  primary key (country_code, template)
);

-- Reference data: RLS on, read by any signed-in user, written only by a migration (CLAUDE.md §6.1).
alter table public.tax_presets enable row level security;

drop policy if exists tax_presets_select on public.tax_presets;
create policy tax_presets_select on public.tax_presets
  for select to authenticated
  using (true);

insert into public.tax_presets (country_code, template, account_name, tax_rate, is_default)
values
  ('AD', 'Andorra VAT', 'VAT', 4.5, false),
  ('AE', 'UAE Excise 100%', 'Excise 100%', 100, false),
  ('AE', 'UAE Excise 50%', 'Excise 50%', 50, false),
  ('AE', 'UAE VAT 5%', 'VAT 5%', 5, false),
  ('AE', 'UAE VAT Exempted', 'VAT Exempted', 0, false),
  ('AE', 'UAE VAT Zero', 'VAT Zero', 0, false),
  ('AG', 'Antigua & Barbuda Sales Tax', 'ABST', 15, false),
  ('AL', 'Albania VAT', 'VAT', 20, false),
  ('AM', 'Armenia Tax', 'VAT', 20, false),
  ('AO', 'Angola VAT', 'VAT', 10, false),
  ('AR', 'Argentina Tax', 'VAT', 21, false),
  ('AT', 'Austria Tax', 'VAT', 20, false),
  ('AW', 'Aruba Tax', 'VAT', 1.5, false),
  ('AZ', 'Azerbaijan Tax', 'GST', 18, false),
  ('BA', 'Bosnia & Herzegovina Tax', 'VAT', 17, false),
  ('BB', 'Barbados Tax', 'VAT', 17.5, false),
  ('BD', 'Bangladesh Tax', 'VAT', 15, false),
  ('BE', 'Belgium VAT 0%', 'VAT 0%', 0, false),
  ('BE', 'Belgium VAT 12%', 'VAT 12%', 12, false),
  ('BE', 'Belgium VAT 21%', 'VAT 21%', 21, true),
  ('BE', 'Belgium VAT 6%', 'VAT 6%', 6, false),
  ('BF', 'Burkina Faso Tax', 'VAT', 18, false),
  ('BG', 'Bulgaria VAT 20%', 'VAT 20%', 20, true),
  ('BG', 'Bulgaria VAT 7%', 'VAT 7%', 7, false),
  ('BI', 'Burundi Tax', 'VAT', 18, false),
  ('BJ', 'Benin Tax', 'VAT', 18, false),
  ('BO', 'Bolivia Tax', 'VAT', 13, false),
  ('BR', 'Brazil COFINS 5.0%', 'ISS 5%', 5, false),
  ('BR', 'Brazil COFINS 7.6%', 'COFINS 7.6%', 7.6, false),
  ('BR', 'Brazil ICMS 17%', 'ICMS 17%', 17, false),
  ('BR', 'Brazil ICMS 19%', 'ICMS 19%', 19, true),
  ('BR', 'Brazil PIS 1.65%', 'PIS 1.65%', 1.65, false),
  ('BS', 'Bahamas Tax', 'VAT', 7.5, false),
  ('BT', 'Bhutan Tax', 'VAT', 50, false),
  ('BW', 'Botswana Tax 12%', 'VAT', 12, true),
  ('BW', 'Botswana Tax 14%', 'VAT', 14, false),
  ('BY', 'Belarus Tax', 'VAT', 20, false),
  ('BZ', 'Belize Tax', 'GST', 12.5, false),
  ('CA', 'Canada GST 5%', 'GST', 5, true),
  ('CA', 'Canada HST 15%', 'HST', 15, false),
  ('CA', 'Canada PST 5%', 'PST 5%', 5, false),
  ('CA', 'Canada PST 7%', 'PST 7%', 7, false),
  ('CA', 'Canada PST 8%', 'PST 8%', 8, false),
  ('CF', 'Central African Republic Tax', 'VAT', 19, false),
  ('CG', 'Congo Tax', 'VAT', 16, false),
  ('CH', 'Switzerland lodging VAT', 'VAT 3.8%', 3.8, false),
  ('CH', 'Switzerland normal VAT', 'VAT 8.1%', 8.1, true),
  ('CH', 'Switzerland reduced VAT', 'VAT 2.6%', 2.6, false),
  ('CI', 'Ivory Coast', 'Metric', 18, false),
  ('CL', 'Chile Tax', 'VAT', 19, false),
  ('CM', 'Cameroon Tax', 'VAT', 19.25, false),
  ('CN', 'China Tax', 'VAT', 17, false),
  ('CO', 'Colombia Tax', 'VAT', 16, false),
  ('CR', 'Costa Rica', 'VAT', 13, false),
  ('CU', 'Cuba Tax', 'VAT', 20, false),
  ('CV', 'Cape Verde Tax', 'VAT', 15, false),
  ('CY', 'Cyprus Tax', 'VAT', 18, false),
  ('CZ', 'Czech Republic VAT 15%', 'VAT 15%', 15, false),
  ('CZ', 'Czech Republic VAT 21%', 'VAT 21%', 21, true),
  ('DJ', 'Dijbouti Tax', 'VAT', 33, false),
  ('DK', 'Denmark Tax', 'VAT', 25, false),
  ('DM', 'Dominica Tax', 'VAT', 15, false),
  ('DO', 'Dominican Republic Tax', 'ITBIS', 16, false),
  ('DZ', 'Algeria TVA 19%', 'TVA 19%', 19, true),
  ('DZ', 'Algeria TVA 9%', 'TVA 9%', 9, false),
  ('EC', 'Ecuador Tax', 'VAT', 12, false),
  ('EE', 'Estonia Tax', 'VAT', 20, false),
  ('EG', 'Egypt Tax', 'GST', 10, false),
  ('ER', 'Eritrea Tax', 'VAT', 4, false),
  ('ES', 'Spain Tax', 'VAT', 21, false),
  ('ET', 'Ethiopia Tax', 'VAT', 15, false),
  ('FI', 'Finland Tax', 'VAT', 24, false),
  ('FJ', 'Fiji Tax', 'VAT', 15, false),
  ('FM', 'Micronesia Tax', 'VAT', 5, false),
  ('GA', 'Gabon Tax', 'VAT', 18, false),
  ('GB', 'United Kingdom Tax', 'VAT', 20, false),
  ('GD', 'Grenada Tax', 'VAT', 15, false),
  ('GE', 'Georgia Tax', 'VAT', 18, false),
  ('GH', 'Ghana Tax', 'VAT', 15, false),
  ('GM', 'Gambia Tax', 'VAT', 15, false),
  ('GN', 'Guinea Tax', 'VAT', 18, false),
  ('GQ', 'Equatorial Guinea', 'VAT', 15, false),
  ('GR', 'Greece VAT 23%', 'VAT 23%', 23, true),
  ('GR', 'Greece VAT 9%', 'VAT 9%', 9, false),
  ('GT', 'Guatemala Tax', 'IVA', 12, false),
  ('GU', 'Guam Tax', 'VAT', 4, false),
  ('GY', 'Guyana Tax', 'GST', 16, false),
  ('HN', 'Honduras Tax', 'VAT', 15, false),
  ('HR', 'Croatia VAT 10%', 'VAT 10%', 10, false),
  ('HR', 'Croatia VAT 25%', 'VAT 25%', 25, true),
  ('HT', 'Haiti Tax', 'VAT', 10, false),
  ('HU', 'Hungary Tax', 'VAT', 27, false),
  ('ID', 'Purchase Tax', 'PPN Masukan', 11, false),
  ('ID', 'Sales Tax', 'PPN Keluaran', 11, false),
  ('IE', 'Ireland Tax', 'VAT', 23, false),
  ('IL', 'Israel Tax', 'VAT', 18, false),
  ('IM', 'Isle of Man VAT 20%', 'VAT', 20, true),
  ('IM', 'Isle of Man VAT 5%', 'VAT', 5, false),
  ('IR', 'Iran Tax', 'VAT', 7, false),
  ('IS', 'Iceland VAT 25.5%', 'VAT 25.5%', 25.5, true),
  ('IS', 'Iceland VAT 7.5%', 'VAT 7.5%', 7.5, false),
  ('IT', 'Italy VAT 10%', 'IVA 10%', 10, false),
  ('IT', 'Italy VAT 22%', 'IVA 22%', 22, true),
  ('IT', 'Italy VAT 4%', 'IVA 4%', 4, false),
  ('JM', 'Jamaica Tax', 'GCT', 16.5, false),
  ('JO', 'Jordan Tax', 'VAT', 16, false),
  ('JP', 'Japan Tax 10%', 'CT 10%', 10, true),
  ('JP', 'Japan Tax 8%', 'CT 8%', 8, false),
  ('KE', 'Kenya Tax', 'VAT', 16, false),
  ('KG', 'Kyrgyztan Tax', 'VAT', 12, false),
  ('KH', 'Cambodia Tax', 'VAT', 10, false),
  ('KM', 'Comoros Tax', 'VAT', 10, false),
  ('KP', 'North Korea', 'VAT', 15, false),
  ('KR', 'South Korea Tax', 'VAT', 10, false),
  ('KZ', 'Kazakhstan Tax', 'VAT', 12, false),
  ('LA', 'Lao Republic Tax', 'VAT', 10, false),
  ('LB', 'Lebanon Tax', 'VAT', 10, false),
  ('LC', 'St Lucia Tax', 'VAT', 15, false),
  ('LI', 'Liechtenstein Tax', 'VAT', 8, false),
  ('LK', 'Sri Lanka Tax', 'VAT', 12, false),
  ('LT', 'Lithunia Tax', 'VAT', 21, false),
  ('LU', 'Luxembourg VAT 15%', 'VAT 15%', 15, true),
  ('LU', 'Luxembourg VAT 3%', 'VAT 3%', 3, false),
  ('LV', 'Latvia Tax', 'VAT', 20, false),
  ('MA', 'Morroco VAT 10%', 'VAT 10%', 10, false),
  ('MA', 'Morroco VAT 20%', 'VAT 20%', 20, true),
  ('MC', 'Monaco Tax 19.6%', 'VAT 19.6%', 19.6, true),
  ('MC', 'Monaco Tax 5.5%', 'VAT 5,5%', 5.5, false),
  ('MD', 'Moldova VAT 20%', 'VAT 20%', 20, true),
  ('MD', 'Moldova VAT 8%', 'VAT 8%', 8, false),
  ('ME', 'Montenegro Tax 17%', 'VAT 17%', 17, true),
  ('ME', 'Montenegro Tax 7%', 'VAT 7%', 7, false),
  ('MG', 'Madagascar Tax', 'VAT', 20, false),
  ('MK', 'Macedonia VAT 18%', 'VAT', 18, true),
  ('MK', 'Macedonia VAT 5%', 'VAT', 5, false),
  ('ML', 'Mali Tax', 'VAT', 18, false),
  ('MM', 'Myanamar Tax', 'VAT', 30, false),
  ('MN', 'Mongolia Tax', 'VAT', 10, false),
  ('MR', 'Mauritania Tax', 'VAT', 18, false),
  ('MT', 'Malta Tax', 'VAT', 18, false),
  ('MU', 'Mauritius Tax', 'VAT', 15, false),
  ('MW', 'Malawi Tax', 'VAT', 16.5, false),
  ('MX', 'Mexico Tax', 'IVA', 16, false),
  ('MY', 'Malaysia GST 10%', 'GST', 10, false),
  ('MY', 'Malaysia GST 5%', 'GST', 5, false),
  ('MY', 'Malaysia GST 6%', 'GST', 6, true),
  ('MZ', 'Mozambique Tax', 'VAT', 17, false),
  ('NA', 'Namibia Tax', 'VAT', 15, false),
  ('NG', 'Nigeria Tax', 'VAT', 5, false),
  ('NI', 'Nicaragua Tax', 'VAT', 15, false),
  ('NL', 'Netherlands VAT 21%', 'VAT 21%', 21, true),
  ('NL', 'Netherlands VAT 6%', 'VAT 6%', 6, false),
  ('NO', 'Norway VAT 12%', 'VAT 12%', 12, false),
  ('NO', 'Norway VAT 25%', 'VAT 25%', 25, true),
  ('NP', 'Nepal Tax', 'VAT', 13, false),
  ('NZ', 'New Zealand', 'GST', 15, false),
  ('PA', 'Panama Tax', 'VAT', 7, false),
  ('PE', 'Peru Tax', 'VAT', 16, false),
  ('PG', 'Papua New Guinea Tax', 'VAT', 10, false),
  ('PH', 'Philippines Tax', 'VAT', 12, false),
  ('PK', 'Pakistan Tax', 'GST', 17, false),
  ('PL', 'Poland VAT 23%', 'VAT 23%', 23, true),
  ('PL', 'Poland VAT 7%', 'VAT 7%', 7, false),
  ('PT', 'Portugal Tax', 'VAT', 23, false),
  ('PY', 'Paraguay Tax', 'VAT', 10, false),
  ('RO', 'Romania Tax', 'VAT', 24, false),
  ('RS', 'Serbia Tax', 'VAT', 20, false),
  ('RU', 'Russia VAT 10%', 'VAT 10%', 10, false),
  ('RU', 'Russia VAT 18%', 'VAT 18%', 18, true),
  ('RW', 'Rwanda Tax', 'VAT', 18, false),
  ('SB', 'Solomon Islands Tax', 'VAT', 15, false),
  ('SC', 'Seychelles Tax', 'VAT', 15, false),
  ('SD', 'Sudan Tax', 'VAT', 10, false),
  ('SG', 'Singapore Tax', 'GST', 7, false),
  ('SI', 'Slovenia VAT 22%', 'VAT 22%', 22, true),
  ('SI', 'Slovenia VAT 8.5%', 'VAT 8.5%', 8.5, false),
  ('SK', 'Slovakia VAT 10%', 'VAT 10%', 10, false),
  ('SK', 'Slovakia VAT 20%', 'VAT 20%', 20, true),
  ('SL', 'Sierra Leone Tax', 'VAT', 15, false),
  ('SN', 'Senegal Tax', 'VAT', 18, false),
  ('SO', 'Somalia Tax', 'VAT', 10, false),
  ('SR', 'Suriname Tax', 'VAT', 10, false),
  ('SV', 'El Salvador Tax', 'VAT', 13, false),
  ('SZ', 'Swaziland tax', 'VAT', 14, false),
  ('TD', 'Chad Tax', 'VAT', 18, false),
  ('TG', 'Togo Tax', 'VAT', 18, false),
  ('TH', 'Thailand Tax', 'VAT', 7, false),
  ('TJ', 'Tajikistan Tax', 'VAT', 20, false),
  ('TM', 'Turkmenistan Tax', 'VAT', 20, false),
  ('TN', 'Tunisia VAT 12%', 'VAT 12%', 12, false),
  ('TN', 'Tunisia VAT 18%', 'VAT 18%', 18, true),
  ('TN', 'Tunisia VAT 6%', 'VAT 6%', 6, false),
  ('TO', 'Tonga Tax', 'VAT', 15, false),
  ('TR', 'Turkey Tax', 'VAT 18%', 18, false),
  ('TT', 'Trinidad & Tobago Tax', 'VAT', 15, false),
  ('TW', 'Taiwan Tax', 'VAT', 5, false),
  ('TZ', 'Tanzania Tax', 'VAT', 18, false),
  ('UA', 'Ukraine Tax', 'VAT', 20, false),
  ('UG', 'Uganda Tax', 'VAT', 18, false),
  ('US', 'US ST 4%', 'ST 4%', 4, false),
  ('US', 'US ST 6%', 'ST 6%', 6, true),
  ('US', 'US ST 6.25%', 'ST 6.25%', 6.25, false),
  ('UY', 'Uruguay Tax', 'VAT', 22, false),
  ('UZ', 'Uzbekistan Tax', 'VAT', 20, false),
  ('VE', 'Venezuela Tax', 'VAT', 12, false),
  ('VN', 'Vietnam Tax', 'VAT', 10, false),
  ('VU', 'Vanuatu Tax', 'VAT', 12.5, false),
  ('XK', 'Kosovo Tax', 'VAT', 16, false),
  ('YE', 'Yemen Tax', 'VAT', 5, false),
  ('ZA', 'South Africa Tax', 'VAT', 15, false),
  ('ZM', 'Zambia Tax', 'VAT', 16, false),
  ('ZW', 'Zimbabwe Tax', 'VAT', 15, false)
on conflict (country_code, template) do nothing;

-- One system's presets: the tax ledger under the Tax group (Duties and Taxes), a Sales Taxes and Charges
-- Template of one On Net Total row — described "<account> @ <rate>" and tagged with the company's cost
-- center, as taxes_setup.make_taxes_and_charges_template does — and an Item Tax Template of the same title.
-- Re-runnable: what exists is left alone. A preset whose account name the owner already uses for something
-- other than a tax ledger is left out.
create or replace function private.seed_taxes_for(p_merchant uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_country text;
  v_cost_center uuid;
  v_group uuid;
  v_preset record;
  v_account uuid;
  v_template uuid;
begin
  select m.country_code, m.cost_center into v_country, v_cost_center from public.merchants m where m.id = p_merchant;

  select a.id into v_group
  from public.accounts a
  where a.merchant_id = p_merchant and a.is_group and a.root_type = 'Liability' and a.account_type = 'Tax'
  order by a.created_at
  limit 1;

  if v_group is null then
    return;
  end if;

  for v_preset in
    select p.* from public.tax_presets p where p.country_code = v_country order by p.template
  loop
    v_account := private.seed_account(p_merchant, v_preset.account_name, v_group, false, 'Liability', 'Tax');

    if not exists (
      select 1 from public.accounts a where a.id = v_account and a.account_type = 'Tax' and not a.is_group and not a.disabled
    ) then
      continue;
    end if;

    insert into public.sales_tax_templates (merchant_id, title, is_default)
    values (p_merchant, v_preset.template, v_preset.is_default)
    on conflict (merchant_id, title) do nothing
    returning id into v_template;

    if v_template is not null then
      insert into public.sales_tax_template_rows (merchant_id, template_id, idx, charge_type, account, description, rate, cost_center)
      values (
        p_merchant, v_template, 1, 'On Net Total', v_account,
        v_preset.account_name || ' @ ' || trim_scale(v_preset.tax_rate)::text, v_preset.tax_rate, v_cost_center
      );
    end if;

    insert into public.item_tax_templates (merchant_id, title)
    values (p_merchant, v_preset.template)
    on conflict (merchant_id, title) do nothing
    returning id into v_template;

    if v_template is not null then
      insert into public.item_tax_template_rows (merchant_id, template_id, idx, account, tax_rate)
      values (p_merchant, v_template, 1, v_account, v_preset.tax_rate);
    end if;
  end loop;
end;
$$;

revoke execute on function private.seed_taxes_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_taxes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_taxes_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_taxes() from public, anon, authenticated, service_role;

-- After merchants_seed_40_accounting (the Tax group) and merchants_seed_50_accounting_defaults (the
-- company's cost center), by name.
drop trigger if exists merchants_seed_70_taxes on public.merchants;
create trigger merchants_seed_70_taxes
  after insert on public.merchants
  for each row execute function private.seed_taxes();

-- The systems that already exist.
select private.seed_taxes_for(m.id) from public.merchants m;
