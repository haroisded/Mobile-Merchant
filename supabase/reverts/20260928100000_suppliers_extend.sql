-- Reverts 20260928100000_suppliers_extend.sql.
--
-- DESTROYS DATA: every supplier type, and each supplier's code, phone, email, address, payment terms,
-- type, lead time, TIN, active flag and notes. contact_person is renamed back to contact, so what it
-- holds survives. The code counters go too, so a re-apply starts SUP, SKU, RC and LOT numbering over.
--
-- Run 20260928100100_stock_items.sql's revert first: its SKU trigger calls private.assign_code()
-- (.claude/instruction-mds/migrations.md rule 6). The app expects the new shape — src/features/suppliers and
-- src/lib/database.types.ts — so regenerate the types after running this.

drop trigger if exists suppliers_assign_code on public.suppliers;

alter table if exists public.suppliers drop constraint if exists suppliers_lead_time_non_negative;
alter table if exists public.suppliers drop constraint if exists suppliers_details_length;
alter table if exists public.suppliers drop constraint if exists suppliers_code_unique;
alter table if exists public.suppliers drop constraint if exists suppliers_type_fk;

alter table if exists public.suppliers
  drop column if exists notes,
  drop column if exists active,
  drop column if exists tin,
  drop column if exists lead_time_days,
  drop column if exists supplier_type_id,
  drop column if exists payment_terms,
  drop column if exists address,
  drop column if exists email,
  drop column if exists phone,
  drop column if exists code;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'suppliers_contact_person_length') then
    alter table public.suppliers rename constraint suppliers_contact_person_length to suppliers_contact_length;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'contact_person'
  ) then
    alter table public.suppliers rename column contact_person to contact;
  end if;
end
$$;

drop table if exists public.supplier_types;

drop function if exists private.assign_code();
drop function if exists private.assert_member(uuid);
drop function if exists private.issue_code(uuid, text, text, integer, regclass, text);
drop function if exists private.next_number(uuid, text);
drop table if exists private.merchant_counters;
