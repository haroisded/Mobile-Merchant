-- Step 2 of the POS foundation, on ERPNext's model: Site Defaults & Money Formatting
-- (.claude/erpnext-docs/POS-System-Only-Features.md 2.1–2.4; docs.frappe.io/erpnext/global-defaults,
-- /system-settings, /currency, /set-precision).
--
-- 1. system_settings: time zone, number format, Float and Currency Precision, Rounding Method. A single:
--    one row per system.
-- 2. global_defaults: Disable Rounded Total and Disable In Words. ERPNext's Default Company, Country and
--    Currency are this app's Company (a system IS its company), so they are not repeated here.
-- 3. currencies: the base currency's display rules — symbol, fraction, smallest coin, number format. One
--    row per currency a system uses; today that is its company's, kept in step with
--    merchants.default_currency. Multi-currency is out of scope.
-- 4. Their doctypes and standard permissions, their policies, and the seed that makes each system's rows.
--
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;

-- ERPNext's number formats (frappe get_number_format_info), the list both System Settings and Currency
-- choose from. countries and currency_presets were seeded with these exact strings.
create or replace function private.is_number_format(p_format text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_format in (
    '#,###.##', '#.###,##', '# ###.##', '# ###,##', '#''###.##', '#, ###.##', '#,##,###.##', '#,###.###', '#.###', '#,###'
  );
$$;

-- A check constraint runs its function as the writing role, so `authenticated` keeps execute on this one;
-- it only compares a string with a list.
revoke execute on function private.is_number_format(text) from public, anon, authenticated, service_role;
grant execute on function private.is_number_format(text) to authenticated;


-- 1. System Settings.

create table if not exists public.system_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- ERPNext: set before transactions begin. An IANA name, checked by the trigger below.
  time_zone text not null,
  number_format text not null default '#,###.##',
  -- Decimal places for quantities and for amounts. ERPNext leaves Currency Precision blank to mean "from
  -- the number format"; here it always has a value.
  float_precision smallint not null default 3,
  currency_precision smallint not null default 2,
  rounding_method text not null default 'Banker''s Rounding',

  constraint system_settings_number_format check (private.is_number_format(number_format)),
  constraint system_settings_float_precision check (float_precision between 0 and 9),
  constraint system_settings_currency_precision check (currency_precision between 0 and 9),
  constraint system_settings_rounding_method check (rounding_method in ('Banker''s Rounding', 'Commercial Rounding'))
);

alter table public.system_settings enable row level security;

-- A check constraint cannot read pg_timezone_names, so a trigger does: a misspelt zone would otherwise
-- reach every timestamp the system shows.
create or replace function private.validate_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown_time_zone' using errcode = '23514', detail = format('%s is not a time zone.', new.time_zone);
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_time_zone() from public, anon, authenticated, service_role;

drop trigger if exists system_settings_time_zone on public.system_settings;
create trigger system_settings_time_zone
  before insert or update of time_zone on public.system_settings
  for each row execute function private.validate_time_zone();


-- 2. Global Defaults.

create table if not exists public.global_defaults (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- Rounded Total is the grand total cash-rounded (Currency's Smallest Currency Fraction Value); In Words
  -- is the amount written out on the receipt.
  disable_rounded_total boolean not null default false,
  disable_in_words boolean not null default false
);

alter table public.global_defaults enable row level security;


-- 3. Currency.

create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  code text not null references public.currency_presets (code),
  enabled boolean not null default true,
  symbol text,
  -- The sub-unit's name for amounts in words ("Centavo"), and how many make one unit (100).
  fraction text,
  fraction_units integer,
  -- The smallest coin in circulation, for cash rounding (0.05 for CHF). Null: Rounded Total rounds to a
  -- whole unit, as ERPNext does.
  smallest_currency_fraction_value numeric,
  number_format text not null,
  symbol_on_right boolean not null default false,

  constraint currencies_id_merchant unique (id, merchant_id),
  constraint currencies_code_unique unique (merchant_id, code),
  constraint currencies_symbol_length check (symbol is null or length(symbol) <= 10),
  constraint currencies_fraction_length check (fraction is null or length(fraction) <= 40),
  constraint currencies_fraction_units check (fraction_units is null or fraction_units >= 0),
  constraint currencies_smallest_fraction check (smallest_currency_fraction_value is null or smallest_currency_fraction_value > 0),
  constraint currencies_number_format check (private.is_number_format(number_format))
);

alter table public.currencies enable row level security;
create index if not exists currencies_code_idx on public.currencies (code);

-- The base currency's row, copied from the preset when a system starts using a currency. Existing rows are
-- left as edited.
create or replace function private.ensure_currency(p_merchant uuid, p_code text)
returns void
language sql
set search_path = ''
as $$
  insert into public.currencies (merchant_id, code, symbol, fraction, fraction_units, smallest_currency_fraction_value, number_format)
  select p_merchant, p.code, p.symbol, p.fraction, p.fraction_units, p.smallest_currency_fraction_value, p.number_format
  from public.currency_presets p
  where p.code = p_code
  on conflict (merchant_id, code) do nothing;
$$;

revoke execute on function private.ensure_currency(uuid, text) from public, anon, authenticated, service_role;

-- A Company whose currency changes gets that currency's row. Security definer: whoever may write the
-- Company may make this row, whether or not they may create Currencies.
create or replace function private.company_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.id not in (select private.permitted_merchant_ids('Company', 'write')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  perform private.ensure_currency(new.id, new.default_currency);
  return new;
end;
$$;

revoke execute on function private.company_currency() from public, anon, authenticated, service_role;

drop trigger if exists merchants_company_currency on public.merchants;
create trigger merchants_company_currency
  after update of default_currency on public.merchants
  for each row execute function private.company_currency();


-- 4. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Global Defaults', 'global_defaults', 'single', false),
  ('System Settings', 'system_settings', 'single', false),
  ('Currency', 'currencies', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('System Manager', 'Global Defaults', true, true, true, false, false),
  ('All', 'Global Defaults', true, true, false, false, false),
  ('System Manager', 'System Settings', true, true, true, false, false),
  ('All', 'System Settings', true, true, false, false, false),
  ('System Manager', 'Currency', true, true, true, true, true),
  ('Accounts Manager', 'Currency', true, true, true, true, true),
  ('All', 'Currency', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('system_settings', 'System Settings');
select private.apply_doctype_policies('global_defaults', 'Global Defaults');
select private.apply_doctype_policies('currencies', 'Currency');


-- 5. Seeding. A system's settings start from its country: its first time zone and its number format.

create or replace function private.seed_defaults_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.system_settings (merchant_id, time_zone, number_format)
  select m.id,
    coalesce(
      (select z.name from pg_catalog.pg_timezone_names z where z.name = c.time_zones[1]),
      'UTC'
    ),
    c.number_format
  from public.merchants m
  join public.countries c on c.code = m.country_code
  where m.id = p_merchant
  on conflict (merchant_id) do nothing;

  insert into public.global_defaults (merchant_id) values (p_merchant) on conflict (merchant_id) do nothing;

  select private.ensure_currency(m.id, m.default_currency) from public.merchants m where m.id = p_merchant;
$$;

revoke execute on function private.seed_defaults_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_defaults_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_defaults() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_30_defaults on public.merchants;
create trigger merchants_seed_30_defaults
  after insert on public.merchants
  for each row execute function private.seed_defaults();

-- The systems that already exist.
select private.seed_defaults_for(m.id) from public.merchants m;
