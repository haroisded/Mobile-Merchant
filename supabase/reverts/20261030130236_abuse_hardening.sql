-- Revert of the abuse hardening (same filename under supabase/migrations/). Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- Destroys no data. Every function goes back to the body named in the migration's header, the new triggers and checks
-- are dropped, Adjust Inventory loses the Stock Entry rules it gained, and the two permissions' lines are restored. What
-- the hardening already did stays done: exceptions it cleared on a role change are not brought back.

drop trigger if exists merchants_store_count on public.merchants;
drop function if exists private.guard_store_count();
alter table public.profiles drop constraint if exists profiles_avatar_url_shape;
alter table public.profiles drop constraint if exists profiles_display_name_length;
drop trigger if exists merchant_members_clear_overrides on public.merchant_members;
drop function if exists private.clear_member_overrides();
delete from public.permission_rules where permission = 'adjust_inventory' and doctype = 'Stock Entry' and ptype in ('create', 'write', 'delete', 'submit');
update public.permissions set description = 'Record stock coming in, going out or moving between warehouses.' where key = 'move_stock';
update public.permissions set description = 'Count stock and correct it.' where key = 'adjust_inventory';
drop trigger if exists stock_settings_guard_valuation on public.stock_settings;
drop trigger if exists items_guard_valuation on public.items;
drop function if exists private.guard_valuation_method();
alter table public.naming_series_counters drop constraint if exists naming_series_counters_current_value_max;
drop trigger if exists accounts_settings_guard_ledger_switches on public.accounts_settings;
drop function if exists private.guard_ledger_switches();

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
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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
  limit p_limit;
$$;

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

  return new;
end;
$$;

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

  if c.max_uses is not null and (
    select count(*) from public.access_requests r where r.access_code_id = c.id and r.status in ('pending', 'approved')
  ) >= c.max_uses then
    insert into private.access_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', 'used_up');
  end if;

  insert into public.access_requests (merchant_id, merchant_name, access_code_id, code, user_id, full_name, email, avatar_url)
  select c.merchant_id, v_name, c.id, c.code, v_uid, p.display_name, u.email, p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_uid;

  return jsonb_build_object('status', 'requested', 'merchant_name', v_name);
end;
$$;

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

