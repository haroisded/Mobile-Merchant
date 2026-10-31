-- Reverts 20260930100000_receipt_inputs.sql.
--
-- DESTROYS DATA: every lot's packs_expected and units_per_pack_received. The cost per base unit a
-- merchant typed stays on the lots already saved; only new receipts go back to spreading freight.
--
-- FAILS while any receipt has no supplier or any lot has no lot number: the not null constraints cannot
-- come back over those rows. Give them a supplier and a lot number, or void and remove them, first.
--
-- Run this before 20260929100100_stock_ledger.sql's revert (.claude/instruction-mds/migrations.md rule 6), and
-- regenerate src/lib/database.types.ts after.

-- Does nothing once 20261008050254_revamp_drop_business_schema.sql has run: that drop-only migration took
-- public.products and every object below, and all-in-one/revert.sql reaches this block after it.
do $revert$
begin
  if to_regclass('public.products') is null then
    return;
  end if;

-- One lot, its cases and a row per pack, and a receive movement per pack. Shared by save_receipt,
-- add_inventory_stock and §7. The caller has locked the item and checked membership.
--
-- p_line: { cases?, packs_per_case?, cost_per_case?, case_sscc?, packs?, cost_per_pack?, loose_units?,
--           unit_loads?, pallets_per_unit_load?, unit_load_sscc?, pallets?, cases_per_pallet?,
--           pallet_sscc?, lot_code?, expires_on?, location?, notes?, serials?: text[] }
create or replace function private.create_lot(
  p_item public.products, p_receipt public.stock_receipts, p_position integer, p_line jsonb
)
returns public.stock_lots
language plpgsql
set search_path = ''
as $$
declare
  v_merchant uuid := p_item.merchant_id;
  v_on date := coalesce(p_receipt.received_on, current_date);
  v_upp numeric := coalesce(p_item.conversion_factor, 1);
  v_cases integer := nullif((p_line ->> 'cases')::integer, 0);
  v_per_case integer;
  v_packs integer;
  v_loose numeric := coalesce((p_line ->> 'loose_units')::numeric, 0);
  v_cost numeric;
  v_serials text[];
  v_lot public.stock_lots;
  v_case_id uuid;
  v_pack public.stock_packs;
  v_n integer := 0;
  i integer;
  j integer;
