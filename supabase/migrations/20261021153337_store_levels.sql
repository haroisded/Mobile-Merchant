-- Store levels: how much of the system a store uses, picked on Create Store's second step (1 easiest, 5 = all of it).
--
-- 1. merchants.level — 1 Just Sell, 2 Sell & Restock, 3 Staff & Stock Control, 4 Full Store, 5 Everything, by Hand.
--    The app reads it for two presets (src/features/merchants/levels.ts): the menu a person starts from until they save
--    their own on Features, and which New Item fields show. Hidden is not disabled: it refuses nothing.
-- 2. private.apply_level() — what the system sets up for a level, ADD-ONLY: a register to sell from (levels 1-4, when
--    the store has none), items numbered by the Item series (1-2, whose New Item form has no Item Code), and selling
--    past zero stock (1, whose menu has no stock documents). It runs when a store is made (merchants_seed_98_level)
--    and when its level changes (merchants_level_changed), and never deletes a record or a choice it did not make.
-- 3. A level change is the owner's alone (Store Managers hold Company write), and it takes everyone's saved Features
--    choices in that store back to the new level's menu.
--
-- Existing stores are level 5: nothing about them changes.
--
-- Rejected: the level on each person (feature_preferences) — the New Item form and the register are the store's;
-- deleting what a lower level hides — hidden is not disabled, and a sale or a ledger may already use it.

alter table public.merchants add column if not exists level smallint not null default 5;

alter table public.merchants drop constraint if exists merchants_level_range;
alter table public.merchants add constraint merchants_level_range check (level between 1 and 5);


-- 2. What a level sets up. Not definer itself: the two triggers below are, and call it as the table owner.
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
  if p_level <= 4 and not exists (select 1 from public.pos_profiles p where p.merchant_id = p_merchant) then
    select s.default_warehouse into v_warehouse from public.stock_settings s where s.merchant_id = p_merchant;
    select m.id into v_cash
    from public.modes_of_payment m
    where m.merchant_id = p_merchant and m.type = 'Cash' and m.enabled and m.default_account is not null
    order by m.created_at
    limit 1;

    if v_warehouse is not null and v_cash is not null then
      insert into public.pos_profiles (merchant_id, pos_profile_name, warehouse)
      values (p_merchant, 'Main Register', v_warehouse)
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


-- After every other seed, by name: Stock Settings (92), the payments (60) and the Item series (94) exist.
create or replace function private.seed_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.apply_level(new.id, new.level);
  return new;
end;
$$;

revoke execute on function private.seed_level() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_98_level on public.merchants;
create trigger merchants_seed_98_level
  after insert on public.merchants
  for each row execute function private.seed_level();


-- 3. The owner's alone. No JWT is a migration or the SQL Editor, which already run as the owner.
create or replace function private.guard_merchant_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.level is distinct from old.level and (select auth.uid()) is not null and old.owner_id <> (select auth.uid()) then
    raise exception 'level_owner_only' using errcode = '42501', detail = 'Only the store''s owner changes its level.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_merchant_level() from public, anon, authenticated, service_role;

drop trigger if exists merchants_guard_level on public.merchants;
create trigger merchants_guard_level
  before update of level on public.merchants
  for each row execute function private.guard_merchant_level();

-- A new level adds what it needs, and everyone's menu starts again from it: their saved Features choices go.
create or replace function private.level_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_level(new.id, new.level);
  delete from public.feature_preferences f where f.merchant_id = new.id;
  return null;
end;
$$;

revoke execute on function private.level_changed() from public, anon, authenticated, service_role;

drop trigger if exists merchants_level_changed on public.merchants;
create trigger merchants_level_changed
  after update of level on public.merchants
  for each row
  when (old.level is distinct from new.level)
  execute function private.level_changed();
