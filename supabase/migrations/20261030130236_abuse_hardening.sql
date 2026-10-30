-- Abuse hardening (2026-10-30): what .claude/full-system-context/Problems/Found-Abuses-Exploits.txt found real, fixed
-- where every caller goes through. Each item names the finding it closes.
--
-- #2  public.delete_document() — re-created from 20261012080419_pos_returns_and_voids.sql: refuses while Accounts
--     Settings' Immutable Ledger is on (ledger_immutable), as ERPNext reads that switch; a ledger is deleted only when
--     the owner has turned Immutable Ledger off and Delete Ledger Entries with the Document on.
--     private.guard_ledger_switches() + accounts_settings_guard_ledger_switches — new: only the owner changes those two
--     switches (ledger_switch_owner_only), as only the owner changes a store's level (merchants_guard_level).
-- #1  public.update_series_counter() — re-created from 20261010064803_naming_series.sql: a counter is 0 to
--     999,999,999,999 (counter_out_of_range), the twelve digits the Update Series form takes; and the table holds it
--     there (naming_series_counters_current_value_max), so private.make_name() cannot be walked to bigint's end.
-- #3, #4  public.claim_access_code() — re-created from 20261013213537_access_codes.sql:
--     - a person's attempts are taken one at a time (an advisory lock on them), so ten wrong codes in 15 minutes is ten
--       however many are sent at once;
--     - a pending request uses a code up for a day; after that the code is free for someone else, and the owner can
--       still approve or decline it (the human, 2026-10-30: one day);
--     - the name and photo copied into the request are bounded (120 / 2048 characters).
-- #5  private.guard_valuation_method() + items_guard_valuation, stock_settings_guard_valuation — new: once an item has
--     stock movements, its valuation moves only from FIFO to Moving Average, never back (valuation_locked) — ERPNext's
--     rule, and features doc §Stock Settings'.
-- #8  private.submit_stock_entries() — re-created from 20261018162135_single_store.sql: a Material Issue or Transfer
--     needs Adjust Inventory (stock_purpose_not_permitted); Receive Shipments is receipts. Adjust Inventory gains
--     Stock Entry create, write, delete and submit so it can make them; the two permissions' catalog lines say so.
-- #10 private.clear_member_overrides() + merchant_members_clear_overrides — new: an employee's exceptions are relative
--     to their role, so a change of role — or the role deleted, or taken away in save_role — clears them, and someone
--     left with no role sees Home only, as tenancy.md §6 promises. public.save_member_access() writes the role first,
--     then the exceptions it is given, so the Access editor is unchanged.
-- #11 private.prepare_item() — re-created from 20261011134250_items.sql: a barcode cannot be another item's code, nor a
--     code another item's barcode, in the same store (barcode_conflict) — the Register finds by barcode first.
-- #12 public.stock_alerts() — re-created from 20261012200010_dashboard.sql: at most 200 rows, whatever is asked.
--     profiles_display_name_length, profiles_avatar_url_shape — new checks; private.handle_new_user() — re-created
--     from 20260902000002_profiles.sql, copying a provider's name and photo within them.
--     private.guard_store_count() + merchants_store_count — new: at most 20 stores per owner (store_limit).
-- Same signatures: database.types.ts is unchanged.

-- #2 ------------------------------------------------------------------------------------------------------------------

create or replace function public.delete_document(p_doctype text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_merchant uuid;
  v_status smallint;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select d.table_name into v_table from public.doctypes d where d.name = p_doctype and d.kind = 'document';
  if v_table is null then
    raise exception 'not_a_document' using errcode = '22023';
  end if;

  execute format('select d.merchant_id, d.docstatus from public.%I d where d.id = $1 for update', v_table)
    into v_merchant, v_status using p_id;

  -- One answer for a document that is not there and one the caller may not delete.
  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'delete')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 2 then
    raise exception 'not_cancelled' using errcode = '23514', detail = 'Only a cancelled document is deleted here; a draft through its own page.';
  end if;

  if not coalesce((select s.delete_linked_ledger_entries from public.accounts_settings s where s.merchant_id = v_merchant), false) then
    raise exception 'ledger_entries_kept' using errcode = '23514',
      detail = 'Accounts Settings keep a cancelled document''s ledger entries, and the document with them.';
  end if;
  -- "Immutable Ledger: entries are never deleted, only reversed." Found-Abuse #2.
  if coalesce((select s.enable_immutable_ledger from public.accounts_settings s where s.merchant_id = v_merchant), true) then
    raise exception 'ledger_immutable' using errcode = '23514',
      detail = 'Accounts Settings'' Immutable Ledger is on: a cancelled document keeps its ledger entries.';
  end if;

  delete from public.gl_entries g where g.merchant_id = v_merchant and g.voucher_type = p_doctype and g.voucher_id = p_id;
  delete from public.stock_ledger_entries s where s.merchant_id = v_merchant and s.voucher_type = p_doctype and s.voucher_id = p_id;

  -- "If your document is linked with other documents, you will need to cancel the dependent document first."
  begin
    execute format('delete from public.%I where id = $1', v_table) using p_id;
  exception when foreign_key_violation then
    raise exception 'document_in_use' using errcode = '23503', detail = 'Another document still names this one.';
  end;
