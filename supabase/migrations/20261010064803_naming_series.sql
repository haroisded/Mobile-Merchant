-- Step 12.1–12.2 of the POS foundation, on ERPNext's model: Naming Series and Document Naming Settings
-- (.claude/erpnext-docs/POS-System-Only-Features.md 12.1–12.2; docs.frappe.io/erpnext/naming-series,
-- /document-naming-settings, /naming-series-current-value).
--
-- 1. private.is_naming_series() / are_naming_series(): what a series may be.
-- 2. naming_series: per document — POS Invoice, Sales Invoice, Item — the series it may be numbered by, the
--    first one the default, and whether the person must always pick one.
-- 3. naming_series_counters: ERPNext's tabSeries — the last number given out under each resolved prefix.
-- 4. private.series_prefix() and private.make_name(): a series resolved for a date, and the next name under it.
-- 5. public.naming_series_preview() and public.update_series_counter(): what Document Naming Settings shows,
--    and its Update Series.
-- 6. The doctype, its permissions and policies, and the seed.
--
-- A series, as the docs write them — ACC-SINV-.YYYY.-, SINV12####, PO-.YY.MM.-.####: parts separated by dots.
-- YYYY, YY, MM and DD are the date's; FY is the fiscal year the date falls in; a run of # at the end is the
-- counter, that many digits; no # means five. Anything else is printed as typed.
--
-- The parser lives here only. Rejected: a second copy in TypeScript for a live preview — the database has to
-- hand out the numbers, and two parsers drift.
--
-- Out of scope, so absent: field values in a series (.vendor_id. — custom fields), a counter anywhere but the
-- end, the amended-documents counter, Document Naming Rule, and company-wise series (one company).
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. What a series may be: letters, digits, - / _ and the dots between parts, at least one of them a
-- character that prints, then at most ten #.

