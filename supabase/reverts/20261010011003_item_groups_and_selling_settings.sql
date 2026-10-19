-- Revert of supabase/migrations/20261010011003_item_groups_and_selling_settings.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Item Groups with their Item Tax rows, its Selling Settings, the Item Group
-- User Permissions, and their rules in role_permissions. Regenerate src/lib/database.types.ts afterwards — the
-- Item Groups and Selling Settings screens read these tables.

drop trigger if exists merchants_seed_90_selling on public.merchants;
drop function if exists private.seed_selling();
drop function if exists private.seed_selling_for(uuid);

drop function if exists public.save_item_group(jsonb);

-- Policies and triggers go with their tables.
drop table if exists public.selling_settings;
drop table if exists public.item_group_taxes;
drop table if exists public.item_groups;

-- Cascades to the standard_role_permissions, role_permissions and user_permissions rows naming them.
delete from public.doctypes where name in ('Item Group', 'Selling Settings');

-- The brands' own check, as 20261009171705_stock_building_blocks.sql made it.
create or replace function private.validate_brand_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.default_warehouse is not null and (tg_op = 'INSERT' or new.default_warehouse is distinct from old.default_warehouse) then
    select not w.is_group and not w.disabled into v_ok
    from public.warehouses w where w.id = new.default_warehouse and w.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'default_warehouse cannot name that record.';
    end if;
  end if;

  if new.default_price_list is not null and (tg_op = 'INSERT' or new.default_price_list is distinct from old.default_price_list) then
    select p.enabled into v_ok
    from public.price_lists p where p.id = new.default_price_list and p.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'default_price_list cannot name that record.';
    end if;
  end if;

  if new.selling_cost_center is not null and (tg_op = 'INSERT' or new.selling_cost_center is distinct from old.selling_cost_center) then
    select not c.is_group and not c.disabled into v_ok
    from public.cost_centers c where c.id = new.selling_cost_center and c.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'selling_cost_center cannot name that record.';
    end if;
  end if;

  if new.income_account is not null and (tg_op = 'INSERT' or new.income_account is distinct from old.income_account) then
    select not a.is_group and not a.disabled and a.root_type = 'Income' into v_ok
    from public.accounts a where a.id = new.income_account and a.merchant_id = new.merchant_id;
    if not coalesce(v_ok, false) then
      raise exception 'brand_default_invalid' using errcode = '23514', detail = 'income_account cannot name that record.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_brand_defaults() from public, anon, authenticated, service_role;

drop trigger if exists brands_validate_defaults on public.brands;
create trigger brands_validate_defaults
  before insert or update of default_warehouse, default_price_list, selling_cost_center, income_account on public.brands
  for each row execute function private.validate_brand_defaults();

-- Fails while a newer migration's table still uses it (stock_settings): revert that one first.
drop function if exists private.validate_defaults();
