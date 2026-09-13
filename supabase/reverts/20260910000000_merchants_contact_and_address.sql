-- Reverts 20260910000000_merchants_contact_and_address.sql.
--
-- DESTROYS DATA: every merchant's contact_email and phone go with their columns. address is renamed
-- back to description, so what it holds survives.
--
-- The app expects the new shape — src/features/merchants/schema.ts and src/lib/database.types.ts
-- name all three columns — so regenerate the types after running this.
--
-- Newest revert, so nothing has to run before it. supabase/all-in-one/revert.sql orders every revert
-- newest first (docs/migrations.md).

-- Dropping a column takes its check constraint with it. Named anyway, so this file reads as the exact
-- inverse of the one it undoes.
alter table if exists public.merchants drop constraint if exists merchants_phone_shape;
alter table if exists public.merchants drop constraint if exists merchants_contact_email_shape;

alter table if exists public.merchants drop column if exists phone;
alter table if exists public.merchants drop column if exists contact_email;

-- Guarded by a catalog lookup for the same reason the forward rename is: ALTER ... RENAME COLUMN
-- accepts no `if exists`.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'merchants' and column_name = 'address'
  ) then
    alter table public.merchants rename column address to description;
    alter table public.merchants rename constraint merchants_address_length to merchants_description_length;
  end if;
end
$$;