begin
  -- Case tier: cost is entered per case, and the pack cost follows.
  if v_cases is not null then
    v_per_case := (p_line ->> 'packs_per_case')::integer;
    if coalesce(v_per_case, 0) <= 0 or (p_line ->> 'cost_per_case') is null then
      raise exception 'receipt_line_case_tier' using errcode = '23514';
    end if;
    v_packs := v_cases * v_per_case;
    v_cost := (p_line ->> 'cost_per_case')::numeric / v_per_case;
  else
    v_packs := coalesce((p_line ->> 'packs')::integer, 0);
    v_cost := coalesce((p_line ->> 'cost_per_pack')::numeric, coalesce(p_item.cost_price, 0) * v_upp);
  end if;

  if v_packs < 0 or v_loose < 0 or v_loose >= v_upp or v_packs * v_upp + v_loose <= 0 then
    raise exception 'receipt_line_quantity' using errcode = '23514';
  end if;

  -- Has expiry: a received line needs its date. An Inventory add may leave it blank.
  if p_receipt.id is not null and p_item.perishable and (p_line ->> 'expires_on') is null then
    raise exception 'receipt_line_expiry_required' using errcode = '23514';
  end if;

  select coalesce(array_agg(btrim(s.serial) order by s.ord), '{}') into v_serials
  from jsonb_array_elements_text(coalesce(p_line -> 'serials', '[]')) with ordinality as s (serial, ord)
  where btrim(s.serial) <> '';
  if cardinality(v_serials) > v_packs then
    raise exception 'receipt_line_serial_count'
      using errcode = '23514', detail = 'More serial numbers than packs.';
  end if;

  -- issue_code only runs when no lot number was typed, so a typed one never burns a counter value.
  insert into public.stock_lots (
    merchant_id, source, receipt_id, position, product_id, code, units_per_pack,
    unit_loads, pallets_per_unit_load, unit_load_sscc, pallets, cases_per_pallet, pallet_sscc,
    cases, packs_per_case, cost_per_case, case_sscc,
    packs_received, loose_units, cost_per_pack, expires_on, location, notes
  ) values (
    v_merchant, case when p_receipt.id is null then 'inventory' else 'stock' end::public.stock_lot_source,
    p_receipt.id, p_position, p_item.id,
    coalesce(
      nullif(btrim(p_line ->> 'lot_code'), ''),
      private.issue_code(v_merchant, 'lot', 'LOT-' || to_char(v_on, 'YYYYMMDD') || '-', 3, 'public.stock_lots', 'code')
    ),
    v_upp,
    nullif((p_line ->> 'unit_loads')::integer, 0), nullif((p_line ->> 'pallets_per_unit_load')::integer, 0),
    nullif(btrim(p_line ->> 'unit_load_sscc'), ''),
    nullif((p_line ->> 'pallets')::integer, 0), nullif((p_line ->> 'cases_per_pallet')::integer, 0),
    nullif(btrim(p_line ->> 'pallet_sscc'), ''),
    v_cases, v_per_case, case when v_cases is not null then (p_line ->> 'cost_per_case')::numeric end,
    nullif(btrim(p_line ->> 'case_sscc'), ''),
    v_packs, v_loose, v_cost,
    (p_line ->> 'expires_on')::date,
    coalesce(nullif(btrim(p_line ->> 'location'), ''), p_receipt.location, p_item.storage_location),
    nullif(btrim(p_line ->> 'notes'), '')
  )
  returning * into v_lot;

  -- Packs in cases first, then loose packs, then the partial pack the loose units make.
  for i in 0 .. coalesce(v_cases, 0) loop
    v_case_id := null;
    if i > 0 then
      insert into public.stock_cases (merchant_id, lot_id, code, sscc)
      values (
        v_merchant, v_lot.id,
        private.issue_code(v_merchant, 'case', 'CS-', 4, 'public.stock_cases', 'code'),
        -- The one SSCC typed on the form labels the first case.
        case when i = 1 then v_lot.case_sscc end
      )
      returning id into v_case_id;
    end if;

    for j in 1 .. case when i = 0 then (case when v_cases is null then v_packs else 0 end) else v_per_case end loop
      v_n := v_n + 1;
      insert into public.stock_packs (merchant_id, product_id, lot_id, case_id, code, serial, units, qty_remaining)
      values (
        v_merchant, p_item.id, v_lot.id, v_case_id,
        private.issue_code(v_merchant, 'pack', 'PK-', 6, 'public.stock_packs', 'code'),
        v_serials[v_n], v_upp, v_upp
      )
      returning * into v_pack;

      insert into public.stock_movements (merchant_id, product_id, lot_id, pack_id, kind, qty, ref, created_by)
      values (v_merchant, p_item.id, v_lot.id, v_pack.id, 'receive', v_upp, coalesce(p_receipt.code, v_lot.code),
        (select auth.uid()));
    end loop;
  end loop;

  if v_loose > 0 then
    insert into public.stock_packs (merchant_id, product_id, lot_id, code, units, qty_remaining, opened_at)
    values (
      v_merchant, p_item.id, v_lot.id,
      private.issue_code(v_merchant, 'pack', 'PK-', 6, 'public.stock_packs', 'code'),
      v_upp, v_loose, now()
    )
    returning * into v_pack;

    insert into public.stock_movements (merchant_id, product_id, lot_id, pack_id, kind, qty, ref, created_by)
    values (v_merchant, p_item.id, v_lot.id, v_pack.id, 'receive', v_loose, coalesce(p_receipt.code, v_lot.code),
      (select auth.uid()));
  end if;

  -- No freight yet; save_receipt spreads it once every line is in.
  update public.stock_lots set unit_cost = line_cost / qty_received where id = v_lot.id
  returning * into v_lot;
  return v_lot;
end;
$$;

revoke execute on function private.create_lot(public.products, public.stock_receipts, integer, jsonb)
  from public, anon, authenticated, service_role;


