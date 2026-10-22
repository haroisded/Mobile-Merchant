-- Level 1 sells with receipts and discounts (the human, 2026-10-22).
--
-- 1. private.apply_level() — the Main Register it makes for levels 1-4 now prints a receipt when an order completes
--    (print_receipt_on_order_complete) and lets the cashier give a discount (allow_discount_change). Whether a person
--    may type one is still Apply Discounts (private.submit_pos_invoices); the owner holds it. Otherwise the body is
--    20261021153337_store_levels.sql's, add-only as before.
-- 2. Backfill: the Main Register of every store at level 1 or 2 gets both switches. Those levels' menus have no Setup,
--    so no owner can have chosen them off; a level 3-4 store's register is left as its owner set it.
--
-- The Orders page (sell/pos-invoices) joins Level 1's menu in the app (src/features/merchants/levels.ts): no change here.

create or replace function private.apply_level(p_merchant uuid, p_level smallint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_warehouse uuid;
  v_cash uuid;
  v_profile uuid;
begin
  -- A register to sell from, as the Open Session page needs one. Only for a store with none at all, and only when it
  -- can be valid: Stock Settings' warehouse, and a Cash mode with its account (private.validate_pos_profile_payments).
  -- It prints a receipt for each sale and allows a discount: Level 1 sells with both.
  if p_level <= 4 and not exists (select 1 from public.pos_profiles p where p.merchant_id = p_merchant) then
    select s.default_warehouse into v_warehouse from public.stock_settings s where s.merchant_id = p_merchant;
    select m.id into v_cash
    from public.modes_of_payment m
    where m.merchant_id = p_merchant and m.type = 'Cash' and m.enabled and m.default_account is not null
    order by m.created_at
    limit 1;

    if v_warehouse is not null and v_cash is not null then
      insert into public.pos_profiles (merchant_id, pos_profile_name, warehouse, print_receipt_on_order_complete, allow_discount_change)
      values (p_merchant, 'Main Register', v_warehouse, true, true)
      on conflict (merchant_id, pos_profile_name) do nothing
      returning id into v_profile;

      if v_profile is not null then
        insert into public.pos_profile_payments (merchant_id, pos_profile_id, idx, mode_of_payment_id, is_default, allow_in_returns)
        values (p_merchant, v_profile, 1, v_cash, true, true);
      end if;
    end if;
  end if;

  -- Levels 1-2 have no Item Code field: the Item series names each item (private.prepare_item).
  if p_level <= 2 then
    update public.stock_settings set item_naming_by = 'Naming Series'
    where merchant_id = p_merchant and item_naming_by <> 'Naming Series';
  end if;

  -- Level 1 has no stock documents to receive stock with: a sale past zero is not refused.
  if p_level = 1 then
    update public.stock_settings set allow_negative_stock = true
    where merchant_id = p_merchant and not allow_negative_stock;
  end if;
end;
$$;

revoke execute on function private.apply_level(uuid, smallint) from public, anon, authenticated, service_role;


-- 2. The stores made at level 1 or 2 before this migration.
update public.pos_profiles p
set print_receipt_on_order_complete = true, allow_discount_change = true
from public.merchants m
where m.id = p.merchant_id
  and m.level <= 2
  and p.pos_profile_name = 'Main Register'
  and not (p.print_receipt_on_order_complete and p.allow_discount_change);
