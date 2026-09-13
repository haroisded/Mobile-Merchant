-- Reverts 20260908131200_merchants.sql.
--
-- DESTROYS DATA: every merchant row goes with the table. auth.users and public.profiles are untouched.
--
-- Run the revert of 20260910000000_merchants_contact_and_address.sql first. No statement below uses
-- `cascade`, so a business table added later — one whose foreign key or policy points at this table
-- or at current_merchant_ids() — makes this fail loudly until its own revert has run, rather than
-- being dropped without anyone naming it.

drop function if exists private.current_merchant_ids();

-- Its four policies, the owner_id index, both check constraints and the primary key go with it.
drop table if exists public.merchants;

-- After the table, whose category column is what depends on the type.
drop type if exists public.store_category;

-- Schema `private` stays: 20260902000002_profiles.sql created it, and that migration's revert is the
-- one that removes it.