create or replace function private.is_naming_series(p_series text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select length(p_series) <= 140 and p_series ~ '^[A-Za-z0-9_/.-]*[A-Za-z0-9_/-][A-Za-z0-9_/.-]*#{0,10}$';
$$;

-- One document's series: one to twenty, each of them a series, none twice.
create or replace function private.are_naming_series(p_options text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_options) between 1 and 20
    and not exists (select 1 from unnest(p_options) s where s is null or not private.is_naming_series(s))
    and (select count(distinct s) from unnest(p_options) s) = cardinality(p_options);
$$;

-- A check constraint runs its function as the writing role, so `authenticated` keeps execute on these two;
-- they only match strings (as private.is_number_format, 20261008151723_defaults_and_money.sql).
revoke execute on function private.is_naming_series(text) from public, anon, authenticated, service_role;
grant execute on function private.is_naming_series(text) to authenticated;
revoke execute on function private.are_naming_series(text[]) from public, anon, authenticated, service_role;
grant execute on function private.are_naming_series(text[]) to authenticated;


-- 2. Naming Series. One row per document that takes one; the rows are made by the seed and go with the system.

create table if not exists public.naming_series (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  document_type text not null,
  -- "The first prefix will be the default prefix."
  options text[] not null,
  -- "There will be no default naming series if this is ticked."
  user_must_select boolean not null default false,

  primary key (merchant_id, document_type),
  constraint naming_series_document_type check (document_type in ('POS Invoice', 'Sales Invoice', 'Item')),
  constraint naming_series_options check (private.are_naming_series(options))
);

alter table public.naming_series enable row level security;

-- "Edit the series as required with unique prefixes for each series": one series numbers one document, or
-- two documents would share a counter. Security definer, as the other validators are: a writer who cannot read
-- the other rows must not slip past the check.
create or replace function private.naming_series_unique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_taken text;
begin
  select s into v_taken
  from public.naming_series n
  cross join lateral unnest(n.options) s
  where n.merchant_id = new.merchant_id and n.document_type <> new.document_type and s = any (new.options)
  limit 1;

  if v_taken is not null then
    raise exception 'series_in_use' using errcode = '23505',
      detail = format('%s already numbers another document.', v_taken);
  end if;
  return new;
end;
$$;

revoke execute on function private.naming_series_unique() from public, anon, authenticated, service_role;

drop trigger if exists naming_series_unique on public.naming_series;
create trigger naming_series_unique
  before insert or update of options on public.naming_series
  for each row execute function private.naming_series_unique();


-- 3. The counters. Keyed by the resolved prefix (ACC-SINV-2026-), so a series with the year in it starts
-- again each year by itself. current_value is the last number given out: the next document takes one more.

create table if not exists public.naming_series_counters (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  prefix text not null,
  current_value bigint not null default 0,

  primary key (merchant_id, prefix),
  constraint naming_series_counters_current_value check (current_value >= 0)
);

alter table public.naming_series_counters enable row level security;


-- 4. A series resolved for a date — today in the system's time zone when none is given — into the prefix its
-- counter is kept under and the counter's digits. A null prefix: the series has .FY. and no enabled fiscal
-- year covers the date. Invoker: it reads System Settings and Fiscal Years as the caller, which every member
-- may (All's Read and Select).
create or replace function private.series_prefix(
  p_merchant uuid, p_series text, p_date date default null, out prefix text, out digits integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date := p_date;
  v_body text := rtrim(p_series, '#');
  v_part text;
begin
  if v_date is null then
    select (now() at time zone s.time_zone)::date into v_date from public.system_settings s where s.merchant_id = p_merchant;
    v_date := coalesce(v_date, (now() at time zone 'UTC')::date);
  end if;

  digits := length(p_series) - length(v_body);
  if digits = 0 then
    digits := 5;
  end if;

  prefix := '';
  foreach v_part in array string_to_array(v_body, '.') loop
    prefix := prefix || case v_part
      when 'YYYY' then to_char(v_date, 'YYYY')
      when 'YY' then to_char(v_date, 'YY')
      when 'MM' then to_char(v_date, 'MM')
      when 'DD' then to_char(v_date, 'DD')
      when 'FY' then (
        select f.year from public.fiscal_years f
        where f.merchant_id = p_merchant and not f.disabled and v_date between f.year_start_date and f.year_end_date
      )
      else v_part
    end;
  end loop;
end;
$$;

-- The two public functions below run as the caller and call this one.
revoke execute on function private.series_prefix(uuid, text, date) from public, anon, authenticated, service_role;
grant execute on function private.series_prefix(uuid, text, date) to authenticated;

-- The next name under a series: its counter moved up by one and printed at the series' digits, never cut
-- short. One statement, so two sales at once cannot take the same number. Security definer — a cashier numbers
-- a sale without holding Document Naming Settings — and out of every role's reach: the triggers of the
-- documents that take a series (Item, POS Invoice) call it.
create or replace function private.make_name(p_merchant uuid, p_series text, p_date date default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_digits integer;
  v_number bigint;
begin
  if (select auth.uid()) is not null and p_merchant not in (select private.current_merchant_ids()) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select p.prefix, p.digits into v_prefix, v_digits from private.series_prefix(p_merchant, p_series, p_date) p;
  if v_prefix is null then
    raise exception 'no_fiscal_year' using errcode = '23514',
      detail = 'No fiscal year covers the date, so .FY. has nothing to print.';
  end if;

  insert into public.naming_series_counters as c (merchant_id, prefix, current_value)
  values (p_merchant, v_prefix, 1)
  on conflict (merchant_id, prefix) do update set current_value = c.current_value + 1
  returning c.current_value into v_number;

  return v_prefix || lpad(v_number::text, greatest(v_digits, length(v_number::text)), '0');
end;
$$;

revoke execute on function private.make_name(uuid, text, date) from public, anon, authenticated, service_role;


-- 5. What Document Naming Settings shows: each document's series in order, the prefix it resolves to today,
-- the counter's current value and the name the next document would take. Security invoker: the caller's own
-- policies decide the rows.
create or replace function public.naming_series_preview(p_merchant uuid)
returns table (document_type text, series text, prefix text, current_value bigint, next_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.document_type,
    o.series,
    p.prefix,
    coalesce(c.current_value, 0),
    p.prefix || lpad(
      (coalesce(c.current_value, 0) + 1)::text,
      greatest(p.digits, length((coalesce(c.current_value, 0) + 1)::text)),
      '0'
    )
  from public.naming_series n
  cross join lateral unnest(n.options) with ordinality as o (series, idx)
  cross join lateral private.series_prefix(n.merchant_id, o.series) p
  left join public.naming_series_counters c on c.merchant_id = n.merchant_id and c.prefix = p.prefix
  where n.merchant_id = p_merchant
  order by n.document_type, o.idx;
$$;

revoke execute on function public.naming_series_preview(uuid) from public, anon, authenticated, service_role;
grant execute on function public.naming_series_preview(uuid) to authenticated;

-- Update Series: "select the prefix whose sequence is to be changed … change the current sequence number". Sets
-- the counter of the prefix a series resolves to today. Security invoker: the counters' policies decide.
create or replace function public.update_series_counter(p_merchant uuid, p_series text, p_current bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if not exists (select 1 from public.naming_series n where n.merchant_id = p_merchant and p_series = any (n.options)) then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;

  select p.prefix into v_prefix from private.series_prefix(p_merchant, p_series) p;
  if v_prefix is null then
    raise exception 'no_fiscal_year' using errcode = '23514',
      detail = 'No fiscal year covers today, so .FY. has nothing to print.';
  end if;

  insert into public.naming_series_counters (merchant_id, prefix, current_value)
  values (p_merchant, v_prefix, p_current)
  on conflict (merchant_id, prefix) do update set current_value = excluded.current_value;
end;
$$;

revoke execute on function public.update_series_counter(uuid, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.update_series_counter(uuid, text, bigint) to authenticated;


-- 6. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). A single: its
-- rows are made by the seed, so select and update only. The counters follow it as a child table.

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Document Naming Settings', 'naming_series', 'single', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values ('System Manager', 'Document Naming Settings', true, true, true, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('naming_series', 'Document Naming Settings');
select private.apply_doctype_policies('naming_series_counters', 'Document Naming Settings', true);


-- Seeding: the series ERPNext ships for the three documents.

create or replace function private.seed_naming_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.naming_series (merchant_id, document_type, options)
  values
    (p_merchant, 'POS Invoice', array['ACC-PSINV-.YYYY.-']),
    (p_merchant, 'Sales Invoice', array['ACC-SINV-.YYYY.-']),
    (p_merchant, 'Item', array['STO-ITEM-.YYYY.-'])
  on conflict (merchant_id, document_type) do nothing;
$$;

revoke execute on function private.seed_naming_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_naming()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_naming_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_naming() from public, anon, authenticated, service_role;

-- 94: after every step so far, and two digits — triggers fire in name order, and "100" sorts before "20".
drop trigger if exists merchants_seed_94_naming on public.merchants;
create trigger merchants_seed_94_naming
  after insert on public.merchants
  for each row execute function private.seed_naming();

-- The systems that already exist.
select private.seed_naming_for(m.id) from public.merchants m;