end;
$$;

revoke execute on function public.delete_document(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_document(text, uuid) to authenticated;

-- The two switches that decide whether a ledger can be erased are the owner's, as the store's level is.
create or replace function private.guard_ledger_switches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.delete_linked_ledger_entries is distinct from old.delete_linked_ledger_entries
      or new.enable_immutable_ledger is distinct from old.enable_immutable_ledger)
    and (select auth.uid()) is not null
    and (select m.owner_id from public.merchants m where m.id = new.merchant_id) is distinct from (select auth.uid()) then
    raise exception 'ledger_switch_owner_only' using errcode = '42501',
      detail = 'Only the store''s owner changes Immutable Ledger and Delete Ledger Entries with the Document.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_ledger_switches() from public, anon, authenticated, service_role;

drop trigger if exists accounts_settings_guard_ledger_switches on public.accounts_settings;
create trigger accounts_settings_guard_ledger_switches
  before update of delete_linked_ledger_entries, enable_immutable_ledger on public.accounts_settings
  for each row execute function private.guard_ledger_switches();

-- #1 ------------------------------------------------------------------------------------------------------------------

create or replace function public.update_series_counter(p_merchant uuid, p_series text, p_current bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if not exists (select 1 from public.naming_series n where n.merchant_id = p_merchant and p_series = any (n.options)) then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;
  -- Found-Abuse #1: twelve digits, what the form takes. Far past any store's count, far short of bigint's end.
  if p_current is null or p_current < 0 or p_current > 999999999999 then
    raise exception 'counter_out_of_range' using errcode = '23514', detail = 'A series counter is a whole number from 0 to 999,999,999,999.';
  end if;

  select p.prefix into v_prefix from private.series_prefix(p_merchant, p_series) p;
  if v_prefix is null then
    raise exception 'no_fiscal_year' using errcode = '23514',
      detail = 'No fiscal year covers today, so .FY. has nothing to print.';
  end if;

  insert into public.naming_series_counters (merchant_id, prefix, current_value)
  values (p_merchant, v_prefix, p_current)
  on conflict (merchant_id, prefix) do update set current_value = excluded.current_value;
end;
$$;

revoke execute on function public.update_series_counter(uuid, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.update_series_counter(uuid, text, bigint) to authenticated;

alter table public.naming_series_counters drop constraint if exists naming_series_counters_current_value_max;
alter table public.naming_series_counters
  add constraint naming_series_counters_current_value_max check (current_value <= 999999999999);

-- #3, #4 --------------------------------------------------------------------------------------------------------------

create or replace function public.claim_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.access_codes;
  v_name text;
  v_owner uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- Found-Abuse #4: one person's attempts one at a time, so the count below sees every earlier failure — a burst
  -- of guesses sent at once is counted as it is sent.
  perform pg_advisory_xact_lock(hashtextextended('claim_access_code:' || v_uid::text, 0));

  delete from private.access_code_failures f where f.user_id = v_uid and f.failed_at < now() - interval '15 minutes';
  if (select count(*) from private.access_code_failures f where f.user_id = v_uid) >= 10 then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  -- Locked: two people using a one-person code at once are served one after the other.
  select * into c from public.access_codes ac
  where ac.code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
  for update;

  if c.id is null or c.expires_at <= now() then
    insert into private.access_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', case when c.id is null then 'invalid' else 'expired' end);
  end if;

  select m.name, m.owner_id into v_name, v_owner from public.merchants m where m.id = c.merchant_id;

  v_status := case
    when v_owner = v_uid then 'own_system'
    when exists (select 1 from public.merchant_members mm where mm.merchant_id = c.merchant_id and mm.user_id = v_uid) then 'already_member'
    when exists (select 1 from public.access_requests r where r.merchant_id = c.merchant_id and r.user_id = v_uid and r.status = 'pending') then 'already_requested'
    -- A decline frees the code's use for someone else, not for the person declined.
    when exists (select 1 from public.access_requests r where r.access_code_id = c.id and r.user_id = v_uid and r.status = 'declined') then 'declined'
  end;
  if v_status is not null then
    return jsonb_build_object('status', v_status, 'merchant_name', v_name);
  end if;

  -- Found-Abuse #3: a request waiting on the owner holds its use for a day, then frees it for someone else.
  if c.max_uses is not null and (
    select count(*) from public.access_requests r
    where r.access_code_id = c.id
      and (r.status = 'approved' or (r.status = 'pending' and r.created_at > now() - interval '1 day'))
  ) >= c.max_uses then
    insert into private.access_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', 'used_up');
  end if;

  insert into public.access_requests (merchant_id, merchant_name, access_code_id, code, user_id, full_name, email, avatar_url)
  select c.merchant_id, v_name, c.id, c.code, v_uid, left(p.display_name, 120), u.email, left(p.avatar_url, 2048)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_uid;

  return jsonb_build_object('status', 'requested', 'merchant_name', v_name);
end;
$$;

revoke execute on function public.claim_access_code(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_access_code(text) to authenticated;

-- #5 ------------------------------------------------------------------------------------------------------------------

-- "Users can change the valuation method from FIFO to Moving Average, but not from Moving Average to FIFO, for items
-- with existing stock transactions." On an item: its own method, else Stock Settings'. On Stock Settings: the items
-- that follow it.
create or replace function private.guard_valuation_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default text;
begin
  if tg_table_name = 'items' then
    select s.valuation_method into v_default from public.stock_settings s where s.merchant_id = new.merchant_id;
    if coalesce(old.valuation_method, v_default, 'FIFO') = 'Moving Average'
      and coalesce(new.valuation_method, v_default, 'FIFO') = 'FIFO'
      and exists (select 1 from public.stock_ledger_entries e where e.item_id = new.id) then
      raise exception 'valuation_locked' using errcode = '23514',
        detail = 'An item with stock movements keeps Moving Average.';
    end if;
  elsif coalesce(old.valuation_method, 'FIFO') = 'Moving Average' and coalesce(new.valuation_method, 'FIFO') = 'FIFO'
    and exists (
      select 1 from public.items i join public.stock_ledger_entries e on e.item_id = i.id
      where i.merchant_id = new.merchant_id and i.valuation_method is null
    ) then
    raise exception 'valuation_locked' using errcode = '23514',
      detail = 'Items that follow Stock Settings have stock movements, so they keep Moving Average.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_valuation_method() from public, anon, authenticated, service_role;

drop trigger if exists items_guard_valuation on public.items;
create trigger items_guard_valuation before update of valuation_method on public.items
  for each row execute function private.guard_valuation_method();
drop trigger if exists stock_settings_guard_valuation on public.stock_settings;
create trigger stock_settings_guard_valuation before update of valuation_method on public.stock_settings
  for each row execute function private.guard_valuation_method();

-- #8 ------------------------------------------------------------------------------------------------------------------

create or replace function private.submit_stock_entries(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_entries;
  v_row public.stock_entry_items;
  v_perpetual boolean;
  v_from uuid;
  v_to uuid;
  v_out numeric;
  v_in numeric;
  v_gl jsonb := '[]'::jsonb;
  v_rows integer := 0;
begin
  select * into v_doc from public.stock_entries d where d.id = p_id;
  select m.enable_perpetual_inventory into v_perpetual from public.merchants m where m.id = v_doc.merchant_id;

  -- Found-Abuse #8: Receive Shipments brings stock in. Taking it out or moving it is Adjust Inventory's.
  if v_doc.purpose <> 'Material Receipt' and not private.has_permission(v_doc.merchant_id, 'adjust_inventory') then
    raise exception 'stock_purpose_not_permitted' using errcode = '42501',
      detail = 'A Material Issue or Transfer needs Adjust Inventory.';
  end if;

  if v_perpetual then
    v_from := private.warehouse_account(v_doc.from_warehouse);
    v_to := private.warehouse_account(v_doc.to_warehouse);

    if (v_doc.from_warehouse is not null and v_from is null) or (v_doc.to_warehouse is not null and v_to is null) then
      raise exception 'no_inventory_account' using errcode = '23514',
        detail = 'Neither the warehouse, its parents nor the store names an inventory account.';
    end if;
    if v_doc.difference_account is null then
      raise exception 'difference_account_required' using errcode = '23514',
        detail = 'With Perpetual Inventory on, the change in stock value needs a Difference Account.';
    end if;
  end if;

  for v_row in
    select * from public.stock_entry_items r where r.stock_entry_id = p_id order by r.idx
  loop
    v_rows := v_rows + 1;
    v_out := 0;
    v_in := 0;

    if v_doc.purpose = 'Material Receipt' then
      if coalesce(v_row.basic_rate, 0) <= 0 then
        raise exception 'rate_required' using errcode = '23514', detail = 'A receipt needs each row''s rate.';
      end if;
      v_in := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, v_row.basic_rate
      );
    else
      v_out := private.post_sle(
        v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.from_warehouse, -v_row.qty
      );
      if v_doc.purpose = 'Material Transfer' then
        v_in := private.post_sle(
          v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_row.item_id, v_doc.to_warehouse, v_row.qty, -v_out / v_row.qty
        );
      end if;
    end if;

    -- What the row moved, for the page: the rate it came in at, or the valuation it left at.
    update public.stock_entry_items r set
      basic_rate = case when v_doc.purpose = 'Material Receipt' then r.basic_rate else -v_out / r.qty end,
      amount = case when v_doc.purpose = 'Material Receipt' then v_in else -v_out end
    where r.id = v_row.id;

    v_gl := v_gl || jsonb_build_array(
      jsonb_build_object('account_id', v_from, 'amount', v_out),
      jsonb_build_object('account_id', v_to, 'amount', v_in),
      -- The stock value that came or went with no warehouse on the other side.
      jsonb_build_object('account_id', v_doc.difference_account, 'amount', -(v_out + v_in))
    );
  end loop;

  if v_rows = 0 then
    raise exception 'no_rows' using errcode = '23514', detail = 'A stock entry needs at least one item.';
  end if;

  if v_perpetual then
    perform private.post_gl(v_doc.merchant_id, 'Stock Entry', p_id, v_doc.name, v_doc.posting_date, v_gl);
  end if;
end;
$$;

revoke execute on function private.submit_stock_entries(uuid) from public, anon, authenticated, service_role;

insert into public.permission_rules (permission, doctype, ptype)
select 'adjust_inventory', 'Stock Entry', t.ptype
from (values ('create'), ('write'), ('delete'), ('submit')) as t (ptype)
on conflict do nothing;

update public.permissions set description = 'Record stock coming in.' where key = 'move_stock';
update public.permissions set description = 'Count stock and correct it, and take it out or move it between warehouses.'
where key = 'adjust_inventory';

-- #10 -----------------------------------------------------------------------------------------------------------------

-- An employee's exceptions are relative to their role: a new role, or none, starts them over. Definer, so it also
-- runs when a deleted role's foreign key sets role_id to null.
create or replace function private.clear_member_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_overrides o where o.member_id = new.id;
  return null;
end;
$$;

revoke execute on function private.clear_member_overrides() from public, anon, authenticated, service_role;

drop trigger if exists merchant_members_clear_overrides on public.merchant_members;
create trigger merchant_members_clear_overrides after update of role_id on public.merchant_members
  for each row when (old.role_id is distinct from new.role_id) execute function private.clear_member_overrides();

-- #11 -----------------------------------------------------------------------------------------------------------------

create or replace function private.prepare_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series text;
begin
  if tg_op = 'INSERT' then
    if (select s.item_naming_by from public.stock_settings s where s.merchant_id = new.merchant_id) = 'Naming Series' then
      select n.options[1] into v_series from public.naming_series n where n.merchant_id = new.merchant_id and n.document_type = 'Item';
      if v_series is null then
        raise exception 'no_item_series' using errcode = '23514', detail = 'Document Naming Settings has no series for Item.';
      end if;
      new.item_code := private.make_name(new.merchant_id, v_series);
    end if;

    new.item_code := btrim(coalesce(new.item_code, ''));
    if new.item_code = '' then
      raise exception 'item_code_required' using errcode = '23514', detail = 'Stock Settings names items by Item Code, and none was given.';
    end if;
  elsif new.item_code is distinct from old.item_code then
    raise exception 'item_code_locked' using errcode = '23514', detail = 'An item keeps its code.';
  end if;

  new.item_name := coalesce(nullif(btrim(coalesce(new.item_name, '')), ''), new.item_code);

  -- "Items are classified into it": a leaf, not a group.
  if (tg_op = 'INSERT' or new.item_group_id is distinct from old.item_group_id)
    and coalesce((select g.is_group from public.item_groups g where g.id = new.item_group_id and g.merchant_id = new.merchant_id), true) then
    raise exception 'item_group_is_group' using errcode = '23514', detail = 'An item goes in an item group that is not a group.';
  end if;

  -- Found-Abuse #11: the Register finds a scan by barcode, then by code, so neither may be another item's other one.
  -- Locked per store, so two saves at once cannot both pass.
  if tg_op = 'INSERT' or new.barcode is distinct from old.barcode then
    perform pg_advisory_xact_lock(hashtextextended(new.merchant_id::text || ':item-codes', 0));
    if exists (
      select 1 from public.items i
      where i.merchant_id = new.merchant_id and i.id <> new.id
        and (i.item_code = new.barcode or i.barcode = new.item_code)
    ) then
      raise exception 'barcode_conflict' using errcode = '23505', detail = 'Another item''s code or barcode is that value.';
    end if;
  elsif exists (
    select 1 from public.items i
    where i.merchant_id = new.merchant_id and i.id <> new.id and i.barcode = new.item_code
  ) then
    raise exception 'barcode_conflict' using errcode = '23505', detail = 'Another item''s barcode is this item''s code.';
  end if;

  return new;
end;
$$;

revoke execute on function private.prepare_item() from public, anon, authenticated, service_role;

-- #12 -----------------------------------------------------------------------------------------------------------------

create or replace function public.stock_alerts(p_merchant uuid, p_limit integer default 200)
returns table (
  item_id uuid, item_code text, item_name text, warehouse_id uuid, warehouse_name text, actual_qty numeric, reorder_level numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.item_code, t.item_name, w.id, w.warehouse_name, b.actual_qty, t.reorder_level
  from public.bins b
  join public.items t on t.id = b.item_id
  join public.warehouses w on w.id = b.warehouse_id
  where b.merchant_id = p_merchant
    and t.is_stock_item
    and not t.disabled
    and (b.actual_qty <= 0 or (coalesce(t.reorder_level, 0) > 0 and b.actual_qty <= t.reorder_level))
  order by b.actual_qty, t.item_code, w.warehouse_name
  -- Found-Abuse #12: what the Dashboard shows, never the whole table.
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
$$;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length check (char_length(display_name) <= 120) not valid;
alter table public.profiles validate constraint profiles_display_name_length;
alter table public.profiles drop constraint if exists profiles_avatar_url_shape;
alter table public.profiles
  add constraint profiles_avatar_url_shape check (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://') not valid;
alter table public.profiles validate constraint profiles_avatar_url_shape;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- Google and Facebook both land here through signInWithIdToken / the browser flow, and both
    -- populate these two keys. nullif keeps an empty string from masquerading as a set name.
    -- The jsonb ->> operator is in pg_catalog, so it still resolves under the empty search_path.
    -- Held to profiles' checks: a name cut at 120 characters, a photo kept only as an https address.
    left(nullif(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case when new.raw_user_meta_data ->> 'avatar_url' ~ '^https://' and char_length(new.raw_user_meta_data ->> 'avatar_url') <= 2048
      then new.raw_user_meta_data ->> 'avatar_url' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

-- Every store is seeded with its whole setup, so making them is not free.
-- ponytail: a fixed 20 per owner; a plan-based limit is a column on profiles when one is wanted.
create or replace function private.guard_store_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('merchants:' || new.owner_id::text, 0));
  if (select count(*) from public.merchants m where m.owner_id = new.owner_id) >= 20 then
    raise exception 'store_limit' using errcode = '23514', detail = 'An owner keeps at most 20 stores.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_store_count() from public, anon, authenticated, service_role;

drop trigger if exists merchants_store_count on public.merchants;
create trigger merchants_store_count before insert on public.merchants
  for each row execute function private.guard_store_count();
