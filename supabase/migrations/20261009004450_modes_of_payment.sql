-- Step 5 of the POS foundation, on ERPNext's model: Retail Payments
-- (.claude/erpnext-docs/POS-System-Only-Features.md 5.1–5.2; docs.frappe.io/erpnext/mode-of-payment,
-- /bank-accounts-and-modes-of-payment).
--
-- 1. modes_of_payment: how money is received — Cash, Credit Card … — with its Type and the ledger ERPNext
--    proposes when it is chosen. ERPNext keeps that ledger in a per-company child table; a system is one
--    company, so it is a column.
-- 2. private.validate_mode_of_payment_account(): the ledger is an enabled Cash or Bank ledger that fits the
--    Type — the docs' warning that "the label Cash does not make the linked ledger a cash account".
-- 3. The doctype, its permissions and policies, and the seed: Cash on the Cash ledger, Credit Card with no
--    account until the owner adds a bank or clearing ledger.
--
-- 5.1 (Bank vs Bank Account vs ledger vs Mode of Payment) is the form's help text: no Bank or Bank Account
-- doctypes — bank reconciliation is out of scope. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. Modes of Payment.

create table if not exists public.modes_of_payment (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  mode_of_payment text not null,
  type text not null default 'General',
  enabled boolean not null default true,
  default_account uuid,
  created_at timestamptz not null default now(),

  constraint modes_of_payment_id_merchant unique (id, merchant_id),
  constraint modes_of_payment_name_unique unique (merchant_id, mode_of_payment),
  constraint modes_of_payment_name_length check (length(btrim(mode_of_payment)) between 1 and 140),
  constraint modes_of_payment_type check (type in ('Cash', 'Bank', 'General', 'Phone')),
  -- An account of the same system. Deleting a ledger a mode still names fails with 23503 ("in use").
  constraint modes_of_payment_account_fk foreign key (default_account, merchant_id) references public.accounts (id, merchant_id)
);

alter table public.modes_of_payment enable row level security;
create index if not exists modes_of_payment_account_idx on public.modes_of_payment (default_account, merchant_id);


-- 2. The ledger fits the Type: Cash → a Cash ledger, Bank → a Bank ledger, General and Phone → either.
-- Security definer, as private.validate_company_accounts is: a User Permission must not hide the account from
-- the check.
create or replace function private.validate_mode_of_payment_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.default_account is null then
    return new;
  end if;

  select not a.is_group and not a.disabled
    and a.account_type = any (case new.type when 'Cash' then array['Cash'] when 'Bank' then array['Bank'] else array['Cash', 'Bank'] end)
  into v_ok
  from public.accounts a where a.id = new.default_account and a.merchant_id = new.merchant_id;

  if not coalesce(v_ok, false) then
    raise exception 'mode_account_invalid' using errcode = '23514',
      detail = 'A mode of payment''s account is an enabled Cash or Bank ledger that fits its type.';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_mode_of_payment_account() from public, anon, authenticated, service_role;

drop trigger if exists modes_of_payment_validate_account on public.modes_of_payment;
create trigger modes_of_payment_validate_account
  before insert or update of type, default_account on public.modes_of_payment
  for each row execute function private.validate_mode_of_payment_account();


-- 3. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql).

insert into public.doctypes (name, table_name, kind, restrictable)
values ('Mode of Payment', 'modes_of_payment', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Accounts Manager', 'Mode of Payment', true, true, true, true, true),
  ('Accounts User', 'Mode of Payment', true, true, false, false, false),
  ('Sales User', 'Mode of Payment', true, true, false, false, false),
  ('All', 'Mode of Payment', true, false, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('modes_of_payment', 'Mode of Payment');


-- 4. Seeding: Cash on the Cash ledger (found by name and type, so a renamed one is left out), and Credit Card.

create or replace function private.seed_payments_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.modes_of_payment (merchant_id, mode_of_payment, type, default_account)
  values
    (p_merchant, 'Cash', 'Cash',
      (select a.id from public.accounts a
       where a.merchant_id = p_merchant and a.account_name = 'Cash' and a.account_type = 'Cash' and not a.is_group and not a.disabled)),
    (p_merchant, 'Credit Card', 'Bank', null)
  on conflict (merchant_id, mode_of_payment) do nothing;
$$;

revoke execute on function private.seed_payments_for(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_payments_for(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_payments() from public, anon, authenticated, service_role;

-- After merchants_seed_40_accounting, by name: the Cash ledger exists when this runs.
drop trigger if exists merchants_seed_60_payments on public.merchants;
create trigger merchants_seed_60_payments
  after insert on public.merchants
  for each row execute function private.seed_payments();

-- The systems that already exist.
select private.seed_payments_for(m.id) from public.merchants m;