-- save_receipt(payload): {
--   merchant_id, supplier_id, invoice_no?, received_on?, received_by?, location?, freight?, notes?,
--   lines: [{ product_id | new_item: { item, group_name? }, ...private.create_lot's p_line }]
-- }
-- Returns the receipt id. A saved receipt never changes; void_receipt and record_stock_movement make
-- the corrections.
create or replace function public.save_receipt(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.stock_receipts;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_supplier uuid := (payload ->> 'supplier_id')::uuid;
  v_freight numeric := coalesce((payload ->> 'freight')::numeric, 0);
  v_line jsonb;
  v_pos integer := 0;
  v_item public.products;
  v_item_id uuid;
  v_lot public.stock_lots;
  v_value_total numeric;
  v_qty_total numeric;
  v_left numeric;
  v_share numeric;
begin
  perform private.assert_member(v_merchant);

  if v_supplier is null or not exists (
    select 1 from public.suppliers s where s.id = v_supplier and s.merchant_id = v_merchant and s.active
  ) then
    raise exception 'supplier_not_available' using errcode = '23514';
  end if;
  if jsonb_array_length(coalesce(payload -> 'lines', '[]')) = 0 then
    raise exception 'receipt_has_no_lines' using errcode = '23514';
  end if;

  insert into public.stock_receipts (
    merchant_id, code, supplier_id, invoice_no, received_on, received_by, location, freight, notes, created_by
  ) values (
    v_merchant,
    private.issue_code(v_merchant, 'receipt', 'RC-', 4, 'public.stock_receipts', 'code'),
    v_supplier,
    nullif(btrim(payload ->> 'invoice_no'), ''),
    coalesce((payload ->> 'received_on')::date, current_date),
    nullif(btrim(payload ->> 'received_by'), ''),
    nullif(btrim(payload ->> 'location'), ''),
    v_freight,
    nullif(btrim(payload ->> 'notes'), ''),
    (select auth.uid())
  )
  returning * into r;

  for v_line in select e.value from jsonb_array_elements(payload -> 'lines') as e (value) loop
    v_pos := v_pos + 1;

    -- A new item is made inside the transaction, so an abandoned receipt leaves no orphan item.
    if v_line ? 'new_item' then
      v_item_id := public.save_stock_item(jsonb_build_object(
        'item', (v_line -> 'new_item' -> 'item') || jsonb_build_object('id', null, 'merchant_id', v_merchant),
        'group_name', v_line -> 'new_item' -> 'group_name'
      ));
    else
      v_item_id := (v_line ->> 'product_id')::uuid;
    end if;

    select * into v_item from public.products
    where id = v_item_id and merchant_id = v_merchant and type = 'stock' and status <> 'archived'
    for update;
    if v_item.id is null then
      raise exception 'stock_item_not_found' using errcode = 'P0002';
    end if;

    perform private.create_lot(v_item, r, v_pos, v_line);
  end loop;

  -- Freight: spread by line value, or by quantity when every line cost nothing. The last line takes
  -- what rounding leaves, so the shares add up to the freight exactly.
  select coalesce(sum(l.line_cost), 0), coalesce(sum(l.qty_received), 0) into v_value_total, v_qty_total
  from public.stock_lots l where l.receipt_id = r.id;
  v_left := v_freight;

  for v_lot in select * from public.stock_lots l where l.receipt_id = r.id order by l.position loop
    v_share := case
      when v_lot.position = v_pos then v_left
      when v_value_total > 0 then round(v_freight * v_lot.line_cost / v_value_total, 2)
      else round(v_freight * v_lot.qty_received / v_qty_total, 2)
    end;
    v_left := v_left - v_share;

    update public.stock_lots
    set freight_share = v_share, unit_cost = (v_lot.line_cost + v_share) / v_lot.qty_received
    where id = v_lot.id;
  end loop;

  perform private.recompute_stock(l.product_id)
  from (select distinct product_id from public.stock_lots where receipt_id = r.id) l;

  return r.id;
end;
$$;

revoke execute on function public.save_receipt(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_receipt(jsonb) to authenticated;

alter table if exists public.stock_lots drop constraint if exists stock_lots_expected_positive;
alter table if exists public.stock_lots drop column if exists units_per_pack_received;
alter table if exists public.stock_lots drop column if exists packs_expected;
alter table if exists public.stock_lots alter column code set not null;

alter table if exists public.stock_receipts alter column supplier_id set not null;
end
$revert$;
