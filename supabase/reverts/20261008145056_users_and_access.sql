-- Revert of supabase/migrations/20261008145056_users_and_access.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every member, role, role profile, role permission and user permission of every system.
-- Members lose the systems they were invited to; owners keep theirs. Fiscal years and merchants go back to
-- the owner-only policies of 20261008101635 and 20260908131200. Regenerate src/lib/database.types.ts
-- afterwards — the Users & Access screens and usePermissions read these tables.

drop trigger if exists merchants_seed_20_access on public.merchants;
drop function if exists private.seed_access();
drop function if exists private.seed_roles(uuid);
drop function if exists private.sync_standard_permissions(uuid);

-- Fiscal years back onto membership of the owner's system.
drop policy if exists fiscal_years_select on public.fiscal_years;
drop policy if exists fiscal_years_insert on public.fiscal_years;
drop policy if exists fiscal_years_update on public.fiscal_years;
drop policy if exists fiscal_years_delete on public.fiscal_years;

-- The merchants policies back to owner_id.
drop policy if exists merchants_select_own on public.merchants;
create policy merchants_select_own on public.merchants
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists merchants_update_own on public.merchants;
create policy merchants_update_own on public.merchants
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop function if exists private.apply_doctype_policies(text, text, boolean);
drop function if exists public.save_role_permissions(uuid, text, jsonb);
drop function if exists public.save_role_profile(jsonb);
drop function if exists public.save_member(jsonb);
drop function if exists public.my_permissions(uuid);

drop trigger if exists user_permissions_validate on public.user_permissions;
drop function if exists private.validate_user_permission();
drop trigger if exists merchants_keep_owner on public.merchants;
drop function if exists private.merchants_keep_owner();
drop trigger if exists roles_guard on public.roles;
drop function if exists private.guard_roles();
drop trigger if exists on_auth_user_claim_memberships on auth.users;
drop function if exists private.claim_memberships_for_user();
drop trigger if exists merchant_members_claim on public.merchant_members;
drop function if exists private.claim_membership();

-- Children before parents; their policies go with them.
drop table if exists public.user_permissions;
drop table if exists public.role_permissions;
drop table if exists public.member_roles;
drop table if exists public.merchant_members;
drop table if exists public.role_profile_roles;
drop table if exists public.role_profiles;
drop table if exists public.roles;

-- current_merchant_ids back to owned systems only, before the functions its new body called go.
create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid());
$$;

drop function if exists private.allowed_record_ids(text);
drop function if exists private.restricted_merchant_ids(text);
drop function if exists private.permitted_merchant_ids(text, text);
drop function if exists private.effective_role_ids();

-- The P1 policy shape on fiscal years, now that current_merchant_ids answers for owners alone again.
drop policy if exists fiscal_years_select_own_merchant on public.fiscal_years;
create policy fiscal_years_select_own_merchant on public.fiscal_years
  for select to authenticated
  using (merchant_id in (select private.current_merchant_ids()));
drop policy if exists fiscal_years_insert_own_merchant on public.fiscal_years;
create policy fiscal_years_insert_own_merchant on public.fiscal_years
  for insert to authenticated
  with check (merchant_id in (select private.current_merchant_ids()));
drop policy if exists fiscal_years_update_own_merchant on public.fiscal_years;
create policy fiscal_years_update_own_merchant on public.fiscal_years
  for update to authenticated
  using (merchant_id in (select private.current_merchant_ids()))
  with check (merchant_id in (select private.current_merchant_ids()));
drop policy if exists fiscal_years_delete_own_merchant on public.fiscal_years;
create policy fiscal_years_delete_own_merchant on public.fiscal_years
  for delete to authenticated
  using (merchant_id in (select private.current_merchant_ids()));

drop table if exists public.standard_role_permissions;
drop table if exists public.doctypes;
