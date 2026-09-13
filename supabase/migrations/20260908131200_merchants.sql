-- The tenant table. A merchant is the business whose rows are being protected; a user account is a
-- person. Today one merchant has exactly one user, and `merchants.owner_id` *is* the membership —
-- see docs/tenancy.md §3 for why `merchant_members` is deliberately not built yet.
--
-- This is also the answer to the open question in docs/tenancy.md §5, "who creates the merchant
-- row?": not a trigger. An explicit onboarding step — CreateSystemModal in
-- src/features/merchants/ — because a staff member joining an existing merchant must not silently
-- create a second one.

-- Already created by 20260902000002_profiles.sql. Repeated because a migration that depends on a
-- schema should say so rather than inherit it by file ordering.
create schema if not exists private;

-- An enum rather than `text` + a check constraint. Both cost one migration to add a value and both
-- need the same data migration to remove one, so the tie is broken by what reaches the client:
-- an enum generates a real union in src/lib/database.types.ts, which is what lets
-- CATEGORY_META[row.category] compile with no type assertion. `text` generates `string`, which
-- forces exactly the assertion .oxlintrc.json rejects (require-safety-comment-for-type-assertion,
-- no-unsafe-dictionary-type).
--
-- Adding a category later is `alter type public.store_category add value '…'` in a migration of its
-- own: Postgres will not let the same transaction use a value it just added.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'store_category' and n.nspname = 'public'
  ) then
    create type public.store_category as enum (
      'restaurant', 'cafe', 'clothing', 'grocery', 'bakery',
      'electronics', 'pharmacy', 'bookstore', 'fitness', 'other'
    );
  end if;
end
$$;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),

  -- The cascade is what makes public.delete_current_user() complete: deleting the auth.users row
  -- takes the profile and every merchant with it, so account deletion needs no extra statement.
  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null,
  description text,
  category public.store_category not null,
  created_at timestamptz not null default now(),

  -- btrim so a name of pure whitespace fails. The 255 on description is the number the
  -- CreateSystemModal counter shows the user; the same bound lives in
  -- src/features/merchants/schema.ts so the form reports it before a round trip, and here so the
  -- database is the one that actually enforces it.
  constraint merchants_name_length check (length(btrim(name)) between 1 and 80),
  constraint merchants_description_length check (description is null or length(description) <= 255)
);

-- Its own line, per the note in 20260902000002_profiles.sql. The event trigger in
-- 20260902000003_rls_auto_enable.sql would also catch this table where it installs, but installing it
-- needs superuser — so on hosted Supabase it is not there (verified 2026-09-13), and this line is the
-- only thing that turns RLS on.
alter table public.merchants enable row level security;

-- Not covered by the primary key. private.current_merchant_ids() filters on this column, and once
-- business tables exist that call runs once per statement in every one of their policies.
create index if not exists merchants_owner_id_idx on public.merchants (owner_id);

-- These policies key on owner_id, NOT on private.current_merchant_ids(), and that is not an
-- oversight. docs/tenancy.md rule 3 governs *business* tables — the ones carrying a merchant_id
-- column. This is the tenant root itself, and routing its policies through the function that reads
-- the tenant root is the self-reference §3 flags under "the recursion trap".
--
-- When merchant_members arrives, only merchants_select_own changes:
--   using (id in (select private.current_merchant_ids()))
-- The three write policies stay on owner_id, and no business table moves.
drop policy if exists merchants_select_own on public.merchants;
create policy merchants_select_own on public.merchants
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists merchants_insert_own on public.merchants;
create policy merchants_insert_own on public.merchants
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- Both clauses, for the same reason profiles_update_own carries both: `using` picks the rows,
-- `with check` picks what they may become. Without the second, a merchant can be handed to another
-- account by rewriting owner_id.
drop policy if exists merchants_update_own on public.merchants;
create policy merchants_update_own on public.merchants
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Unlike profiles, merchants gets a delete policy: a user removing one of their own businesses is
-- an ordinary action, not account deletion.
drop policy if exists merchants_delete_own on public.merchants;
create policy merchants_delete_own on public.merchants
  for delete to authenticated
  using ((select auth.uid()) = owner_id);


-- The seam, and it ships with no caller on purpose.
--
-- Every business table added later gets policies of the shape
--   using (merchant_id in (select private.current_merchant_ids()))
-- and staff support then arrives by rewriting this function's body alone — zero policy rewrites,
-- zero table alterations. Writing it now is what stops the first business table shipping an
-- `auth.uid() = owner_id` policy "just for now", which is the rewrite-every-table cost
-- docs/tenancy.md §2 exists to avoid.
--
-- All three requirements from CLAUDE.md §6.2 are met: it lives in `private` so PostgREST publishes
-- no /rest/v1/rpc/ URL for it; search_path is pinned empty with a fully-qualified body, so a caller
-- cannot point an unqualified name at their own table and have it run as the owner; and the
-- (select auth.uid()) inside means it can only ever answer for its caller, however it is reached.
--
-- `stable` lets the planner call it once per statement instead of once per row.
create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid());
$$;

-- PUBLIC alone would not be enough: Supabase's default privileges grant EXECUTE on new functions to
-- anon, authenticated and service_role *directly*, so revoking from PUBLIC leaves three live grants
-- behind. All four names, every time.
revoke execute on function private.current_merchant_ids()
  from public, anon, authenticated, service_role;
