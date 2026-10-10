-- Step 12.3–12.5 of the POS foundation, on ERPNext's model: Print Format, Letter Head, Print Settings
-- (.claude/erpnext-docs/POS-System-Only-Features.md 12.3–12.5; docs.frappe.io/erpnext/print-format,
-- /letter-head, /print-settings).
--
-- 1. private.single_default(): one default per system, for any table with merchant_id, id and is_default.
-- 2. letter_heads: the header and footer a printed document carries — the company's name, address, tax ID.
-- 3. print_formats: how the receipt is laid out — its paper, heading, whether the item code prints, a note at
--    the foot.
-- 4. print_settings: a single per system — print with the letter head, compact item print, taxes with zero
--    amount.
-- 5. The doctypes, their permissions and policies, and the seed.
--
-- A print format here is a structured layout, not Jinja or HTML, and a letter head is text: nothing prints yet
-- but the sample receipt on the Print Format page. Real printing and the logo arrive with the POS Invoice.
--
-- Out of scope, so absent: a print format's DocType (only the POS Invoice prints — the column arrives with a
-- second document), Custom Format and Raw Printing, the Print Format Builder, Print Style, the Print Heading
-- master, a letter head's image and HTML; from Print Settings the PDF settings, printing of draft and cancelled
-- documents, page breaks and the print server. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Making a record the default clears the old one in the same statement, as ERPNext does on save. One
-- function for every table shaped (id, merchant_id, is_default). Invoker, like
-- private.sales_tax_templates_single_default: RLS decides whether the caller may touch the other row.
create or replace function private.single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    execute format('update public.%I set is_default = false where merchant_id = $1 and id <> $2 and is_default', tg_table_name)
    using new.merchant_id, new.id;
  end if;
  return new;
end;
$$;

revoke execute on function private.single_default() from public, anon, authenticated, service_role;


-- 2. Letter Heads.

create table if not exists public.letter_heads (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  letter_head_name text not null,
  -- The header, as lines of text: the organization's name, address, tax ID.
  content text not null default '',
  footer text not null default '',
  is_default boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint letter_heads_id_merchant unique (id, merchant_id),
  constraint letter_heads_name_unique unique (merchant_id, letter_head_name),
  constraint letter_heads_name_length check (length(btrim(letter_head_name)) between 1 and 140),
  constraint letter_heads_content_length check (length(content) <= 1000),
  constraint letter_heads_footer_length check (length(footer) <= 500),
  constraint letter_heads_default_enabled check (not (is_default and disabled))
);

alter table public.letter_heads enable row level security;

-- One default per system.
create unique index if not exists letter_heads_one_default on public.letter_heads (merchant_id) where is_default;

drop trigger if exists letter_heads_single_default on public.letter_heads;
create trigger letter_heads_single_default
  before insert or update of is_default on public.letter_heads
  for each row execute function private.single_default();


-- 3. Print Formats.

create table if not exists public.print_formats (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  print_format_name text not null,
  -- The roll a receipt printer takes, or a page.
  paper text not null default '80mm',
  -- The title printed over the receipt: "Receipt", "Official Receipt". Blank prints none.
  print_heading text not null default '',
  -- ERPNext's Print Hide on Item Code, as its docs' own example.
  show_item_code boolean not null default true,
  footer_note text not null default '',
  is_default boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint print_formats_id_merchant unique (id, merchant_id),
  constraint print_formats_name_unique unique (merchant_id, print_format_name),
  constraint print_formats_name_length check (length(btrim(print_format_name)) between 1 and 140),
  constraint print_formats_paper check (paper in ('58mm', '80mm', 'A4')),
  constraint print_formats_heading_length check (length(print_heading) <= 140),
  constraint print_formats_footer_note_length check (length(footer_note) <= 500),
  constraint print_formats_default_enabled check (not (is_default and disabled))
);

alter table public.print_formats enable row level security;

-- One default per system: the format a receipt takes when the POS Profile names none.
create unique index if not exists print_formats_one_default on public.print_formats (merchant_id) where is_default;

drop trigger if exists print_formats_single_default on public.print_formats;
create trigger print_formats_single_default
  before insert or update of is_default on public.print_formats
  for each row execute function private.single_default();


-- 4. Print Settings. ERPNext's own field names and defaults.

create table if not exists public.print_settings (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- A printed document starts with the default letter head.
  with_letterhead boolean not null default true,
  -- Four columns — Description, Qty, Rate, Amount — the rest folded into Description.
  compact_item_print boolean not null default true,
  -- A tax that came to nothing is printed too.
  print_taxes_with_zero_amount boolean not null default false
);

alter table public.print_settings enable row level security;


-- 5. Doctypes, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). Everyone who
-- prints a receipt reads all three; a System Manager keeps them.

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Print Format', 'print_formats', 'record', false),
  ('Letter Head', 'letter_heads', 'record', false),
  ('Print Settings', 'print_settings', 'single', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('System Manager', 'Print Format', true, true, true, true, true),
  ('All', 'Print Format', true, true, false, false, false),
  ('System Manager', 'Letter Head', true, true, true, true, true),
  ('All', 'Letter Head', true, true, false, false, false),
  ('System Manager', 'Print Settings', true, true, true, false, false),
  ('All', 'Print Settings', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('print_formats', 'Print Format');
select private.apply_doctype_policies('letter_heads', 'Letter Head');
select private.apply_doctype_policies('print_settings', 'Print Settings');


-- Seeding: Print Settings as ERPNext ships them; one print format, POS Receipt, on the 80mm roll; and a letter
-- head named and worded as the company — "every company has a default Letter Head". Each is the default only
-- while the system has none, so running this again never takes the default from a record the owner chose.

create or replace function private.seed_printing_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.print_settings (merchant_id) values (p_merchant)
  on conflict (merchant_id) do nothing;

  insert into public.print_formats (merchant_id, print_format_name, print_heading, is_default)
  select p_merchant, 'POS Receipt', 'Receipt',
    not exists (select 1 from public.print_formats f where f.merchant_id = p_merchant and f.is_default)
  on conflict (merchant_id, print_format_name) do nothing;

  insert into public.letter_heads (merchant_id, letter_head_name, content, is_default)
  select m.id, m.name, m.name,
    not exists (select 1 from public.letter_heads l where l.merchant_id = m.id and l.is_default)
  from public.merchants m
  where m.id = p_merchant
  on conflict (merchant_id, letter_head_name) do nothing;
$$;

revoke execute on function private.seed_printing_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_printing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_printing_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_printing() from public, anon, authenticated, service_role;

-- 96: the last seed, and two digits — triggers fire in name order, and "100" sorts before "20".
drop trigger if exists merchants_seed_96_printing on public.merchants;
create trigger merchants_seed_96_printing
  after insert on public.merchants
  for each row execute function private.seed_printing();

-- The systems that already exist.
select private.seed_printing_for(m.id) from public.merchants m;
