-- Reverts 20260928100300_supplier_code_default.sql.
--
-- Destroys no data. Codes already issued stay. The app sends '' for a blank code, which this revert
-- turns into a failed insert (suppliers_details_length), so regenerate src/lib/database.types.ts and
-- have the form send a code after running it.

-- Does nothing once 20261008050254_revamp_drop_business_schema.sql has run: that drop-only migration took
-- public.products and every object below, and all-in-one/revert.sql reaches this block after it.
do $revert$
begin
  if to_regclass('public.products') is null then
    return;
  end if;

drop trigger if exists suppliers_assign_code on public.suppliers;
create trigger suppliers_assign_code
  before insert or update of code on public.suppliers
  for each row when (new.code is null)
  execute function private.assign_code('supplier', 'SUP-', '4', 'code');

alter table if exists public.suppliers alter column code drop default;
end
$revert$;
