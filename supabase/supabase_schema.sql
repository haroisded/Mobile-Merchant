--
-- PostgreSQL database dump
--

\restrict Ma1CgezS4yeK89OHuWjI1EVjVSeKybdv4OTecbny9IEYQbUq6cDBgiFq3mAHwyR

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bins (
    merchant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    actual_qty numeric DEFAULT 0 NOT NULL,
    valuation_rate numeric DEFAULT 0 NOT NULL,
    stock_value numeric DEFAULT 0 NOT NULL,
    fifo_queue jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_posting_date date
);


--
-- Name: cancel_document(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_document(p_doctype text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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

  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'cancel')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 1 then
    raise exception 'not_submitted' using errcode = '23514', detail = 'Only a submitted document can be cancelled.';
  end if;

  perform private.cancel_sle(v_merchant, p_doctype, p_id);
  perform private.cancel_gl(v_merchant, p_doctype, p_id);
  execute format('update public.%I set docstatus = 2 where id = $1', v_table) using p_id;
end;
$_$;


--
-- Name: claim_access_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_access_code(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: close_pos_session(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_pos_session(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  insert into public.pos_closing_entries (merchant_id, posting_date, pos_opening_entry_id)
  values (v_merchant, private.merchant_today(v_merchant), (payload ->> 'pos_opening_entry_id')::uuid)
  returning id into v_id;

  insert into public.pos_closing_entry_payments (merchant_id, pos_closing_entry_id, idx, mode_of_payment_id, closing_amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, coalesce(t.closing_amount, 0)
  from jsonb_populate_recordset(null::public.pos_closing_entry_payments, coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Closing Entry', v_id);
  return v_id;
end;
$$;


--
-- Name: access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    code text NOT NULL,
    label text,
    expires_at timestamp with time zone,
    max_uses integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_codes_code_shape CHECK ((code ~ '^[2-9A-HJ-NP-Z]{6}$'::text)),
    CONSTRAINT access_codes_label_length CHECK (((label IS NULL) OR ((length(label) >= 1) AND (length(label) <= 40)))),
    CONSTRAINT access_codes_max_uses CHECK (((max_uses IS NULL) OR (max_uses >= 1)))
);


--
-- Name: create_access_codes(uuid, text, integer, integer, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_access_codes(p_merchant uuid, p_label text DEFAULT NULL::text, p_quantity integer DEFAULT 1, p_expires_minutes integer DEFAULT NULL::integer, p_expires_on date DEFAULT NULL::date, p_max_uses integer DEFAULT NULL::integer) RETURNS SETOF public.access_codes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_expires timestamptz;
  v_code text;
  v_row public.access_codes;
begin
  if not exists (select 1 from public.merchants m where m.id = p_merchant and m.owner_id = (select auth.uid())) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity not between 1 and 20 then
    raise exception 'invalid_quantity' using errcode = '22023', detail = 'Make 1 to 20 codes at a time.';
  end if;

  if p_expires_minutes is not null then
    if p_expires_minutes < 1 then
      raise exception 'invalid_expiry' using errcode = '22023';
    end if;
    v_expires := now() + make_interval(mins => p_expires_minutes);
  elsif p_expires_on is not null then
    if p_expires_on < private.merchant_today(p_merchant) then
      raise exception 'expiry_in_past' using errcode = '22023', detail = 'Pick today or a later day.';
    end if;
    v_expires := (p_expires_on + 1)::timestamp at time zone coalesce(
      (select s.time_zone from public.system_settings s where s.merchant_id = p_merchant), 'UTC'
    );
  end if;

  for i in 1 .. p_quantity loop
    loop
      -- 256 is a multiple of 32, so every character is equally likely.
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(b.bytes, n) % 32 + 1, 1), '' order by n)
      into v_code
      from (select extensions.gen_random_bytes(6) as bytes) b, generate_series(0, 5) as n;

      insert into public.access_codes (merchant_id, code, label, expires_at, max_uses)
      values (p_merchant, v_code, nullif(btrim(p_label), ''), v_expires, p_max_uses)
      on conflict (code) do nothing
      returning * into v_row;

      -- Taken already (one in a billion per code): draw again.
      exit when v_row.id is not null;
    end loop;

    return next v_row;
  end loop;
end;
$$;


--
-- Name: dashboard_cards(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dashboard_cards(p_merchant uuid, p_from date, p_to date) RETURNS TABLE(sales numeric, invoices bigint, gross_profit numeric, open_registers bigint, expected_cash numeric, low_stock bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with sold as (
    select i.id, i.net_total, i.is_return
    from public.pos_invoices i
    where i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date between p_from and p_to
  ),
  open_sessions as (
    select s.id
    from public.pos_opening_entries s
    where s.merchant_id = p_merchant and s.docstatus = 1 and s.status = 'Open'
  ),
  session_sales as (
    select i.id, i.change_amount
    from public.pos_invoices i
    where i.pos_opening_entry_id in (select o.id from open_sessions o) and i.docstatus = 1
  )
  select
    coalesce((select sum(s.net_total) from sold s), 0),
    (select count(*) from sold s where not s.is_return),
    case
      when p_merchant in (select private.permitted_merchant_ids('Stock Ledger Entry', 'read')) then
        coalesce((
          select sum(r.net_amount - coalesce(r.valuation_rate, 0) * r.stock_qty)
          from public.pos_invoice_items r
          where r.pos_invoice_id in (select s.id from sold s)
        ), 0)
    end,
    (select count(*) from open_sessions),
    coalesce((
      select sum(b.opening_amount)
      from public.pos_opening_entry_balances b
      join public.modes_of_payment m on m.id = b.mode_of_payment_id
      where b.pos_opening_entry_id in (select o.id from open_sessions o) and m.type = 'Cash'
    ), 0)
    + coalesce((
      select sum(p.amount)
      from public.pos_invoice_payments p
      join public.modes_of_payment m on m.id = p.mode_of_payment_id
      where p.pos_invoice_id in (select x.id from session_sales x) and m.type = 'Cash'
    ), 0)
    - coalesce((
      select sum(x.change_amount)
      from session_sales x
      where x.change_amount > 0 and exists (
        select 1
        from public.pos_invoice_payments p
        join public.modes_of_payment m on m.id = p.mode_of_payment_id
        where p.pos_invoice_id = x.id and m.type = 'Cash'
      )
    ), 0),
    (select count(distinct a.item_id) from public.stock_alerts(p_merchant, null) a);
$$;


--
-- Name: decide_access_request(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decide_access_request(p_request uuid, p_approve boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  r public.access_requests;
begin
  select * into r from public.access_requests ar
  where ar.id = p_request
    and ar.merchant_id in (select m.id from public.merchants m where m.owner_id = (select auth.uid()))
  for update;

  if r.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_decided' using errcode = '23514', detail = 'This request was already approved or declined.';
  end if;

  update public.access_requests
  set status = case when p_approve then 'approved' when not p_approve then 'declined' end, decided_at = now()
  where id = r.id;

  if p_approve then
    insert into public.merchant_members (merchant_id, user_id, email, full_name, avatar_url, access_code)
    values (r.merchant_id, r.user_id, r.email, left(r.full_name, 120), r.avatar_url, r.code)
    on conflict (merchant_id, user_id) do nothing;
  end if;
end;
$$;


--
-- Name: delete_current_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_current_user() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- The only row this can ever touch is the caller's own. For an unauthenticated caller auth.uid()
  -- is null and `id = null` matches nothing, so the failure mode is deleting zero rows; the grant
  -- below is what actually keeps anon out. public.profiles goes with it through the cascade.
  delete from auth.users where id = (select auth.uid());
$$;


--
-- Name: delete_document(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_document(p_doctype text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: import_items(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_items(p_merchant uuid, p_rows jsonb) RETURNS TABLE(item_code text, item_name text)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_count integer := case when jsonb_typeof(p_rows) = 'array' then jsonb_array_length(p_rows) else 0 end;
  v_warehouse uuid;
  v_row jsonb;
  v_n integer := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_opening numeric;
  v_rate numeric;
  v_stock jsonb := '[]'::jsonb;
  v_reconciliation uuid;
  v_state text;
  v_message text;
  v_detail text;
begin
  if v_count < 1 then
    raise exception 'no_rows' using errcode = '23514', detail = 'The file has no item rows.';
  elsif v_count > 500 then
    raise exception 'too_many_rows' using errcode = '23514', detail = 'A file holds at most 500 items.';
  end if;

  select s.default_warehouse into v_warehouse from public.stock_settings s where s.merchant_id = p_merchant;

  begin
    for v_row, v_n in select r.value, r.idx from jsonb_array_elements(p_rows) with ordinality as r (value, idx) loop
      v_id := public.save_item(v_row || jsonb_build_object(
        'id', '', 'merchant_id', p_merchant, 'default_warehouse', coalesce(v_warehouse::text, '')
      ));
      v_ids := v_ids || v_id;

      v_opening := nullif(v_row ->> 'opening_stock', '')::numeric;
      if coalesce(v_opening, 0) > 0 and coalesce((v_row ->> 'is_stock_item')::boolean, true) then
        v_rate := coalesce(nullif(v_row ->> 'valuation_rate', '')::numeric, nullif(v_row ->> 'standard_rate', '')::numeric);
        if coalesce(v_rate, 0) <= 0 then
          raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Valuation Rate is mandatory if Opening Stock is entered.';
        end if;
        if v_warehouse is null then
          raise exception 'no_default_warehouse' using errcode = '23514', detail = 'Stock Settings names no warehouse for the opening stock.';
        end if;

        v_stock := v_stock || jsonb_build_object('item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate);
      end if;
    end loop;

    -- Past the rows: what fails from here is the reconciliation.
    v_n := 0;
    if jsonb_array_length(v_stock) > 0 then
      v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
        'merchant_id', p_merchant, 'purpose', 'Opening Stock', 'items', v_stock
      ));
      perform public.submit_document('Stock Reconciliation', v_reconciliation);
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
    raise exception using
      errcode = v_state, message = v_message, detail = v_detail,
      hint = case when v_n > 0 then 'row ' || v_n else 'opening stock' end;
  end;

  return query
  select i.item_code, i.item_name
  from unnest(v_ids) with ordinality as u (id, idx)
  join public.items i on i.id = u.id
  order by u.idx;
end;
$$;


--
-- Name: my_permissions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_permissions(p_merchant uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_owner_email text;
  v_owner_name text;
  v_keys text[];
  v_perms jsonb;
begin
  select m.owner_id, u.email, p.display_name into v_owner, v_owner_email, v_owner_name
  from public.merchants m
  join auth.users u on u.id = m.owner_id
  left join public.profiles p on p.id = m.owner_id
  where m.id = p_merchant;

  if v_owner is null or v_uid is null then
    return null;
  end if;

  if v_owner = v_uid then
    select jsonb_object_agg(d.name, jsonb_build_object(
      'select', true, 'read', true, 'write', true, 'create', true, 'delete', true, 'submit', true, 'cancel', true
    ))
    into v_perms from public.doctypes d;
    select array_agg(p.key order by p.position) into v_keys from public.permissions p;
  elsif exists (select 1 from public.merchant_members mm where mm.merchant_id = p_merchant and mm.user_id = v_uid) then
    select coalesce(array_agg(k.permission order by p.position), '{}')
    into v_keys
    from private.my_permission_keys() k
    join public.permissions p on p.key = k.permission
    where k.merchant_id = p_merchant;

    select coalesce(jsonb_object_agg(x.doctype, jsonb_build_object(
      'select', x.can_select or x.can_read, 'read', x.can_read, 'write', x.can_write, 'create', x.can_create,
      'delete', x.can_delete, 'submit', x.can_submit, 'cancel', x.can_cancel
    )), '{}'::jsonb)
    into v_perms
    from (
      select r.doctype,
        bool_or(r.ptype = 'select') as can_select,
        bool_or(r.ptype = 'read') as can_read,
        bool_or(r.ptype = 'write') as can_write,
        bool_or(r.ptype = 'create') as can_create,
        bool_or(r.ptype = 'delete') as can_delete,
        bool_or(r.ptype = 'submit') as can_submit,
        bool_or(r.ptype = 'cancel') as can_cancel
      from public.permission_rules r
      where r.permission = any (v_keys)
      group by r.doctype
    ) x;
  else
    return null;
  end if;

  return jsonb_build_object(
    'is_owner', v_owner = v_uid,
    'owner_email', v_owner_email,
    'owner_name', v_owner_name,
    'perms', v_perms,
    'permissions', to_jsonb(v_keys)
  );
end;
$$;


--
-- Name: naming_series_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naming_series_preview(p_merchant uuid) RETURNS TABLE(document_type text, series text, prefix text, current_value bigint, next_name text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    n.document_type,
    o.series,
    p.prefix,
    coalesce(c.current_value, 0),
    p.prefix || lpad(
      (coalesce(c.current_value, 0) + 1)::text,
      greatest(p.digits, length((coalesce(c.current_value, 0) + 1)::text)),
      '0'
    )
  from public.naming_series n
  cross join lateral unnest(n.options) with ordinality as o (series, idx)
  cross join lateral private.series_prefix(n.merchant_id, o.series) p
  left join public.naming_series_counters c on c.merchant_id = n.merchant_id and c.prefix = p.prefix
  where n.merchant_id = p_merchant
  order by n.document_type, o.idx;
$$;


--
-- Name: open_pos_session(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_pos_session(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  insert into public.pos_opening_entries (merchant_id, posting_date, pos_profile_id)
  values (v_merchant, private.merchant_today(v_merchant), (payload ->> 'pos_profile_id')::uuid)
  returning id into v_id;

  insert into public.pos_opening_entry_balances (merchant_id, pos_opening_entry_id, idx, mode_of_payment_id, opening_amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, coalesce(t.opening_amount, 0)
  from jsonb_populate_recordset(null::public.pos_opening_entry_balances, coalesce(payload -> 'balances', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Opening Entry', v_id);
  return v_id;
end;
$$;


--
-- Name: pos_checkout(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_checkout(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_doc public.pos_invoices := jsonb_populate_record(null::public.pos_invoices, payload);
begin
  insert into public.pos_invoices (
    merchant_id, posting_date, pos_profile_id, pos_opening_entry_id, taxes_and_charges, net_total, total_taxes_and_charges,
    grand_total, rounding_adjustment, rounded_total, paid_amount, change_amount, write_off_amount, is_return, return_against,
    apply_discount_on, additional_discount_percentage, discount_amount
  )
  values (
    v_merchant, private.merchant_today(v_merchant), v_doc.pos_profile_id, v_doc.pos_opening_entry_id, v_doc.taxes_and_charges,
    coalesce(v_doc.net_total, 0), coalesce(v_doc.total_taxes_and_charges, 0), coalesce(v_doc.grand_total, 0),
    coalesce(v_doc.rounding_adjustment, 0), coalesce(v_doc.rounded_total, 0), coalesce(v_doc.paid_amount, 0),
    coalesce(v_doc.change_amount, 0), coalesce(v_doc.write_off_amount, 0), v_doc.return_against is not null, v_doc.return_against,
    coalesce(v_doc.apply_discount_on, 'Grand Total'), coalesce(v_doc.additional_discount_percentage, 0),
    coalesce(v_doc.discount_amount, 0)
  )
  returning id into v_id;

  insert into public.pos_invoice_items (
    merchant_id, pos_invoice_id, idx, item_id, qty, uom_id, conversion_factor, stock_qty, price_list_rate, rate, amount,
    net_rate, net_amount, item_tax_template_id, return_against_item,
    discount_percentage, discount_amount, distributed_discount_amount, pricing_rule_id
  )
  select
    v_merchant, v_id, t.ordinality, t.item_id, t.qty, t.uom_id, t.conversion_factor, t.stock_qty, coalesce(t.price_list_rate, 0),
    t.rate, t.amount, t.net_rate, t.net_amount, t.item_tax_template_id, t.return_against_item,
    coalesce(t.discount_percentage, 0), coalesce(t.discount_amount, 0), coalesce(t.distributed_discount_amount, 0), t.pricing_rule_id
  from jsonb_populate_recordset(null::public.pos_invoice_items, coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_taxes (
    merchant_id, pos_invoice_id, idx, charge_type, account_head, description, rate, row_id, included_in_print_rate, cost_center,
    tax_amount, total, item_wise_tax_detail
  )
  select
    v_merchant, v_id, t.ordinality, t.charge_type, t.account_head, t.description, coalesce(t.rate, 0), t.row_id,
    coalesce(t.included_in_print_rate, false), t.cost_center, coalesce(t.tax_amount, 0), coalesce(t.total, 0),
    coalesce(t.item_wise_tax_detail, '[]'::jsonb)
  from jsonb_populate_recordset(null::public.pos_invoice_taxes, coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as t;

  insert into public.pos_invoice_payments (merchant_id, pos_invoice_id, idx, mode_of_payment_id, amount)
  select v_merchant, v_id, t.ordinality, t.mode_of_payment_id, t.amount
  from jsonb_populate_recordset(null::public.pos_invoice_payments, coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as t;

  perform public.submit_document('POS Invoice', v_id);
  return v_id;
end;
$$;


--
-- Name: sales_by_day(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sales_by_day(p_merchant uuid, p_from date, p_to date) RETURNS TABLE(day date, sales numeric, invoices bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select d.day::date, coalesce(sum(i.net_total), 0), count(i.id) filter (where not i.is_return)
  from generate_series(p_from::timestamp, least(p_to, p_from + 366)::timestamp, interval '1 day') as d (day)
  left join public.pos_invoices i
    on i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date = d.day::date
  group by d.day
  order by d.day;
$$;


--
-- Name: save_item(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_rate numeric := nullif(payload ->> 'standard_rate', '')::numeric;
  v_list uuid;
begin
  if v_id is null then
    insert into public.items (
      merchant_id, item_code, item_name, item_group_id, stock_uom, description, brand_id, disabled, is_stock_item,
      valuation_method, allow_negative_stock, reorder_level, sales_uom,
      default_warehouse, default_price_list, selling_cost_center, income_account, expense_account,
      max_discount, discount_account
    )
    values (
      v_merchant,
      payload ->> 'item_code',
      payload ->> 'item_name',
      (payload ->> 'item_group_id')::uuid,
      (payload ->> 'stock_uom')::uuid,
      nullif(btrim(payload ->> 'description'), ''),
      nullif(payload ->> 'brand_id', '')::uuid,
      coalesce((payload ->> 'disabled')::boolean, false),
      coalesce((payload ->> 'is_stock_item')::boolean, true),
      nullif(payload ->> 'valuation_method', ''),
      coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      nullif(payload ->> 'reorder_level', '')::numeric,
      nullif(payload ->> 'sales_uom', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'selling_cost_center', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid,
      coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      nullif(payload ->> 'discount_account', '')::uuid
    )
    returning id into v_id;

    if coalesce(v_rate, 0) > 0 then
      select s.default_price_list into v_list from public.selling_settings s where s.merchant_id = v_merchant;
      if v_list is null then
        raise exception 'no_default_price_list' using errcode = '23514',
          detail = 'Selling Settings names no default price list for the Standard Selling Rate.';
      end if;

      insert into public.item_prices (merchant_id, item_id, price_list_id, uom_id, price_list_rate)
      values (v_merchant, v_id, v_list, (payload ->> 'stock_uom')::uuid, v_rate);
    end if;
  else
    update public.items set
      item_name = payload ->> 'item_name',
      item_group_id = (payload ->> 'item_group_id')::uuid,
      stock_uom = (payload ->> 'stock_uom')::uuid,
      description = nullif(btrim(payload ->> 'description'), ''),
      brand_id = nullif(payload ->> 'brand_id', '')::uuid,
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      is_stock_item = coalesce((payload ->> 'is_stock_item')::boolean, true),
      valuation_method = nullif(payload ->> 'valuation_method', ''),
      allow_negative_stock = coalesce((payload ->> 'allow_negative_stock')::boolean, false),
      reorder_level = nullif(payload ->> 'reorder_level', '')::numeric,
      sales_uom = nullif(payload ->> 'sales_uom', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid,
      max_discount = coalesce(nullif(payload ->> 'max_discount', '')::numeric, 0),
      discount_account = nullif(payload ->> 'discount_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_uoms where item_id = v_id;

  insert into public.item_uoms (merchant_id, item_id, idx, uom_id, conversion_factor)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'uom_id')::uuid, (r.value ->> 'conversion_factor')::numeric
  from jsonb_array_elements(coalesce(payload -> 'uoms', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.item_taxes where item_id = v_id;

  insert into public.item_taxes (merchant_id, item_id, idx, item_tax_template_id, tax_category_id, valid_from)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_item_group(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_group(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.item_groups (
      merchant_id, item_group_name, parent_id, is_group,
      default_price_list, default_warehouse, selling_cost_center, income_account, expense_account
    )
    values (
      v_merchant,
      btrim(payload ->> 'item_group_name'),
      nullif(payload ->> 'parent_id', '')::uuid,
      coalesce((payload ->> 'is_group')::boolean, false),
      nullif(payload ->> 'default_price_list', '')::uuid,
      nullif(payload ->> 'default_warehouse', '')::uuid,
      nullif(payload ->> 'selling_cost_center', '')::uuid,
      nullif(payload ->> 'income_account', '')::uuid,
      nullif(payload ->> 'expense_account', '')::uuid
    )
    returning id into v_id;
  else
    update public.item_groups set
      item_group_name = btrim(payload ->> 'item_group_name'),
      parent_id = nullif(payload ->> 'parent_id', '')::uuid,
      is_group = coalesce((payload ->> 'is_group')::boolean, false),
      default_price_list = nullif(payload ->> 'default_price_list', '')::uuid,
      default_warehouse = nullif(payload ->> 'default_warehouse', '')::uuid,
      selling_cost_center = nullif(payload ->> 'selling_cost_center', '')::uuid,
      income_account = nullif(payload ->> 'income_account', '')::uuid,
      expense_account = nullif(payload ->> 'expense_account', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'item_group_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_group_taxes where item_group_id = v_id;

  insert into public.item_group_taxes (
    merchant_id, item_group_id, idx, item_tax_template_id, tax_category_id, valid_from, minimum_net_rate, maximum_net_rate
  )
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_tax_template_id')::uuid,
    nullif(r.value ->> 'tax_category_id', '')::uuid,
    nullif(r.value ->> 'valid_from', '')::date,
    coalesce(nullif(r.value ->> 'minimum_net_rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'maximum_net_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'taxes', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_item_tax_template(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_tax_template(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.item_tax_templates (merchant_id, title, disabled)
    values (v_merchant, btrim(payload ->> 'title'), coalesce((payload ->> 'disabled')::boolean, false))
    returning id into v_id;
  else
    update public.item_tax_templates set
      title = btrim(payload ->> 'title'),
      disabled = coalesce((payload ->> 'disabled')::boolean, false)
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.item_tax_template_rows where template_id = v_id;

  insert into public.item_tax_template_rows (merchant_id, template_id, idx, account, tax_rate, not_applicable)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'account')::uuid,
    coalesce(nullif(r.value ->> 'tax_rate', '')::numeric, 0),
    coalesce((r.value ->> 'not_applicable')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_item_with_opening_stock(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_with_opening_stock(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_new boolean := nullif(payload ->> 'id', '') is null;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_opening numeric := nullif(payload ->> 'opening_stock', '')::numeric;
  v_rate numeric := coalesce(nullif(payload ->> 'valuation_rate', '')::numeric, nullif(payload ->> 'standard_rate', '')::numeric);
  v_id uuid;
  v_warehouse uuid;
  v_reconciliation uuid;
begin
  v_id := public.save_item(payload);

  if not v_new or coalesce(v_opening, 0) <= 0 or not coalesce((payload ->> 'is_stock_item')::boolean, true) then
    return v_id;
  end if;

  if coalesce(v_rate, 0) <= 0 then
    raise exception 'valuation_rate_required' using errcode = '23514', detail = 'Valuation Rate is mandatory if Opening Stock is entered.';
  end if;

  v_warehouse := coalesce(
    nullif(payload ->> 'default_warehouse', '')::uuid,
    (select s.default_warehouse from public.stock_settings s where s.merchant_id = v_merchant)
  );
  if v_warehouse is null then
    raise exception 'no_default_warehouse' using errcode = '23514',
      detail = 'Neither the item nor Stock Settings names a warehouse for the opening stock.';
  end if;

  v_reconciliation := public.save_stock_reconciliation(jsonb_build_object(
    'merchant_id', v_merchant,
    'purpose', 'Opening Stock',
    'items', jsonb_build_array(jsonb_build_object(
      'item_id', v_id, 'warehouse_id', v_warehouse, 'qty', v_opening, 'valuation_rate', v_rate
    ))
  ));
  perform public.submit_document('Stock Reconciliation', v_reconciliation);

  return v_id;
end;
$$;


--
-- Name: save_member_access(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_member_access(p_member uuid, p_role uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_merchant uuid;
  v_missing text;
begin
  update public.merchant_members set role_id = p_role where id = p_member
  returning merchant_id into v_merchant;

  -- RLS filters an UPDATE rather than refusing it.
  if v_merchant is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  delete from public.member_overrides o
  where o.member_id = p_member
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) as x (value)
      where x.value ->> 'permission' = o.permission
    );

  insert into public.member_overrides (merchant_id, member_id, permission, allowed)
  select v_merchant, p_member, x.value ->> 'permission', (x.value ->> 'allowed')::boolean
  from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) as x (value)
  on conflict (member_id, permission) do update set allowed = excluded.allowed
  where public.member_overrides.allowed is distinct from excluded.allowed;

  -- What the employee holds now: a permission comes with the one it requires.
  with effective as (
    select g.permission from public.role_grants g
    where g.role_id = p_role
      and not exists (
        select 1 from public.member_overrides o where o.member_id = p_member and o.permission = g.permission and not o.allowed
      )
    union
    select o.permission from public.member_overrides o where o.member_id = p_member and o.allowed
  )
  select p.label into v_missing
  from effective e
  join public.permissions p on p.key = e.permission
  where p.requires is not null and p.requires not in (select f.permission from effective f)
  limit 1;

  if v_missing is not null then
    raise exception 'permission_requires' using errcode = '23514', detail = v_missing;
  end if;
end;
$$;


--
-- Name: save_pos_profile(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_pos_profile(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_row public.pos_profiles;
begin
  v_row := jsonb_populate_record(null::public.pos_profiles, jsonb_strip_nulls(jsonb_build_object(
    'pos_profile_name', btrim(payload ->> 'pos_profile_name'),
    'disabled', coalesce((payload ->> 'disabled')::boolean, false),
    'warehouse', nullif(payload ->> 'warehouse', ''),
    'selling_price_list', nullif(payload ->> 'selling_price_list', ''),
    'taxes_and_charges', nullif(payload ->> 'taxes_and_charges', ''),
    'tax_category', nullif(payload ->> 'tax_category', ''),
    'print_format', nullif(payload ->> 'print_format', ''),
    'letter_head', nullif(payload ->> 'letter_head', ''),
    'account_for_change_amount', nullif(payload ->> 'account_for_change_amount', ''),
    'write_off_account', nullif(payload ->> 'write_off_account', ''),
    'write_off_cost_center', nullif(payload ->> 'write_off_cost_center', ''),
    'write_off_limit', coalesce(nullif(payload ->> 'write_off_limit', '')::numeric, 0),
    'income_account', nullif(payload ->> 'income_account', ''),
    'expense_account', nullif(payload ->> 'expense_account', ''),
    'cost_center', nullif(payload ->> 'cost_center', ''),
    'hide_unavailable_items', coalesce((payload ->> 'hide_unavailable_items')::boolean, false),
    'allow_rate_change', coalesce((payload ->> 'allow_rate_change')::boolean, false),
    'set_grand_total_to_default_mop', coalesce((payload ->> 'set_grand_total_to_default_mop')::boolean, true),
    'print_receipt_on_order_complete', coalesce((payload ->> 'print_receipt_on_order_complete')::boolean, false),
    'apply_discount_on', coalesce(nullif(payload ->> 'apply_discount_on', ''), 'Grand Total'),
    'allow_discount_change', coalesce((payload ->> 'allow_discount_change')::boolean, false),
    'ignore_pricing_rule', coalesce((payload ->> 'ignore_pricing_rule')::boolean, false),
    'discount_account', nullif(payload ->> 'discount_account', '')
  )));

  if v_id is null then
    insert into public.pos_profiles (
      merchant_id, pos_profile_name, disabled, warehouse, selling_price_list, taxes_and_charges, tax_category, print_format,
      letter_head, account_for_change_amount, write_off_account, write_off_cost_center, write_off_limit, income_account,
      expense_account, cost_center, hide_unavailable_items, allow_rate_change, set_grand_total_to_default_mop,
      print_receipt_on_order_complete, apply_discount_on, allow_discount_change, ignore_pricing_rule, discount_account
    )
    values (
      v_merchant, v_row.pos_profile_name, v_row.disabled, v_row.warehouse, v_row.selling_price_list, v_row.taxes_and_charges,
      v_row.tax_category, v_row.print_format, v_row.letter_head, v_row.account_for_change_amount, v_row.write_off_account,
      v_row.write_off_cost_center, v_row.write_off_limit, v_row.income_account, v_row.expense_account, v_row.cost_center,
      v_row.hide_unavailable_items, v_row.allow_rate_change, v_row.set_grand_total_to_default_mop,
      v_row.print_receipt_on_order_complete, v_row.apply_discount_on, v_row.allow_discount_change, v_row.ignore_pricing_rule,
      v_row.discount_account
    )
    returning id into v_id;
  else
    update public.pos_profiles set
      pos_profile_name = v_row.pos_profile_name,
      disabled = v_row.disabled,
      warehouse = v_row.warehouse,
      selling_price_list = v_row.selling_price_list,
      taxes_and_charges = v_row.taxes_and_charges,
      tax_category = v_row.tax_category,
      print_format = v_row.print_format,
      letter_head = v_row.letter_head,
      account_for_change_amount = v_row.account_for_change_amount,
      write_off_account = v_row.write_off_account,
      write_off_cost_center = v_row.write_off_cost_center,
      write_off_limit = v_row.write_off_limit,
      income_account = v_row.income_account,
      expense_account = v_row.expense_account,
      cost_center = v_row.cost_center,
      hide_unavailable_items = v_row.hide_unavailable_items,
      allow_rate_change = v_row.allow_rate_change,
      set_grand_total_to_default_mop = v_row.set_grand_total_to_default_mop,
      print_receipt_on_order_complete = v_row.print_receipt_on_order_complete,
      apply_discount_on = v_row.apply_discount_on,
      allow_discount_change = v_row.allow_discount_change,
      ignore_pricing_rule = v_row.ignore_pricing_rule,
      discount_account = v_row.discount_account
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'pos_profile_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.pos_profile_users where pos_profile_id = v_id;
  insert into public.pos_profile_users (merchant_id, pos_profile_id, idx, member_id, is_default)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'member_id')::uuid, coalesce((r.value ->> 'is_default')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'users', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.pos_profile_payments where pos_profile_id = v_id;
  insert into public.pos_profile_payments (merchant_id, pos_profile_id, idx, mode_of_payment_id, is_default, allow_in_returns)
  select
    v_merchant, v_id, r.idx::integer, (r.value ->> 'mode_of_payment_id')::uuid,
    coalesce((r.value ->> 'is_default')::boolean, false), coalesce((r.value ->> 'allow_in_returns')::boolean, false)
  from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb)) with ordinality as r (value, idx);

  delete from public.pos_profile_item_groups where pos_profile_id = v_id;
  insert into public.pos_profile_item_groups (merchant_id, pos_profile_id, idx, item_group_id)
  select v_merchant, v_id, r.idx::integer, (r.value ->> 'item_group_id')::uuid
  from jsonb_array_elements(coalesce(payload -> 'item_groups', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_pricing_rule(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_pricing_rule(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_row public.pricing_rules := jsonb_populate_record(null::public.pricing_rules, payload - 'id');
begin
  if v_id is null then
    insert into public.pricing_rules (
      merchant_id, title, apply_on, min_qty, max_qty, min_amt, max_amt, valid_from, valid_upto, for_price_list, priority,
      disable, rate_or_discount, rate, discount_percentage, discount_amount
    )
    values (
      v_merchant, btrim(v_row.title), v_row.apply_on, coalesce(v_row.min_qty, 0), coalesce(v_row.max_qty, 0),
      coalesce(v_row.min_amt, 0), coalesce(v_row.max_amt, 0), v_row.valid_from, v_row.valid_upto, v_row.for_price_list,
      coalesce(v_row.priority, 1), coalesce(v_row.disable, false), v_row.rate_or_discount, coalesce(v_row.rate, 0),
      coalesce(v_row.discount_percentage, 0), coalesce(v_row.discount_amount, 0)
    )
    returning id into v_id;
  else
    update public.pricing_rules set
      title = btrim(v_row.title),
      apply_on = v_row.apply_on,
      min_qty = coalesce(v_row.min_qty, 0),
      max_qty = coalesce(v_row.max_qty, 0),
      min_amt = coalesce(v_row.min_amt, 0),
      max_amt = coalesce(v_row.max_amt, 0),
      valid_from = v_row.valid_from,
      valid_upto = v_row.valid_upto,
      for_price_list = v_row.for_price_list,
      priority = coalesce(v_row.priority, 1),
      disable = coalesce(v_row.disable, false),
      rate_or_discount = v_row.rate_or_discount,
      rate = coalesce(v_row.rate, 0),
      discount_percentage = coalesce(v_row.discount_percentage, 0),
      discount_amount = coalesce(v_row.discount_amount, 0)
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'pricing_rule_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.pricing_rule_targets where pricing_rule_id = v_id;

  -- A row of another kind than the rule's Apply On keeps nothing, and pricing_rule_targets_one refuses it.
  insert into public.pricing_rule_targets (merchant_id, pricing_rule_id, idx, item_id, item_group_id, brand_id)
  select
    v_merchant, v_id, t.ordinality,
    case when v_row.apply_on = 'Item Code' then t.item_id end,
    case when v_row.apply_on = 'Item Group' then t.item_group_id end,
    case when v_row.apply_on = 'Brand' then t.brand_id end
  from jsonb_populate_recordset(null::public.pricing_rule_targets, coalesce(payload -> 'targets', '[]'::jsonb)) with ordinality as t;

  return v_id;
end;
$$;


--
-- Name: save_role(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_role(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_keys text[] := array(select jsonb_array_elements_text(coalesce(payload -> 'permissions', '[]'::jsonb)));
  v_members uuid[] := array(select jsonb_array_elements_text(coalesce(payload -> 'member_ids', '[]'::jsonb)))::uuid[];
  v_missing text;
begin
  select p.label into v_missing
  from public.permissions p
  where p.key = any (v_keys) and p.requires is not null and not (p.requires = any (v_keys))
  limit 1;
  if v_missing is not null then
    raise exception 'permission_requires' using errcode = '23514', detail = v_missing;
  end if;

  if v_id is null then
    insert into public.roles (merchant_id, role_name, description, color)
    values (v_merchant, btrim(payload ->> 'role_name'), nullif(btrim(payload ->> 'description'), ''), coalesce(payload ->> 'color', 'grey'))
    returning id into v_id;
  else
    update public.roles set
      role_name = btrim(payload ->> 'role_name'),
      description = nullif(btrim(payload ->> 'description'), ''),
      color = coalesce(payload ->> 'color', 'grey')
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'role_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.role_grants g where g.role_id = v_id and not (g.permission = any (v_keys));
  insert into public.role_grants (merchant_id, role_id, permission)
  select v_merchant, v_id, k.key from unnest(v_keys) as k (key)
  on conflict (role_id, permission) do nothing;

  if payload ? 'member_ids' then
    update public.merchant_members mm set role_id = null
    where mm.role_id = v_id and not (mm.id = any (v_members));
    update public.merchant_members mm set role_id = v_id
    where mm.merchant_id = v_merchant and mm.id = any (v_members) and mm.role_id is distinct from v_id;
  end if;

  return v_id;
end;
$$;


--
-- Name: save_sales_tax_template(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_sales_tax_template(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.sales_tax_templates (merchant_id, title, is_default, disabled, tax_category_id)
    values (
      v_merchant,
      btrim(payload ->> 'title'),
      coalesce((payload ->> 'is_default')::boolean, false),
      coalesce((payload ->> 'disabled')::boolean, false),
      nullif(payload ->> 'tax_category_id', '')::uuid
    )
    returning id into v_id;
  else
    update public.sales_tax_templates set
      title = btrim(payload ->> 'title'),
      is_default = coalesce((payload ->> 'is_default')::boolean, false),
      disabled = coalesce((payload ->> 'disabled')::boolean, false),
      tax_category_id = nullif(payload ->> 'tax_category_id', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.sales_tax_template_rows where template_id = v_id;

  insert into public.sales_tax_template_rows (
    merchant_id, template_id, idx, charge_type, account, description, rate, tax_amount, row_id, included_in_print_rate, cost_center
  )
  select
    v_merchant, v_id, r.idx::integer,
    r.value ->> 'charge_type',
    (r.value ->> 'account')::uuid,
    btrim(r.value ->> 'description'),
    coalesce(nullif(r.value ->> 'rate', '')::numeric, 0),
    coalesce(nullif(r.value ->> 'tax_amount', '')::numeric, 0),
    nullif(r.value ->> 'row_id', '')::integer,
    coalesce((r.value ->> 'included_in_print_rate')::boolean, false),
    nullif(r.value ->> 'cost_center', '')::uuid
  from jsonb_array_elements(coalesce(payload -> 'rows', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_stock_entry(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_stock_entry(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_entries (merchant_id, posting_date, purpose, from_warehouse, to_warehouse, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      payload ->> 'purpose',
      nullif(payload ->> 'from_warehouse', '')::uuid,
      nullif(payload ->> 'to_warehouse', '')::uuid,
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_entries set
      posting_date = v_date,
      purpose = payload ->> 'purpose',
      from_warehouse = nullif(payload ->> 'from_warehouse', '')::uuid,
      to_warehouse = nullif(payload ->> 'to_warehouse', '')::uuid,
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'stock_entry_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_entry_items where stock_entry_id = v_id;

  insert into public.stock_entry_items (merchant_id, stock_entry_id, idx, item_id, qty, basic_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'qty')::numeric,
    nullif(r.value ->> 'basic_rate', '')::numeric
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: save_stock_reconciliation(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_stock_reconciliation(payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_date date := coalesce(nullif(payload ->> 'posting_date', '')::date, private.merchant_today(v_merchant));
begin
  if v_id is null then
    insert into public.stock_reconciliations (merchant_id, posting_date, purpose, difference_account, cost_center)
    values (
      v_merchant,
      v_date,
      coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      nullif(payload ->> 'difference_account', '')::uuid,
      nullif(payload ->> 'cost_center', '')::uuid
    )
    returning id into v_id;
  else
    update public.stock_reconciliations set
      posting_date = v_date,
      purpose = coalesce(nullif(payload ->> 'purpose', ''), 'Stock Reconciliation'),
      difference_account = nullif(payload ->> 'difference_account', '')::uuid,
      cost_center = nullif(payload ->> 'cost_center', '')::uuid
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'stock_reconciliation_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.stock_reconciliation_items where stock_reconciliation_id = v_id;

  insert into public.stock_reconciliation_items (merchant_id, stock_reconciliation_id, idx, item_id, warehouse_id, qty, valuation_rate)
  select
    v_merchant, v_id, r.idx::integer,
    (r.value ->> 'item_id')::uuid,
    (r.value ->> 'warehouse_id')::uuid,
    (r.value ->> 'qty')::numeric,
    coalesce(nullif(r.value ->> 'valuation_rate', '')::numeric, 0)
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) with ordinality as r (value, idx);

  return v_id;
end;
$$;


--
-- Name: stock_alerts(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_alerts(p_merchant uuid, p_limit integer DEFAULT 200) RETURNS TABLE(item_id uuid, item_code text, item_name text, warehouse_id uuid, warehouse_name text, actual_qty numeric, reorder_level numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: submit_document(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_document(p_doctype text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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

  -- One answer for a document that is not there and one the caller may not submit.
  if v_merchant is null or v_merchant not in (select private.permitted_merchant_ids(p_doctype, 'submit')) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;

  if v_status <> 0 then
    raise exception 'not_a_draft' using errcode = '23514', detail = 'Only a draft can be submitted.';
  end if;

  execute format('select private.%I($1)', 'submit_' || v_table) using p_id;
  execute format('update public.%I set docstatus = 1 where id = $1', v_table) using p_id;
end;
$_$;


--
-- Name: top_selling(uuid, date, date, text, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.top_selling(p_merchant uuid, p_from date, p_to date, p_by text DEFAULT 'qty'::text, p_group boolean DEFAULT false, p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, code text, name text, qty numeric, amount numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    case when p_group then g.id else t.id end,
    case when p_group then null else t.item_code end,
    case when p_group then g.item_group_name else t.item_name end,
    sum(r.stock_qty),
    sum(r.net_amount)
  from public.pos_invoice_items r
  join public.pos_invoices i on i.id = r.pos_invoice_id
  join public.items t on t.id = r.item_id
  join public.item_groups g on g.id = t.item_group_id
  where i.merchant_id = p_merchant and i.docstatus = 1 and i.posting_date between p_from and p_to
  group by 1, 2, 3
  having sum(r.stock_qty) > 0 or sum(r.net_amount) > 0
  order by case when p_by = 'amount' then sum(r.net_amount) else sum(r.stock_qty) end desc, 3
  limit least(coalesce(p_limit, 10), 100);
$$;


--
-- Name: update_series_counter(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_series_counter(p_merchant uuid, p_series text, p_current bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    merchant_name text NOT NULL,
    access_code_id uuid,
    code text NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    email text,
    avatar_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    CONSTRAINT access_requests_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])))
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    account_name text NOT NULL,
    account_number text,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    root_type text NOT NULL,
    account_type text,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_name_length CHECK (((length(btrim(account_name)) >= 1) AND (length(btrim(account_name)) <= 140))),
    CONSTRAINT accounts_number_length CHECK (((account_number IS NULL) OR ((length(btrim(account_number)) >= 1) AND (length(btrim(account_number)) <= 20)))),
    CONSTRAINT accounts_root_type CHECK ((root_type = ANY (ARRAY['Asset'::text, 'Liability'::text, 'Equity'::text, 'Income'::text, 'Expense'::text]))),
    CONSTRAINT accounts_type_fits_root CHECK (((account_type IS NULL) OR (account_type = ANY (
CASE root_type
    WHEN 'Asset'::text THEN ARRAY['Bank'::text, 'Cash'::text, 'Chargeable'::text, 'Current Asset'::text, 'Stock'::text, 'Tax'::text, 'Temporary'::text]
    WHEN 'Liability'::text THEN ARRAY['Chargeable'::text, 'Current Liability'::text, 'Stock Received But Not Billed'::text, 'Tax'::text, 'Temporary'::text]
    WHEN 'Equity'::text THEN ARRAY['Equity'::text, 'Temporary'::text]
    WHEN 'Income'::text THEN ARRAY['Direct Income'::text, 'Income Account'::text, 'Indirect Income'::text, 'Temporary'::text]
    WHEN 'Expense'::text THEN ARRAY['Chargeable'::text, 'Cost of Goods Sold'::text, 'Direct Expense'::text, 'Expense Account'::text, 'Expenses Included In Valuation'::text, 'Indirect Expense'::text, 'Round Off'::text, 'Stock Adjustment'::text, 'Tax'::text, 'Temporary'::text]
    ELSE NULL::text[]
END))))
);


--
-- Name: accounts_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_settings (
    merchant_id uuid NOT NULL,
    unlink_payment_on_cancellation boolean DEFAULT true NOT NULL,
    delete_linked_ledger_entries boolean DEFAULT false NOT NULL,
    enable_immutable_ledger boolean DEFAULT true NOT NULL,
    enable_discount_accounting boolean DEFAULT false NOT NULL,
    add_taxes_from_item_tax_template boolean DEFAULT true NOT NULL,
    accounts_frozen_till_date date,
    frozen_accounts_modifier uuid
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    brand text NOT NULL,
    description text,
    default_warehouse uuid,
    default_price_list uuid,
    selling_cost_center uuid,
    income_account uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brands_description_length CHECK (((description IS NULL) OR (length(description) <= 1000))),
    CONSTRAINT brands_name_length CHECK (((length(btrim(brand)) >= 1) AND (length(btrim(brand)) <= 140)))
);


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    cost_center_name text NOT NULL,
    cost_center_number text,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cost_centers_name_length CHECK (((length(btrim(cost_center_name)) >= 1) AND (length(btrim(cost_center_name)) <= 140))),
    CONSTRAINT cost_centers_number_length CHECK (((cost_center_number IS NULL) OR ((length(btrim(cost_center_number)) >= 1) AND (length(btrim(cost_center_number)) <= 20))))
);


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    code text NOT NULL,
    country_name text NOT NULL,
    currency_code text,
    time_zones text[] DEFAULT '{}'::text[] NOT NULL,
    number_format text NOT NULL,
    CONSTRAINT countries_code_shape CHECK ((code ~ '^[A-Z]{2}$'::text))
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    code text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    symbol text,
    fraction text,
    fraction_units integer,
    smallest_currency_fraction_value numeric,
    number_format text NOT NULL,
    symbol_on_right boolean DEFAULT false NOT NULL,
    CONSTRAINT currencies_fraction_length CHECK (((fraction IS NULL) OR (length(fraction) <= 40))),
    CONSTRAINT currencies_fraction_units CHECK (((fraction_units IS NULL) OR (fraction_units >= 0))),
    CONSTRAINT currencies_number_format CHECK (private.is_number_format(number_format)),
    CONSTRAINT currencies_smallest_fraction CHECK (((smallest_currency_fraction_value IS NULL) OR (smallest_currency_fraction_value > (0)::numeric))),
    CONSTRAINT currencies_symbol_length CHECK (((symbol IS NULL) OR (length(symbol) <= 10)))
);


--
-- Name: currency_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_presets (
    code text NOT NULL,
    currency_name text NOT NULL,
    symbol text,
    fraction text,
    fraction_units integer,
    smallest_currency_fraction_value numeric,
    number_format text NOT NULL,
    CONSTRAINT currency_presets_code_shape CHECK ((code ~ '^[A-Z]{3}$'::text))
);


--
-- Name: doctypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctypes (
    name text NOT NULL,
    table_name text NOT NULL,
    kind text NOT NULL,
    CONSTRAINT doctypes_kind CHECK ((kind = ANY (ARRAY['record'::text, 'single'::text, 'tree'::text, 'document'::text, 'ledger'::text])))
);


--
-- Name: fiscal_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_years (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    year text NOT NULL,
    year_start_date date NOT NULL,
    year_end_date date NOT NULL,
    is_short_year boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_years_length CHECK (((year_end_date > year_start_date) AND
CASE
    WHEN is_short_year THEN (year_end_date < (((year_start_date + '1 year'::interval))::date - 1))
    ELSE (year_end_date = (((year_start_date + '1 year'::interval))::date - 1))
END)),
    CONSTRAINT fiscal_years_year_length CHECK (((length(btrim(year)) >= 1) AND (length(btrim(year)) <= 20)))
);


--
-- Name: gl_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gl_entries (
    id bigint NOT NULL,
    merchant_id uuid NOT NULL,
    posting_date date NOT NULL,
    account_id uuid NOT NULL,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    cost_center_id uuid,
    voucher_type text NOT NULL,
    voucher_id uuid NOT NULL,
    voucher_no text NOT NULL,
    remarks text,
    is_cancelled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gl_entries_amounts CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric) AND ((debit = (0)::numeric) OR (credit = (0)::numeric))))
);


--
-- Name: gl_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.gl_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.gl_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: global_defaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_defaults (
    merchant_id uuid NOT NULL,
    disable_rounded_total boolean DEFAULT false NOT NULL,
    disable_in_words boolean DEFAULT false NOT NULL
);


--
-- Name: item_group_taxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_group_taxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_group_id uuid NOT NULL,
    idx integer NOT NULL,
    item_tax_template_id uuid NOT NULL,
    tax_category_id uuid,
    valid_from date,
    minimum_net_rate numeric DEFAULT 0 NOT NULL,
    maximum_net_rate numeric DEFAULT 0 NOT NULL,
    CONSTRAINT item_group_taxes_range CHECK (((maximum_net_rate = (0)::numeric) OR (minimum_net_rate <= maximum_net_rate))),
    CONSTRAINT item_group_taxes_rates CHECK (((minimum_net_rate >= (0)::numeric) AND (maximum_net_rate >= (0)::numeric)))
);


--
-- Name: item_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_group_name text NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    default_price_list uuid,
    default_warehouse uuid,
    selling_cost_center uuid,
    income_account uuid,
    expense_account uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_groups_name_length CHECK (((length(btrim(item_group_name)) >= 1) AND (length(btrim(item_group_name)) <= 140)))
);


--
-- Name: item_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    price_list_id uuid NOT NULL,
    uom_id uuid NOT NULL,
    price_list_rate numeric NOT NULL,
    valid_from date,
    valid_upto date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_prices_dates CHECK (((valid_from IS NULL) OR (valid_upto IS NULL) OR (valid_from <= valid_upto))),
    CONSTRAINT item_prices_rate CHECK ((price_list_rate >= (0)::numeric))
);


--
-- Name: item_tax_template_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_tax_template_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    template_id uuid NOT NULL,
    idx integer NOT NULL,
    account uuid NOT NULL,
    tax_rate numeric DEFAULT 0 NOT NULL,
    not_applicable boolean DEFAULT false NOT NULL
);


--
-- Name: item_tax_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_tax_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    title text NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_tax_templates_title_length CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 140)))
);


--
-- Name: item_taxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_taxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    idx integer NOT NULL,
    item_tax_template_id uuid NOT NULL,
    tax_category_id uuid,
    valid_from date
);


--
-- Name: item_uoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_uoms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    idx integer NOT NULL,
    uom_id uuid NOT NULL,
    conversion_factor numeric NOT NULL,
    CONSTRAINT item_uoms_factor CHECK ((conversion_factor > (0)::numeric))
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    item_code text NOT NULL,
    item_name text NOT NULL,
    item_group_id uuid NOT NULL,
    stock_uom uuid NOT NULL,
    description text,
    brand_id uuid,
    disabled boolean DEFAULT false NOT NULL,
    is_stock_item boolean DEFAULT true NOT NULL,
    valuation_method text,
    allow_negative_stock boolean DEFAULT false NOT NULL,
    reorder_level numeric,
    sales_uom uuid,
    default_warehouse uuid,
    default_price_list uuid,
    selling_cost_center uuid,
    income_account uuid,
    expense_account uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    max_discount numeric DEFAULT 0 NOT NULL,
    discount_account uuid,
    CONSTRAINT items_code_length CHECK (((length(item_code) >= 1) AND (length(item_code) <= 140))),
    CONSTRAINT items_max_discount CHECK (((max_discount >= (0)::numeric) AND (max_discount <= (100)::numeric))),
    CONSTRAINT items_name_length CHECK (((length(btrim(item_name)) >= 1) AND (length(btrim(item_name)) <= 140))),
    CONSTRAINT items_reorder_level CHECK ((reorder_level >= (0)::numeric)),
    CONSTRAINT items_valuation_method CHECK ((valuation_method = ANY (ARRAY['FIFO'::text, 'Moving Average'::text])))
);


--
-- Name: letter_heads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.letter_heads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    letter_head_name text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    footer text DEFAULT ''::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT letter_heads_content_length CHECK ((length(content) <= 1000)),
    CONSTRAINT letter_heads_default_enabled CHECK ((NOT (is_default AND disabled))),
    CONSTRAINT letter_heads_footer_length CHECK ((length(footer) <= 500)),
    CONSTRAINT letter_heads_name_length CHECK (((length(btrim(letter_head_name)) >= 1) AND (length(btrim(letter_head_name)) <= 140)))
);


--
-- Name: member_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_overrides (
    merchant_id uuid NOT NULL,
    member_id uuid NOT NULL,
    permission text NOT NULL,
    allowed boolean NOT NULL
);


--
-- Name: merchant_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    email text,
    full_name text,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    access_code text,
    role_id uuid,
    CONSTRAINT merchant_members_full_name_length CHECK (((full_name IS NULL) OR (length(full_name) <= 120)))
);


--
-- Name: merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    abbr text NOT NULL,
    country_code text NOT NULL,
    default_currency text NOT NULL,
    default_cash_account uuid,
    default_bank_account uuid,
    default_income_account uuid,
    default_expense_account uuid,
    cost_center uuid,
    write_off_account uuid,
    round_off_account uuid,
    round_off_cost_center uuid,
    enable_perpetual_inventory boolean DEFAULT true NOT NULL,
    default_inventory_account uuid,
    stock_adjustment_account uuid,
    stock_received_but_not_billed uuid,
    expenses_included_in_valuation uuid,
    default_discount_account uuid,
    CONSTRAINT merchants_abbr_shape CHECK ((((length(abbr) >= 1) AND (length(abbr) <= 10)) AND (abbr !~ '\s'::text))),
    CONSTRAINT merchants_name_length CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);


--
-- Name: modes_of_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modes_of_payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    mode_of_payment text NOT NULL,
    type text DEFAULT 'General'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    default_account uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modes_of_payment_name_length CHECK (((length(btrim(mode_of_payment)) >= 1) AND (length(btrim(mode_of_payment)) <= 140))),
    CONSTRAINT modes_of_payment_type CHECK ((type = ANY (ARRAY['Cash'::text, 'Bank'::text, 'General'::text, 'Phone'::text])))
);


--
-- Name: naming_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naming_series (
    merchant_id uuid NOT NULL,
    document_type text NOT NULL,
    options text[] NOT NULL,
    user_must_select boolean DEFAULT false NOT NULL,
    CONSTRAINT naming_series_document_type CHECK ((document_type = ANY (ARRAY['POS Invoice'::text, 'Sales Invoice'::text, 'Item'::text, 'Stock Reconciliation'::text, 'Stock Entry'::text, 'POS Opening Entry'::text, 'POS Closing Entry'::text]))),
    CONSTRAINT naming_series_options CHECK (private.are_naming_series(options))
);


--
-- Name: naming_series_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naming_series_counters (
    merchant_id uuid NOT NULL,
    prefix text NOT NULL,
    current_value bigint DEFAULT 0 NOT NULL,
    CONSTRAINT naming_series_counters_current_value CHECK ((current_value >= 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    merchant_id uuid,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    request_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_kind CHECK ((kind = ANY (ARRAY['access_requested'::text, 'access_approved'::text, 'access_declined'::text, 'access_removed'::text, 'access_changed'::text])))
);


--
-- Name: permission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_rules (
    permission text NOT NULL,
    doctype text NOT NULL,
    ptype text NOT NULL,
    CONSTRAINT permission_rules_ptype CHECK ((ptype = ANY (ARRAY['select'::text, 'read'::text, 'write'::text, 'create'::text, 'delete'::text, 'submit'::text, 'cancel'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    key text NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    description text NOT NULL,
    "position" integer NOT NULL,
    requires text
);


--
-- Name: pos_closing_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_closing_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    posting_date date NOT NULL,
    pos_opening_entry_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    period_end timestamp with time zone DEFAULT now() NOT NULL,
    grand_total numeric DEFAULT 0 NOT NULL,
    net_total numeric DEFAULT 0 NOT NULL,
    total_quantity numeric DEFAULT 0 NOT NULL,
    docstatus smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pos_closing_entries_docstatus CHECK ((docstatus = ANY (ARRAY[0, 1, 2])))
);


--
-- Name: pos_closing_entry_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_closing_entry_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_closing_entry_id uuid NOT NULL,
    idx integer NOT NULL,
    mode_of_payment_id uuid NOT NULL,
    closing_amount numeric DEFAULT 0 NOT NULL,
    opening_amount numeric DEFAULT 0 NOT NULL,
    expected_amount numeric DEFAULT 0 NOT NULL,
    difference numeric DEFAULT 0 NOT NULL,
    CONSTRAINT pos_closing_entry_payments_amount CHECK ((closing_amount >= (0)::numeric))
);


--
-- Name: pos_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_invoice_id uuid NOT NULL,
    idx integer NOT NULL,
    item_id uuid NOT NULL,
    item_name text,
    qty numeric NOT NULL,
    uom_id uuid NOT NULL,
    conversion_factor numeric DEFAULT 1 NOT NULL,
    stock_qty numeric NOT NULL,
    price_list_rate numeric DEFAULT 0 NOT NULL,
    rate numeric NOT NULL,
    amount numeric NOT NULL,
    net_rate numeric NOT NULL,
    net_amount numeric NOT NULL,
    item_tax_template_id uuid,
    income_account uuid,
    expense_account uuid,
    cost_center uuid,
    valuation_rate numeric,
    return_against_item uuid,
    discount_percentage numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    distributed_discount_amount numeric DEFAULT 0 NOT NULL,
    pricing_rule_id uuid,
    discount_account uuid,
    CONSTRAINT pos_invoice_items_discount CHECK ((((discount_percentage >= (0)::numeric) AND (discount_percentage <= (100)::numeric)) AND (discount_amount >= (0)::numeric))),
    CONSTRAINT pos_invoice_items_qty CHECK (((qty <> (0)::numeric) AND (stock_qty <> (0)::numeric) AND (sign(qty) = sign(stock_qty)) AND (conversion_factor > (0)::numeric))),
    CONSTRAINT pos_invoice_items_rate CHECK (((rate >= (0)::numeric) AND (price_list_rate >= (0)::numeric)))
);


--
-- Name: pos_invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_invoice_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_invoice_id uuid NOT NULL,
    idx integer NOT NULL,
    mode_of_payment_id uuid NOT NULL,
    amount numeric NOT NULL,
    account uuid,
    CONSTRAINT pos_invoice_payments_amount CHECK ((amount <> (0)::numeric))
);


--
-- Name: pos_invoice_taxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_invoice_taxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_invoice_id uuid NOT NULL,
    idx integer NOT NULL,
    charge_type text NOT NULL,
    account_head uuid NOT NULL,
    description text NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    row_id integer,
    included_in_print_rate boolean DEFAULT false NOT NULL,
    cost_center uuid,
    tax_amount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    item_wise_tax_detail jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT pos_invoice_taxes_charge_type CHECK ((charge_type = ANY (ARRAY['On Net Total'::text, 'Actual'::text, 'On Previous Row Amount'::text, 'On Previous Row Total'::text, 'On Item Quantity'::text]))),
    CONSTRAINT pos_invoice_taxes_detail CHECK ((jsonb_typeof(item_wise_tax_detail) = 'array'::text))
);


--
-- Name: pos_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    posting_date date NOT NULL,
    pos_profile_id uuid NOT NULL,
    pos_opening_entry_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    warehouse uuid,
    selling_price_list uuid,
    taxes_and_charges uuid,
    tax_category uuid,
    net_total numeric DEFAULT 0 NOT NULL,
    total_taxes_and_charges numeric DEFAULT 0 NOT NULL,
    grand_total numeric DEFAULT 0 NOT NULL,
    rounding_adjustment numeric DEFAULT 0 NOT NULL,
    rounded_total numeric DEFAULT 0 NOT NULL,
    paid_amount numeric DEFAULT 0 NOT NULL,
    change_amount numeric DEFAULT 0 NOT NULL,
    write_off_amount numeric DEFAULT 0 NOT NULL,
    docstatus smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_return boolean DEFAULT false NOT NULL,
    return_against uuid,
    apply_discount_on text DEFAULT 'Grand Total'::text NOT NULL,
    additional_discount_percentage numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    additional_discount_account uuid,
    CONSTRAINT pos_invoices_discount CHECK (((apply_discount_on = ANY (ARRAY['Grand Total'::text, 'Net Total'::text])) AND ((additional_discount_percentage >= (0)::numeric) AND (additional_discount_percentage <= (100)::numeric)) AND
CASE
    WHEN is_return THEN (discount_amount <= (0)::numeric)
    ELSE (discount_amount >= (0)::numeric)
END)),
    CONSTRAINT pos_invoices_docstatus CHECK ((docstatus = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT pos_invoices_return_shape CHECK ((is_return = (return_against IS NOT NULL)))
);


--
-- Name: pos_opening_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_opening_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    posting_date date NOT NULL,
    pos_profile_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    period_start timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    docstatus smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pos_opening_entries_docstatus CHECK ((docstatus = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT pos_opening_entries_status CHECK ((status = ANY (ARRAY['Open'::text, 'Closed'::text])))
);


--
-- Name: pos_opening_entry_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_opening_entry_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_opening_entry_id uuid NOT NULL,
    idx integer NOT NULL,
    mode_of_payment_id uuid NOT NULL,
    opening_amount numeric DEFAULT 0 NOT NULL,
    CONSTRAINT pos_opening_entry_balances_amount CHECK ((opening_amount >= (0)::numeric))
);


--
-- Name: pos_profile_item_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_profile_item_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_profile_id uuid NOT NULL,
    idx integer NOT NULL,
    item_group_id uuid NOT NULL
);


--
-- Name: pos_profile_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_profile_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_profile_id uuid NOT NULL,
    idx integer NOT NULL,
    mode_of_payment_id uuid NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    allow_in_returns boolean DEFAULT false NOT NULL
);


--
-- Name: pos_profile_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_profile_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_profile_id uuid NOT NULL,
    idx integer NOT NULL,
    member_id uuid NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: pos_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pos_profile_name text NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    warehouse uuid NOT NULL,
    selling_price_list uuid,
    taxes_and_charges uuid,
    tax_category uuid,
    print_format uuid,
    letter_head uuid,
    account_for_change_amount uuid,
    write_off_account uuid,
    write_off_cost_center uuid,
    write_off_limit numeric DEFAULT 0 NOT NULL,
    income_account uuid,
    expense_account uuid,
    cost_center uuid,
    hide_unavailable_items boolean DEFAULT false NOT NULL,
    allow_rate_change boolean DEFAULT false NOT NULL,
    set_grand_total_to_default_mop boolean DEFAULT true NOT NULL,
    print_receipt_on_order_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    apply_discount_on text DEFAULT 'Grand Total'::text NOT NULL,
    allow_discount_change boolean DEFAULT false NOT NULL,
    ignore_pricing_rule boolean DEFAULT false NOT NULL,
    discount_account uuid,
    CONSTRAINT pos_profiles_apply_discount_on CHECK ((apply_discount_on = ANY (ARRAY['Grand Total'::text, 'Net Total'::text]))),
    CONSTRAINT pos_profiles_name_length CHECK (((length(btrim(pos_profile_name)) >= 1) AND (length(btrim(pos_profile_name)) <= 140))),
    CONSTRAINT pos_profiles_write_off_limit CHECK ((write_off_limit >= (0)::numeric))
);


--
-- Name: price_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    price_list_name text NOT NULL,
    currency text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    price_not_uom_dependent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_lists_name_length CHECK (((length(btrim(price_list_name)) >= 1) AND (length(btrim(price_list_name)) <= 140)))
);


--
-- Name: pricing_rule_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rule_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    pricing_rule_id uuid NOT NULL,
    idx integer NOT NULL,
    item_id uuid,
    item_group_id uuid,
    brand_id uuid,
    CONSTRAINT pricing_rule_targets_one CHECK ((num_nonnulls(item_id, item_group_id, brand_id) = 1))
);


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    title text NOT NULL,
    apply_on text DEFAULT 'Item Code'::text NOT NULL,
    min_qty numeric DEFAULT 0 NOT NULL,
    max_qty numeric DEFAULT 0 NOT NULL,
    min_amt numeric DEFAULT 0 NOT NULL,
    max_amt numeric DEFAULT 0 NOT NULL,
    valid_from date,
    valid_upto date,
    for_price_list uuid,
    priority integer DEFAULT 1 NOT NULL,
    disable boolean DEFAULT false NOT NULL,
    rate_or_discount text DEFAULT 'Discount Percentage'::text NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    discount_percentage numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_apply_on CHECK ((apply_on = ANY (ARRAY['Item Code'::text, 'Item Group'::text, 'Brand'::text]))),
    CONSTRAINT pricing_rules_dates CHECK (((valid_from IS NULL) OR (valid_upto IS NULL) OR (valid_from <= valid_upto))),
    CONSTRAINT pricing_rules_priority CHECK ((priority >= 1)),
    CONSTRAINT pricing_rules_ranges CHECK (((min_qty >= (0)::numeric) AND (max_qty >= (0)::numeric) AND (min_amt >= (0)::numeric) AND (max_amt >= (0)::numeric) AND ((max_qty = (0)::numeric) OR (max_qty >= min_qty)) AND ((max_amt = (0)::numeric) OR (max_amt >= min_amt)))),
    CONSTRAINT pricing_rules_result CHECK (((rate_or_discount = ANY (ARRAY['Rate'::text, 'Discount Percentage'::text, 'Discount Amount'::text])) AND (rate >= (0)::numeric) AND ((discount_percentage >= (0)::numeric) AND (discount_percentage <= (100)::numeric)) AND (discount_amount >= (0)::numeric))),
    CONSTRAINT pricing_rules_title_length CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 140)))
);


--
-- Name: print_formats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.print_formats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    print_format_name text NOT NULL,
    paper text DEFAULT '80mm'::text NOT NULL,
    print_heading text DEFAULT ''::text NOT NULL,
    show_item_code boolean DEFAULT true NOT NULL,
    footer_note text DEFAULT ''::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT print_formats_default_enabled CHECK ((NOT (is_default AND disabled))),
    CONSTRAINT print_formats_footer_note_length CHECK ((length(footer_note) <= 500)),
    CONSTRAINT print_formats_heading_length CHECK ((length(print_heading) <= 140)),
    CONSTRAINT print_formats_name_length CHECK (((length(btrim(print_format_name)) >= 1) AND (length(btrim(print_format_name)) <= 140))),
    CONSTRAINT print_formats_paper CHECK ((paper = ANY (ARRAY['58mm'::text, '80mm'::text, 'A4'::text])))
);


--
-- Name: print_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.print_settings (
    merchant_id uuid NOT NULL,
    with_letterhead boolean DEFAULT true NOT NULL,
    compact_item_print boolean DEFAULT true NOT NULL,
    print_taxes_with_zero_amount boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_grants (
    merchant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    permission text NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    role_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    color text DEFAULT 'grey'::text NOT NULL,
    CONSTRAINT roles_color CHECK ((color = ANY (ARRAY['grey'::text, 'slate'::text, 'red'::text, 'maroon'::text, 'orange'::text, 'amber'::text, 'green'::text, 'teal'::text, 'cyan'::text, 'blue'::text, 'indigo'::text, 'purple'::text, 'pink'::text]))),
    CONSTRAINT roles_description_length CHECK (((description IS NULL) OR (length(description) <= 200))),
    CONSTRAINT roles_name_length CHECK (((length(btrim(role_name)) >= 1) AND (length(btrim(role_name)) <= 60)))
);


--
-- Name: sales_tax_template_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_tax_template_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    template_id uuid NOT NULL,
    idx integer NOT NULL,
    charge_type text NOT NULL,
    account uuid NOT NULL,
    description text NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    tax_amount numeric DEFAULT 0 NOT NULL,
    row_id integer,
    included_in_print_rate boolean DEFAULT false NOT NULL,
    cost_center uuid,
    CONSTRAINT sales_tax_template_rows_charge_type CHECK ((charge_type = ANY (ARRAY['Actual'::text, 'On Net Total'::text, 'On Previous Row Amount'::text, 'On Previous Row Total'::text, 'On Item Quantity'::text]))),
    CONSTRAINT sales_tax_template_rows_description_length CHECK (((length(btrim(description)) >= 1) AND (length(btrim(description)) <= 140))),
    CONSTRAINT sales_tax_template_rows_idx_positive CHECK ((idx >= 1)),
    CONSTRAINT sales_tax_template_rows_inclusive_actual CHECK ((NOT (included_in_print_rate AND (charge_type = 'Actual'::text)))),
    CONSTRAINT sales_tax_template_rows_reference CHECK (
CASE
    WHEN (charge_type = ANY (ARRAY['On Previous Row Amount'::text, 'On Previous Row Total'::text])) THEN ((row_id IS NOT NULL) AND ((row_id >= 1) AND (row_id <= (idx - 1))))
    ELSE (row_id IS NULL)
END)
);


--
-- Name: sales_tax_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_tax_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    title text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    tax_category_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_tax_templates_default_enabled CHECK ((NOT (is_default AND disabled))),
    CONSTRAINT sales_tax_templates_title_length CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 140)))
);


--
-- Name: selling_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.selling_settings (
    merchant_id uuid NOT NULL,
    default_price_list uuid,
    fallback_to_default_price_list boolean DEFAULT false NOT NULL,
    editable_price_list_rate boolean DEFAULT false NOT NULL,
    validate_selling_price boolean DEFAULT false NOT NULL
);


--
-- Name: stock_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    posting_date date NOT NULL,
    purpose text NOT NULL,
    from_warehouse uuid,
    to_warehouse uuid,
    difference_account uuid,
    cost_center uuid,
    docstatus smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_entries_docstatus CHECK ((docstatus = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT stock_entries_purpose CHECK ((purpose = ANY (ARRAY['Material Receipt'::text, 'Material Issue'::text, 'Material Transfer'::text]))),
    CONSTRAINT stock_entries_warehouses CHECK (
CASE purpose
    WHEN 'Material Receipt'::text THEN ((from_warehouse IS NULL) AND (to_warehouse IS NOT NULL))
    WHEN 'Material Issue'::text THEN ((from_warehouse IS NOT NULL) AND (to_warehouse IS NULL))
    ELSE ((from_warehouse IS NOT NULL) AND (to_warehouse IS NOT NULL) AND (from_warehouse <> to_warehouse))
END)
);


--
-- Name: stock_entry_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_entry_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    stock_entry_id uuid NOT NULL,
    idx integer NOT NULL,
    item_id uuid NOT NULL,
    qty numeric NOT NULL,
    basic_rate numeric,
    amount numeric,
    CONSTRAINT stock_entry_items_qty CHECK ((qty > (0)::numeric)),
    CONSTRAINT stock_entry_items_rate CHECK ((basic_rate >= (0)::numeric))
);


--
-- Name: stock_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_ledger_entries (
    id bigint NOT NULL,
    merchant_id uuid NOT NULL,
    posting_date date NOT NULL,
    item_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    actual_qty numeric NOT NULL,
    incoming_rate numeric DEFAULT 0 NOT NULL,
    valuation_rate numeric DEFAULT 0 NOT NULL,
    qty_after_transaction numeric NOT NULL,
    stock_value numeric NOT NULL,
    stock_value_difference numeric NOT NULL,
    voucher_type text NOT NULL,
    voucher_id uuid NOT NULL,
    voucher_no text NOT NULL,
    is_cancelled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_ledger_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_ledger_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_ledger_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock_reconciliation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_reconciliation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    stock_reconciliation_id uuid NOT NULL,
    idx integer NOT NULL,
    item_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    qty numeric NOT NULL,
    valuation_rate numeric NOT NULL,
    current_qty numeric,
    current_valuation_rate numeric,
    amount_difference numeric,
    CONSTRAINT stock_reconciliation_items_qty CHECK ((qty >= (0)::numeric)),
    CONSTRAINT stock_reconciliation_items_rate CHECK ((valuation_rate >= (0)::numeric))
);


--
-- Name: stock_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    posting_date date NOT NULL,
    purpose text DEFAULT 'Stock Reconciliation'::text NOT NULL,
    difference_account uuid,
    cost_center uuid,
    docstatus smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_reconciliations_docstatus CHECK ((docstatus = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT stock_reconciliations_purpose CHECK ((purpose = ANY (ARRAY['Opening Stock'::text, 'Stock Reconciliation'::text])))
);


--
-- Name: stock_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_settings (
    merchant_id uuid NOT NULL,
    item_naming_by text DEFAULT 'Item Code'::text NOT NULL,
    item_group uuid,
    stock_uom uuid,
    default_warehouse uuid,
    valuation_method text DEFAULT 'FIFO'::text NOT NULL,
    allow_negative_stock boolean DEFAULT false NOT NULL,
    auto_insert_price_list_rate_if_missing boolean DEFAULT false NOT NULL,
    CONSTRAINT stock_settings_item_naming_by CHECK ((item_naming_by = ANY (ARRAY['Item Code'::text, 'Naming Series'::text]))),
    CONSTRAINT stock_settings_valuation_method CHECK ((valuation_method = ANY (ARRAY['FIFO'::text, 'Moving Average'::text])))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    merchant_id uuid NOT NULL,
    time_zone text NOT NULL,
    number_format text DEFAULT '#,###.##'::text NOT NULL,
    float_precision smallint DEFAULT 3 NOT NULL,
    currency_precision smallint DEFAULT 2 NOT NULL,
    rounding_method text DEFAULT 'Banker''s Rounding'::text NOT NULL,
    CONSTRAINT system_settings_currency_precision CHECK (((currency_precision >= 0) AND (currency_precision <= 9))),
    CONSTRAINT system_settings_float_precision CHECK (((float_precision >= 0) AND (float_precision <= 9))),
    CONSTRAINT system_settings_number_format CHECK (private.is_number_format(number_format)),
    CONSTRAINT system_settings_rounding_method CHECK ((rounding_method = ANY (ARRAY['Banker''s Rounding'::text, 'Commercial Rounding'::text])))
);


--
-- Name: tax_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    title text NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_categories_title_length CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 140)))
);


--
-- Name: tax_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_presets (
    country_code text NOT NULL,
    template text NOT NULL,
    account_name text NOT NULL,
    tax_rate numeric NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: tax_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    sales_tax_template_id uuid NOT NULL,
    tax_category_id uuid,
    item_group_id uuid,
    from_date date,
    to_date date,
    priority integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_rules_dates CHECK (((from_date IS NULL) OR (to_date IS NULL) OR (from_date <= to_date))),
    CONSTRAINT tax_rules_priority CHECK ((priority >= 1))
);


--
-- Name: uom_conversion_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom_conversion_factors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    from_uom uuid NOT NULL,
    to_uom uuid NOT NULL,
    value numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT uom_conversion_factors_two_units CHECK ((from_uom <> to_uom)),
    CONSTRAINT uom_conversion_factors_value CHECK ((value > (0)::numeric))
);


--
-- Name: uoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uoms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    uom_name text NOT NULL,
    must_be_whole_number boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT uoms_name_length CHECK (((length(btrim(uom_name)) >= 1) AND (length(btrim(uom_name)) <= 140)))
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    warehouse_name text NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    account uuid,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warehouses_name_length CHECK (((length(btrim(warehouse_name)) >= 1) AND (length(btrim(warehouse_name)) <= 140)))
);


--
-- Name: access_codes access_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_code_unique UNIQUE (code);


--
-- Name: access_codes access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_pkey PRIMARY KEY (id);


--
-- Name: access_requests access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_id_merchant UNIQUE (id, merchant_id);


--
-- Name: accounts accounts_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_name_unique UNIQUE (merchant_id, account_name);


--
-- Name: accounts accounts_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_number_unique UNIQUE (merchant_id, account_number);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts_settings accounts_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_settings
    ADD CONSTRAINT accounts_settings_pkey PRIMARY KEY (merchant_id);


--
-- Name: bins bins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_pkey PRIMARY KEY (item_id, warehouse_id);


--
-- Name: brands brands_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_id_merchant UNIQUE (id, merchant_id);


--
-- Name: brands brands_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_unique UNIQUE (merchant_id, brand);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_id_merchant UNIQUE (id, merchant_id);


--
-- Name: cost_centers cost_centers_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_name_unique UNIQUE (merchant_id, cost_center_name);


--
-- Name: cost_centers cost_centers_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_number_unique UNIQUE (merchant_id, cost_center_number);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: countries countries_country_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_country_name_key UNIQUE (country_name);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (code);


--
-- Name: currencies currencies_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_unique UNIQUE (merchant_id, code);


--
-- Name: currencies currencies_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_id_merchant UNIQUE (id, merchant_id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currency_presets currency_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_presets
    ADD CONSTRAINT currency_presets_pkey PRIMARY KEY (code);


--
-- Name: doctypes doctypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctypes
    ADD CONSTRAINT doctypes_pkey PRIMARY KEY (name);


--
-- Name: fiscal_years fiscal_years_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_years
    ADD CONSTRAINT fiscal_years_id_merchant UNIQUE (id, merchant_id);


--
-- Name: fiscal_years fiscal_years_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_years
    ADD CONSTRAINT fiscal_years_no_overlap EXCLUDE USING gist (merchant_id WITH =, daterange(year_start_date, year_end_date, '[]'::text) WITH &&);


--
-- Name: fiscal_years fiscal_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_years
    ADD CONSTRAINT fiscal_years_pkey PRIMARY KEY (id);


--
-- Name: fiscal_years fiscal_years_year_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_years
    ADD CONSTRAINT fiscal_years_year_unique UNIQUE (merchant_id, year);


--
-- Name: gl_entries gl_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_entries
    ADD CONSTRAINT gl_entries_pkey PRIMARY KEY (id);


--
-- Name: global_defaults global_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_defaults
    ADD CONSTRAINT global_defaults_pkey PRIMARY KEY (merchant_id);


--
-- Name: item_group_taxes item_group_taxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_group_taxes
    ADD CONSTRAINT item_group_taxes_pkey PRIMARY KEY (id);


--
-- Name: item_groups item_groups_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_id_merchant UNIQUE (id, merchant_id);


--
-- Name: item_groups item_groups_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_name_unique UNIQUE (merchant_id, item_group_name);


--
-- Name: item_groups item_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_pkey PRIMARY KEY (id);


--
-- Name: item_prices item_prices_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_id_merchant UNIQUE (id, merchant_id);


--
-- Name: item_prices item_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_pkey PRIMARY KEY (id);


--
-- Name: item_prices item_prices_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_unique UNIQUE NULLS NOT DISTINCT (merchant_id, item_id, price_list_id, uom_id, valid_from, valid_upto);


--
-- Name: item_tax_template_rows item_tax_template_rows_account_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_template_rows
    ADD CONSTRAINT item_tax_template_rows_account_unique UNIQUE (template_id, account);


--
-- Name: item_tax_template_rows item_tax_template_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_template_rows
    ADD CONSTRAINT item_tax_template_rows_pkey PRIMARY KEY (id);


--
-- Name: item_tax_templates item_tax_templates_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_templates
    ADD CONSTRAINT item_tax_templates_id_merchant UNIQUE (id, merchant_id);


--
-- Name: item_tax_templates item_tax_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_templates
    ADD CONSTRAINT item_tax_templates_pkey PRIMARY KEY (id);


--
-- Name: item_tax_templates item_tax_templates_title_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_templates
    ADD CONSTRAINT item_tax_templates_title_unique UNIQUE (merchant_id, title);


--
-- Name: item_taxes item_taxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_taxes
    ADD CONSTRAINT item_taxes_pkey PRIMARY KEY (id);


--
-- Name: item_uoms item_uoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_pkey PRIMARY KEY (id);


--
-- Name: item_uoms item_uoms_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_unique UNIQUE (item_id, uom_id);


--
-- Name: items items_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_code_unique UNIQUE (merchant_id, item_code);


--
-- Name: items items_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_id_merchant UNIQUE (id, merchant_id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: letter_heads letter_heads_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_heads
    ADD CONSTRAINT letter_heads_id_merchant UNIQUE (id, merchant_id);


--
-- Name: letter_heads letter_heads_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_heads
    ADD CONSTRAINT letter_heads_name_unique UNIQUE (merchant_id, letter_head_name);


--
-- Name: letter_heads letter_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_heads
    ADD CONSTRAINT letter_heads_pkey PRIMARY KEY (id);


--
-- Name: member_overrides member_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_overrides
    ADD CONSTRAINT member_overrides_pkey PRIMARY KEY (member_id, permission);


--
-- Name: merchant_members merchant_members_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_id_merchant UNIQUE (id, merchant_id);


--
-- Name: merchant_members merchant_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_pkey PRIMARY KEY (id);


--
-- Name: merchant_members merchant_members_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_user_unique UNIQUE (merchant_id, user_id);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: modes_of_payment modes_of_payment_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modes_of_payment
    ADD CONSTRAINT modes_of_payment_id_merchant UNIQUE (id, merchant_id);


--
-- Name: modes_of_payment modes_of_payment_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modes_of_payment
    ADD CONSTRAINT modes_of_payment_name_unique UNIQUE (merchant_id, mode_of_payment);


--
-- Name: modes_of_payment modes_of_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modes_of_payment
    ADD CONSTRAINT modes_of_payment_pkey PRIMARY KEY (id);


--
-- Name: naming_series_counters naming_series_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naming_series_counters
    ADD CONSTRAINT naming_series_counters_pkey PRIMARY KEY (merchant_id, prefix);


--
-- Name: naming_series naming_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naming_series
    ADD CONSTRAINT naming_series_pkey PRIMARY KEY (merchant_id, document_type);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: permission_rules permission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_rules
    ADD CONSTRAINT permission_rules_pkey PRIMARY KEY (permission, doctype, ptype);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);


--
-- Name: pos_closing_entries pos_closing_entries_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entries
    ADD CONSTRAINT pos_closing_entries_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pos_closing_entries pos_closing_entries_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entries
    ADD CONSTRAINT pos_closing_entries_name_unique UNIQUE (merchant_id, name);


--
-- Name: pos_closing_entries pos_closing_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entries
    ADD CONSTRAINT pos_closing_entries_pkey PRIMARY KEY (id);


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entry_payments
    ADD CONSTRAINT pos_closing_entry_payments_pkey PRIMARY KEY (id);


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entry_payments
    ADD CONSTRAINT pos_closing_entry_payments_unique UNIQUE (pos_closing_entry_id, mode_of_payment_id);


--
-- Name: pos_invoice_items pos_invoice_items_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: pos_invoice_payments pos_invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_payments
    ADD CONSTRAINT pos_invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: pos_invoice_taxes pos_invoice_taxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_taxes
    ADD CONSTRAINT pos_invoice_taxes_pkey PRIMARY KEY (id);


--
-- Name: pos_invoices pos_invoices_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pos_invoices pos_invoices_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_name_unique UNIQUE (merchant_id, name);


--
-- Name: pos_invoices pos_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_pkey PRIMARY KEY (id);


--
-- Name: pos_opening_entries pos_opening_entries_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entries
    ADD CONSTRAINT pos_opening_entries_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pos_opening_entries pos_opening_entries_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entries
    ADD CONSTRAINT pos_opening_entries_name_unique UNIQUE (merchant_id, name);


--
-- Name: pos_opening_entries pos_opening_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entries
    ADD CONSTRAINT pos_opening_entries_pkey PRIMARY KEY (id);


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entry_balances
    ADD CONSTRAINT pos_opening_entry_balances_pkey PRIMARY KEY (id);


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entry_balances
    ADD CONSTRAINT pos_opening_entry_balances_unique UNIQUE (pos_opening_entry_id, mode_of_payment_id);


--
-- Name: pos_profile_item_groups pos_profile_item_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_item_groups
    ADD CONSTRAINT pos_profile_item_groups_pkey PRIMARY KEY (id);


--
-- Name: pos_profile_item_groups pos_profile_item_groups_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_item_groups
    ADD CONSTRAINT pos_profile_item_groups_unique UNIQUE (pos_profile_id, item_group_id);


--
-- Name: pos_profile_payments pos_profile_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_payments
    ADD CONSTRAINT pos_profile_payments_pkey PRIMARY KEY (id);


--
-- Name: pos_profile_payments pos_profile_payments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_payments
    ADD CONSTRAINT pos_profile_payments_unique UNIQUE (pos_profile_id, mode_of_payment_id);


--
-- Name: pos_profile_users pos_profile_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_users
    ADD CONSTRAINT pos_profile_users_pkey PRIMARY KEY (id);


--
-- Name: pos_profile_users pos_profile_users_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_users
    ADD CONSTRAINT pos_profile_users_unique UNIQUE (pos_profile_id, member_id);


--
-- Name: pos_profiles pos_profiles_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pos_profiles pos_profiles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_name_unique UNIQUE (merchant_id, pos_profile_name);


--
-- Name: pos_profiles pos_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_pkey PRIMARY KEY (id);


--
-- Name: price_lists price_lists_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_id_merchant UNIQUE (id, merchant_id);


--
-- Name: price_lists price_lists_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_name_unique UNIQUE (merchant_id, price_list_name);


--
-- Name: price_lists price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);


--
-- Name: pricing_rule_targets pricing_rule_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_id_merchant UNIQUE (id, merchant_id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_title_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_title_unique UNIQUE (merchant_id, title);


--
-- Name: print_formats print_formats_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_formats
    ADD CONSTRAINT print_formats_id_merchant UNIQUE (id, merchant_id);


--
-- Name: print_formats print_formats_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_formats
    ADD CONSTRAINT print_formats_name_unique UNIQUE (merchant_id, print_format_name);


--
-- Name: print_formats print_formats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_formats
    ADD CONSTRAINT print_formats_pkey PRIMARY KEY (id);


--
-- Name: print_settings print_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_pkey PRIMARY KEY (merchant_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: role_grants role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_grants
    ADD CONSTRAINT role_grants_pkey PRIMARY KEY (role_id, permission);


--
-- Name: roles roles_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_id_merchant UNIQUE (id, merchant_id);


--
-- Name: roles roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_unique UNIQUE (merchant_id, role_name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sales_tax_template_rows sales_tax_template_rows_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_idx UNIQUE (template_id, idx);


--
-- Name: sales_tax_template_rows sales_tax_template_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_pkey PRIMARY KEY (id);


--
-- Name: sales_tax_templates sales_tax_templates_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_templates
    ADD CONSTRAINT sales_tax_templates_id_merchant UNIQUE (id, merchant_id);


--
-- Name: sales_tax_templates sales_tax_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_templates
    ADD CONSTRAINT sales_tax_templates_pkey PRIMARY KEY (id);


--
-- Name: sales_tax_templates sales_tax_templates_title_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_templates
    ADD CONSTRAINT sales_tax_templates_title_unique UNIQUE (merchant_id, title);


--
-- Name: selling_settings selling_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_settings
    ADD CONSTRAINT selling_settings_pkey PRIMARY KEY (merchant_id);


--
-- Name: stock_entries stock_entries_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_id_merchant UNIQUE (id, merchant_id);


--
-- Name: stock_entries stock_entries_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_name_unique UNIQUE (merchant_id, name);


--
-- Name: stock_entries stock_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_pkey PRIMARY KEY (id);


--
-- Name: stock_entry_items stock_entry_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_pkey PRIMARY KEY (id);


--
-- Name: stock_ledger_entries stock_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: stock_reconciliation_items stock_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: stock_reconciliation_items stock_reconciliation_items_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_unique UNIQUE (stock_reconciliation_id, item_id, warehouse_id);


--
-- Name: stock_reconciliations stock_reconciliations_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_id_merchant UNIQUE (id, merchant_id);


--
-- Name: stock_reconciliations stock_reconciliations_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_name_unique UNIQUE (merchant_id, name);


--
-- Name: stock_reconciliations stock_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: stock_settings stock_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_settings
    ADD CONSTRAINT stock_settings_pkey PRIMARY KEY (merchant_id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (merchant_id);


--
-- Name: tax_categories tax_categories_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_categories
    ADD CONSTRAINT tax_categories_id_merchant UNIQUE (id, merchant_id);


--
-- Name: tax_categories tax_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_categories
    ADD CONSTRAINT tax_categories_pkey PRIMARY KEY (id);


--
-- Name: tax_categories tax_categories_title_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_categories
    ADD CONSTRAINT tax_categories_title_unique UNIQUE (merchant_id, title);


--
-- Name: tax_presets tax_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_presets
    ADD CONSTRAINT tax_presets_pkey PRIMARY KEY (country_code, template);


--
-- Name: tax_rules tax_rules_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_id_merchant UNIQUE (id, merchant_id);


--
-- Name: tax_rules tax_rules_no_conflict; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_no_conflict EXCLUDE USING gist (merchant_id WITH =, COALESCE(tax_category_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, COALESCE(item_group_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =, priority WITH =, daterange(from_date, to_date, '[]'::text) WITH &&);


--
-- Name: tax_rules tax_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_pkey PRIMARY KEY (id);


--
-- Name: uom_conversion_factors uom_conversion_factors_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_id_merchant UNIQUE (id, merchant_id);


--
-- Name: uom_conversion_factors uom_conversion_factors_pair_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_pair_unique UNIQUE (merchant_id, from_uom, to_uom);


--
-- Name: uom_conversion_factors uom_conversion_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_pkey PRIMARY KEY (id);


--
-- Name: uoms uoms_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_id_merchant UNIQUE (id, merchant_id);


--
-- Name: uoms uoms_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_name_unique UNIQUE (merchant_id, uom_name);


--
-- Name: uoms uoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_id_merchant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_id_merchant UNIQUE (id, merchant_id);


--
-- Name: warehouses warehouses_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_name_unique UNIQUE (merchant_id, warehouse_name);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: access_codes_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_codes_merchant_id_idx ON public.access_codes USING btree (merchant_id, created_at DESC);


--
-- Name: access_requests_access_code_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_requests_access_code_id_idx ON public.access_requests USING btree (access_code_id);


--
-- Name: access_requests_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_requests_merchant_id_idx ON public.access_requests USING btree (merchant_id, created_at DESC);


--
-- Name: access_requests_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_requests_one_pending ON public.access_requests USING btree (merchant_id, user_id) WHERE (status = 'pending'::text);


--
-- Name: access_requests_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_requests_user_id_idx ON public.access_requests USING btree (user_id);


--
-- Name: accounts_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_parent_idx ON public.accounts USING btree (parent_id, merchant_id);


--
-- Name: accounts_settings_modifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_settings_modifier_idx ON public.accounts_settings USING btree (frozen_accounts_modifier, merchant_id);


--
-- Name: bins_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bins_item_idx ON public.bins USING btree (item_id, merchant_id);


--
-- Name: bins_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bins_merchant_idx ON public.bins USING btree (merchant_id);


--
-- Name: bins_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bins_warehouse_idx ON public.bins USING btree (warehouse_id, merchant_id);


--
-- Name: brands_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_cost_center_idx ON public.brands USING btree (selling_cost_center, merchant_id);


--
-- Name: brands_income_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_income_account_idx ON public.brands USING btree (income_account, merchant_id);


--
-- Name: brands_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_price_list_idx ON public.brands USING btree (default_price_list, merchant_id);


--
-- Name: brands_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_warehouse_idx ON public.brands USING btree (default_warehouse, merchant_id);


--
-- Name: cost_centers_one_root; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cost_centers_one_root ON public.cost_centers USING btree (merchant_id) WHERE (parent_id IS NULL);


--
-- Name: cost_centers_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cost_centers_parent_idx ON public.cost_centers USING btree (parent_id, merchant_id);


--
-- Name: currencies_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_code_idx ON public.currencies USING btree (code);


--
-- Name: fiscal_years_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fiscal_years_merchant_id_idx ON public.fiscal_years USING btree (merchant_id);


--
-- Name: fiscal_years_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fiscal_years_one_default ON public.fiscal_years USING btree (merchant_id) WHERE is_default;


--
-- Name: gl_entries_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gl_entries_account_idx ON public.gl_entries USING btree (account_id, merchant_id);


--
-- Name: gl_entries_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gl_entries_cost_center_idx ON public.gl_entries USING btree (cost_center_id, merchant_id);


--
-- Name: gl_entries_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gl_entries_posting_idx ON public.gl_entries USING btree (merchant_id, posting_date DESC, id DESC);


--
-- Name: gl_entries_voucher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gl_entries_voucher_idx ON public.gl_entries USING btree (voucher_id);


--
-- Name: item_group_taxes_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_group_taxes_category_idx ON public.item_group_taxes USING btree (tax_category_id, merchant_id);


--
-- Name: item_group_taxes_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_group_taxes_group_idx ON public.item_group_taxes USING btree (item_group_id, merchant_id);


--
-- Name: item_group_taxes_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_group_taxes_template_idx ON public.item_group_taxes USING btree (item_tax_template_id, merchant_id);


--
-- Name: item_groups_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_cost_center_idx ON public.item_groups USING btree (selling_cost_center, merchant_id);


--
-- Name: item_groups_expense_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_expense_account_idx ON public.item_groups USING btree (expense_account, merchant_id);


--
-- Name: item_groups_income_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_income_account_idx ON public.item_groups USING btree (income_account, merchant_id);


--
-- Name: item_groups_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_parent_idx ON public.item_groups USING btree (parent_id, merchant_id);


--
-- Name: item_groups_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_price_list_idx ON public.item_groups USING btree (default_price_list, merchant_id);


--
-- Name: item_groups_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_groups_warehouse_idx ON public.item_groups USING btree (default_warehouse, merchant_id);


--
-- Name: item_prices_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_prices_item_idx ON public.item_prices USING btree (item_id, merchant_id);


--
-- Name: item_prices_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_prices_price_list_idx ON public.item_prices USING btree (price_list_id, merchant_id);


--
-- Name: item_prices_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_prices_uom_idx ON public.item_prices USING btree (uom_id, merchant_id);


--
-- Name: item_tax_template_rows_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_tax_template_rows_account_idx ON public.item_tax_template_rows USING btree (account, merchant_id);


--
-- Name: item_tax_template_rows_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_tax_template_rows_template_idx ON public.item_tax_template_rows USING btree (template_id, merchant_id);


--
-- Name: item_taxes_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_taxes_category_idx ON public.item_taxes USING btree (tax_category_id, merchant_id);


--
-- Name: item_taxes_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_taxes_item_idx ON public.item_taxes USING btree (item_id, merchant_id);


--
-- Name: item_taxes_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_taxes_template_idx ON public.item_taxes USING btree (item_tax_template_id, merchant_id);


--
-- Name: item_uoms_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_uoms_item_idx ON public.item_uoms USING btree (item_id, merchant_id);


--
-- Name: item_uoms_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_uoms_uom_idx ON public.item_uoms USING btree (uom_id, merchant_id);


--
-- Name: items_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_brand_idx ON public.items USING btree (brand_id, merchant_id);


--
-- Name: items_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_cost_center_idx ON public.items USING btree (selling_cost_center, merchant_id);


--
-- Name: items_discount_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_discount_account_idx ON public.items USING btree (discount_account, merchant_id);


--
-- Name: items_expense_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_expense_account_idx ON public.items USING btree (expense_account, merchant_id);


--
-- Name: items_income_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_income_account_idx ON public.items USING btree (income_account, merchant_id);


--
-- Name: items_item_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_item_group_idx ON public.items USING btree (item_group_id, merchant_id);


--
-- Name: items_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_price_list_idx ON public.items USING btree (default_price_list, merchant_id);


--
-- Name: items_sales_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_sales_uom_idx ON public.items USING btree (sales_uom, merchant_id);


--
-- Name: items_stock_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_stock_uom_idx ON public.items USING btree (stock_uom, merchant_id);


--
-- Name: items_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX items_warehouse_idx ON public.items USING btree (default_warehouse, merchant_id);


--
-- Name: letter_heads_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX letter_heads_one_default ON public.letter_heads USING btree (merchant_id) WHERE is_default;


--
-- Name: member_overrides_member_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_overrides_member_merchant_idx ON public.member_overrides USING btree (member_id, merchant_id);


--
-- Name: member_overrides_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_overrides_merchant_id_idx ON public.member_overrides USING btree (merchant_id);


--
-- Name: member_overrides_permission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_overrides_permission_idx ON public.member_overrides USING btree (permission);


--
-- Name: merchant_members_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_members_role_id_idx ON public.merchant_members USING btree (role_id, merchant_id);


--
-- Name: merchant_members_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_members_user_id_idx ON public.merchant_members USING btree (user_id);


--
-- Name: merchants_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchants_owner_id_idx ON public.merchants USING btree (owner_id);


--
-- Name: modes_of_payment_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX modes_of_payment_account_idx ON public.modes_of_payment USING btree (default_account, merchant_id);


--
-- Name: notifications_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_merchant_id_idx ON public.notifications USING btree (merchant_id);


--
-- Name: notifications_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_request_id_idx ON public.notifications USING btree (request_id);


--
-- Name: notifications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: permission_rules_doctype_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permission_rules_doctype_idx ON public.permission_rules USING btree (doctype, ptype);


--
-- Name: permissions_requires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permissions_requires_idx ON public.permissions USING btree (requires);


--
-- Name: pos_closing_entries_one_per_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_closing_entries_one_per_session ON public.pos_closing_entries USING btree (pos_opening_entry_id) WHERE (docstatus = 1);


--
-- Name: pos_closing_entries_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_closing_entries_session_idx ON public.pos_closing_entries USING btree (pos_opening_entry_id, merchant_id);


--
-- Name: pos_closing_entry_payments_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_closing_entry_payments_mode_idx ON public.pos_closing_entry_payments USING btree (mode_of_payment_id, merchant_id);


--
-- Name: pos_invoice_items_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_cost_center_idx ON public.pos_invoice_items USING btree (cost_center, merchant_id);


--
-- Name: pos_invoice_items_discount_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_discount_account_idx ON public.pos_invoice_items USING btree (discount_account, merchant_id);


--
-- Name: pos_invoice_items_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_expense_idx ON public.pos_invoice_items USING btree (expense_account, merchant_id);


--
-- Name: pos_invoice_items_income_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_income_idx ON public.pos_invoice_items USING btree (income_account, merchant_id);


--
-- Name: pos_invoice_items_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_item_idx ON public.pos_invoice_items USING btree (item_id, merchant_id);


--
-- Name: pos_invoice_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_parent_idx ON public.pos_invoice_items USING btree (pos_invoice_id, merchant_id);


--
-- Name: pos_invoice_items_pricing_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_pricing_rule_idx ON public.pos_invoice_items USING btree (pricing_rule_id, merchant_id);


--
-- Name: pos_invoice_items_return_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_return_idx ON public.pos_invoice_items USING btree (return_against_item, merchant_id);


--
-- Name: pos_invoice_items_return_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_invoice_items_return_once ON public.pos_invoice_items USING btree (pos_invoice_id, return_against_item) WHERE (return_against_item IS NOT NULL);


--
-- Name: pos_invoice_items_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_template_idx ON public.pos_invoice_items USING btree (item_tax_template_id, merchant_id);


--
-- Name: pos_invoice_items_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_items_uom_idx ON public.pos_invoice_items USING btree (uom_id, merchant_id);


--
-- Name: pos_invoice_payments_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_payments_account_idx ON public.pos_invoice_payments USING btree (account, merchant_id);


--
-- Name: pos_invoice_payments_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_payments_mode_idx ON public.pos_invoice_payments USING btree (mode_of_payment_id, merchant_id);


--
-- Name: pos_invoice_payments_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_payments_parent_idx ON public.pos_invoice_payments USING btree (pos_invoice_id, merchant_id);


--
-- Name: pos_invoice_taxes_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_taxes_account_idx ON public.pos_invoice_taxes USING btree (account_head, merchant_id);


--
-- Name: pos_invoice_taxes_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_taxes_cost_center_idx ON public.pos_invoice_taxes USING btree (cost_center, merchant_id);


--
-- Name: pos_invoice_taxes_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoice_taxes_parent_idx ON public.pos_invoice_taxes USING btree (pos_invoice_id, merchant_id);


--
-- Name: pos_invoices_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_date_idx ON public.pos_invoices USING btree (merchant_id, posting_date DESC, created_at DESC);


--
-- Name: pos_invoices_discount_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_discount_account_idx ON public.pos_invoices USING btree (additional_discount_account, merchant_id);


--
-- Name: pos_invoices_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_price_list_idx ON public.pos_invoices USING btree (selling_price_list, merchant_id);


--
-- Name: pos_invoices_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_profile_idx ON public.pos_invoices USING btree (pos_profile_id, merchant_id);


--
-- Name: pos_invoices_return_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_return_idx ON public.pos_invoices USING btree (return_against, merchant_id);


--
-- Name: pos_invoices_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_session_idx ON public.pos_invoices USING btree (pos_opening_entry_id, merchant_id);


--
-- Name: pos_invoices_tax_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_tax_category_idx ON public.pos_invoices USING btree (tax_category, merchant_id);


--
-- Name: pos_invoices_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_template_idx ON public.pos_invoices USING btree (taxes_and_charges, merchant_id);


--
-- Name: pos_invoices_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_invoices_warehouse_idx ON public.pos_invoices USING btree (warehouse, merchant_id);


--
-- Name: pos_opening_entries_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_opening_entries_one_open ON public.pos_opening_entries USING btree (pos_profile_id, user_id) WHERE ((docstatus = 1) AND (status = 'Open'::text));


--
-- Name: pos_opening_entries_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_opening_entries_profile_idx ON public.pos_opening_entries USING btree (pos_profile_id, merchant_id);


--
-- Name: pos_opening_entries_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_opening_entries_user_idx ON public.pos_opening_entries USING btree (user_id);


--
-- Name: pos_opening_entry_balances_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_opening_entry_balances_mode_idx ON public.pos_opening_entry_balances USING btree (mode_of_payment_id, merchant_id);


--
-- Name: pos_profile_item_groups_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profile_item_groups_group_idx ON public.pos_profile_item_groups USING btree (item_group_id, merchant_id);


--
-- Name: pos_profile_payments_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profile_payments_mode_idx ON public.pos_profile_payments USING btree (mode_of_payment_id, merchant_id);


--
-- Name: pos_profile_users_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profile_users_member_idx ON public.pos_profile_users USING btree (member_id, merchant_id);


--
-- Name: pos_profile_users_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_profile_users_one_default ON public.pos_profile_users USING btree (member_id) WHERE is_default;


--
-- Name: pos_profiles_change_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_change_account_idx ON public.pos_profiles USING btree (account_for_change_amount, merchant_id);


--
-- Name: pos_profiles_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_cost_center_idx ON public.pos_profiles USING btree (cost_center, merchant_id);


--
-- Name: pos_profiles_discount_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_discount_account_idx ON public.pos_profiles USING btree (discount_account, merchant_id);


--
-- Name: pos_profiles_expense_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_expense_account_idx ON public.pos_profiles USING btree (expense_account, merchant_id);


--
-- Name: pos_profiles_income_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_income_account_idx ON public.pos_profiles USING btree (income_account, merchant_id);


--
-- Name: pos_profiles_letter_head_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_letter_head_idx ON public.pos_profiles USING btree (letter_head, merchant_id);


--
-- Name: pos_profiles_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_price_list_idx ON public.pos_profiles USING btree (selling_price_list, merchant_id);


--
-- Name: pos_profiles_print_format_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_print_format_idx ON public.pos_profiles USING btree (print_format, merchant_id);


--
-- Name: pos_profiles_tax_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_tax_category_idx ON public.pos_profiles USING btree (tax_category, merchant_id);


--
-- Name: pos_profiles_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_template_idx ON public.pos_profiles USING btree (taxes_and_charges, merchant_id);


--
-- Name: pos_profiles_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_warehouse_idx ON public.pos_profiles USING btree (warehouse, merchant_id);


--
-- Name: pos_profiles_write_off_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_write_off_account_idx ON public.pos_profiles USING btree (write_off_account, merchant_id);


--
-- Name: pos_profiles_write_off_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_profiles_write_off_cost_center_idx ON public.pos_profiles USING btree (write_off_cost_center, merchant_id);


--
-- Name: pricing_rule_targets_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_rule_targets_brand_idx ON public.pricing_rule_targets USING btree (brand_id, merchant_id);


--
-- Name: pricing_rule_targets_item_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_rule_targets_item_group_idx ON public.pricing_rule_targets USING btree (item_group_id, merchant_id);


--
-- Name: pricing_rule_targets_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_rule_targets_item_idx ON public.pricing_rule_targets USING btree (item_id, merchant_id);


--
-- Name: pricing_rule_targets_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_rule_targets_rule_idx ON public.pricing_rule_targets USING btree (pricing_rule_id, merchant_id);


--
-- Name: pricing_rules_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pricing_rules_price_list_idx ON public.pricing_rules USING btree (for_price_list, merchant_id);


--
-- Name: print_formats_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX print_formats_one_default ON public.print_formats USING btree (merchant_id) WHERE is_default;


--
-- Name: role_grants_merchant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_grants_merchant_id_idx ON public.role_grants USING btree (merchant_id);


--
-- Name: role_grants_permission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_grants_permission_idx ON public.role_grants USING btree (permission);


--
-- Name: role_grants_role_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_grants_role_merchant_idx ON public.role_grants USING btree (role_id, merchant_id);


--
-- Name: sales_tax_template_rows_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_tax_template_rows_account_idx ON public.sales_tax_template_rows USING btree (account, merchant_id);


--
-- Name: sales_tax_template_rows_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_tax_template_rows_cost_center_idx ON public.sales_tax_template_rows USING btree (cost_center, merchant_id);


--
-- Name: sales_tax_template_rows_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_tax_template_rows_template_idx ON public.sales_tax_template_rows USING btree (template_id, merchant_id);


--
-- Name: sales_tax_templates_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_tax_templates_category_idx ON public.sales_tax_templates USING btree (tax_category_id, merchant_id);


--
-- Name: sales_tax_templates_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_tax_templates_one_default ON public.sales_tax_templates USING btree (merchant_id) WHERE is_default;


--
-- Name: sales_tax_templates_one_per_category; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_tax_templates_one_per_category ON public.sales_tax_templates USING btree (merchant_id, tax_category_id) WHERE ((tax_category_id IS NOT NULL) AND (NOT disabled));


--
-- Name: selling_settings_price_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX selling_settings_price_list_idx ON public.selling_settings USING btree (default_price_list, merchant_id);


--
-- Name: stock_entries_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entries_account_idx ON public.stock_entries USING btree (difference_account, merchant_id);


--
-- Name: stock_entries_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entries_cost_center_idx ON public.stock_entries USING btree (cost_center, merchant_id);


--
-- Name: stock_entries_from_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entries_from_warehouse_idx ON public.stock_entries USING btree (from_warehouse, merchant_id);


--
-- Name: stock_entries_to_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entries_to_warehouse_idx ON public.stock_entries USING btree (to_warehouse, merchant_id);


--
-- Name: stock_entry_items_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entry_items_item_idx ON public.stock_entry_items USING btree (item_id, merchant_id);


--
-- Name: stock_entry_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entry_items_parent_idx ON public.stock_entry_items USING btree (stock_entry_id, merchant_id);


--
-- Name: stock_ledger_entries_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_entries_item_idx ON public.stock_ledger_entries USING btree (item_id, merchant_id);


--
-- Name: stock_ledger_entries_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_entries_posting_idx ON public.stock_ledger_entries USING btree (merchant_id, posting_date DESC, id DESC);


--
-- Name: stock_ledger_entries_voucher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_entries_voucher_idx ON public.stock_ledger_entries USING btree (voucher_id);


--
-- Name: stock_ledger_entries_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_entries_warehouse_idx ON public.stock_ledger_entries USING btree (warehouse_id, merchant_id);


--
-- Name: stock_reconciliation_items_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_reconciliation_items_item_idx ON public.stock_reconciliation_items USING btree (item_id, merchant_id);


--
-- Name: stock_reconciliation_items_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_reconciliation_items_parent_idx ON public.stock_reconciliation_items USING btree (stock_reconciliation_id, merchant_id);


--
-- Name: stock_reconciliation_items_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_reconciliation_items_warehouse_idx ON public.stock_reconciliation_items USING btree (warehouse_id, merchant_id);


--
-- Name: stock_reconciliations_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_reconciliations_account_idx ON public.stock_reconciliations USING btree (difference_account, merchant_id);


--
-- Name: stock_reconciliations_cost_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_reconciliations_cost_center_idx ON public.stock_reconciliations USING btree (cost_center, merchant_id);


--
-- Name: stock_settings_item_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_settings_item_group_idx ON public.stock_settings USING btree (item_group, merchant_id);


--
-- Name: stock_settings_uom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_settings_uom_idx ON public.stock_settings USING btree (stock_uom, merchant_id);


--
-- Name: stock_settings_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_settings_warehouse_idx ON public.stock_settings USING btree (default_warehouse, merchant_id);


--
-- Name: tax_rules_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_rules_category_idx ON public.tax_rules USING btree (tax_category_id, merchant_id);


--
-- Name: tax_rules_item_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_rules_item_group_idx ON public.tax_rules USING btree (item_group_id, merchant_id);


--
-- Name: tax_rules_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_rules_template_idx ON public.tax_rules USING btree (sales_tax_template_id, merchant_id);


--
-- Name: uom_conversion_factors_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uom_conversion_factors_from_idx ON public.uom_conversion_factors USING btree (from_uom, merchant_id);


--
-- Name: uom_conversion_factors_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uom_conversion_factors_to_idx ON public.uom_conversion_factors USING btree (to_uom, merchant_id);


--
-- Name: warehouses_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_account_idx ON public.warehouses USING btree (account, merchant_id);


--
-- Name: warehouses_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_parent_idx ON public.warehouses USING btree (parent_id, merchant_id);


--
-- Name: access_requests access_requests_notify_decided; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access_requests_notify_decided AFTER UPDATE OF status ON public.access_requests FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION private.notify_access_request();


--
-- Name: access_requests access_requests_notify_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access_requests_notify_insert AFTER INSERT ON public.access_requests FOR EACH ROW EXECUTE FUNCTION private.notify_access_request();


--
-- Name: accounts accounts_validate_tree; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_validate_tree BEFORE INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION private.validate_tree();


--
-- Name: brands brands_validate_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brands_validate_defaults BEFORE INSERT OR UPDATE OF default_warehouse, default_price_list, selling_cost_center, income_account ON public.brands FOR EACH ROW EXECUTE FUNCTION private.validate_defaults();


--
-- Name: cost_centers cost_centers_validate_tree; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_centers_validate_tree BEFORE INSERT OR DELETE OR UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION private.validate_tree();


--
-- Name: fiscal_years fiscal_years_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fiscal_years_single_default BEFORE INSERT OR UPDATE OF is_default ON public.fiscal_years FOR EACH ROW EXECUTE FUNCTION private.fiscal_years_single_default();


--
-- Name: item_groups item_groups_validate_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_groups_validate_defaults BEFORE INSERT OR UPDATE OF default_price_list, default_warehouse, selling_cost_center, income_account, expense_account ON public.item_groups FOR EACH ROW EXECUTE FUNCTION private.validate_defaults();


--
-- Name: item_groups item_groups_validate_tree; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_groups_validate_tree BEFORE INSERT OR DELETE OR UPDATE ON public.item_groups FOR EACH ROW EXECUTE FUNCTION private.validate_tree();


--
-- Name: item_prices item_prices_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_prices_validate BEFORE INSERT OR UPDATE OF item_id, price_list_id, uom_id ON public.item_prices FOR EACH ROW EXECUTE FUNCTION private.validate_item_price();


--
-- Name: item_tax_template_rows item_tax_template_rows_validate_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_tax_template_rows_validate_account BEFORE INSERT OR UPDATE OF account ON public.item_tax_template_rows FOR EACH ROW EXECUTE FUNCTION private.validate_tax_account();


--
-- Name: items items_prepare; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_prepare BEFORE INSERT OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION private.prepare_item();


--
-- Name: items items_validate_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_validate_defaults BEFORE INSERT OR UPDATE OF stock_uom, default_warehouse, default_price_list, selling_cost_center, income_account, expense_account ON public.items FOR EACH ROW EXECUTE FUNCTION private.validate_defaults();


--
-- Name: items items_validate_discount_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_validate_discount_account BEFORE INSERT OR UPDATE OF discount_account ON public.items FOR EACH ROW EXECUTE FUNCTION private.validate_discount_account('discount_account');


--
-- Name: letter_heads letter_heads_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER letter_heads_single_default BEFORE INSERT OR UPDATE OF is_default ON public.letter_heads FOR EACH ROW EXECUTE FUNCTION private.single_default();


--
-- Name: member_overrides member_overrides_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER member_overrides_notify AFTER INSERT OR DELETE OR UPDATE ON public.member_overrides FOR EACH ROW EXECUTE FUNCTION private.notify_access_changed();


--
-- Name: merchant_members merchant_members_notify_removed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_members_notify_removed AFTER DELETE ON public.merchant_members FOR EACH ROW EXECUTE FUNCTION private.notify_member_removed();


--
-- Name: merchant_members merchant_members_notify_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_members_notify_role AFTER UPDATE OF role_id ON public.merchant_members FOR EACH ROW WHEN ((old.role_id IS DISTINCT FROM new.role_id)) EXECUTE FUNCTION private.notify_access_changed();


--
-- Name: merchant_members merchant_members_require_access_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_members_require_access_request BEFORE INSERT OR UPDATE OF user_id, merchant_id ON public.merchant_members FOR EACH ROW EXECUTE FUNCTION private.require_access_request();


--
-- Name: merchants merchants_company_currency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_company_currency AFTER UPDATE OF default_currency ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.company_currency();


--
-- Name: merchants merchants_keep_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_keep_owner BEFORE UPDATE OF owner_id ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.merchants_keep_owner();


--
-- Name: merchants merchants_seed_10_company; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_10_company AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_company();


--
-- Name: merchants merchants_seed_20_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_20_access AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_access();


--
-- Name: merchants merchants_seed_30_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_30_defaults AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_defaults();


--
-- Name: merchants merchants_seed_40_accounting; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_40_accounting AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_accounting();


--
-- Name: merchants merchants_seed_50_accounting_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_50_accounting_defaults AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_accounting_defaults();


--
-- Name: merchants merchants_seed_52_discounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_52_discounts AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_discounts();


--
-- Name: merchants merchants_seed_60_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_60_payments AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_payments();


--
-- Name: merchants merchants_seed_70_taxes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_70_taxes AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_taxes();


--
-- Name: merchants merchants_seed_80_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_80_stock AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_stock();


--
-- Name: merchants merchants_seed_90_selling; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_90_selling AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_selling();


--
-- Name: merchants merchants_seed_92_stock_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_92_stock_settings AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_stock_settings();


--
-- Name: merchants merchants_seed_94_naming; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_94_naming AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_naming();


--
-- Name: merchants merchants_seed_96_printing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_seed_96_printing AFTER INSERT ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.seed_printing();


--
-- Name: merchants merchants_validate_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_validate_accounts BEFORE INSERT OR UPDATE OF default_cash_account, default_bank_account, default_income_account, default_expense_account, cost_center, write_off_account, round_off_account, round_off_cost_center, default_inventory_account, stock_adjustment_account, stock_received_but_not_billed, expenses_included_in_valuation ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.validate_company_accounts();


--
-- Name: merchants merchants_validate_discount_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_validate_discount_account BEFORE INSERT OR UPDATE OF default_discount_account ON public.merchants FOR EACH ROW EXECUTE FUNCTION private.validate_discount_account('default_discount_account');


--
-- Name: modes_of_payment modes_of_payment_validate_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER modes_of_payment_validate_account BEFORE INSERT OR UPDATE OF type, default_account ON public.modes_of_payment FOR EACH ROW EXECUTE FUNCTION private.validate_mode_of_payment_account();


--
-- Name: naming_series naming_series_unique; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER naming_series_unique BEFORE INSERT OR UPDATE OF options ON public.naming_series FOR EACH ROW EXECUTE FUNCTION private.naming_series_unique();


--
-- Name: pos_closing_entries pos_closing_entries_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_closing_entries_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_closing_entries FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus();


--
-- Name: pos_closing_entries pos_closing_entries_keep; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_closing_entries_keep BEFORE UPDATE OF docstatus ON public.pos_closing_entries FOR EACH ROW EXECUTE FUNCTION private.keep_pos_entry();


--
-- Name: pos_closing_entries pos_closing_entries_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_closing_entries_name BEFORE INSERT ON public.pos_closing_entries FOR EACH ROW EXECUTE FUNCTION private.name_document('POS Closing Entry');


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_closing_entry_payments_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_closing_entry_payments FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('pos_closing_entries', 'pos_closing_entry_id');


--
-- Name: pos_invoice_items pos_invoice_items_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoice_items_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_invoice_items FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('pos_invoices', 'pos_invoice_id');


--
-- Name: pos_invoice_payments pos_invoice_payments_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoice_payments_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_invoice_payments FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('pos_invoices', 'pos_invoice_id');


--
-- Name: pos_invoice_taxes pos_invoice_taxes_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoice_taxes_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_invoice_taxes FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('pos_invoices', 'pos_invoice_id');


--
-- Name: pos_invoices pos_invoices_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoices_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_invoices FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus();


--
-- Name: pos_invoices pos_invoices_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoices_name BEFORE INSERT ON public.pos_invoices FOR EACH ROW EXECUTE FUNCTION private.name_document('POS Invoice');


--
-- Name: pos_invoices pos_invoices_void_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_invoices_void_guard BEFORE UPDATE OF docstatus ON public.pos_invoices FOR EACH ROW EXECUTE FUNCTION private.guard_pos_invoice_void();


--
-- Name: pos_opening_entries pos_opening_entries_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_opening_entries_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_opening_entries FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus();


--
-- Name: pos_opening_entries pos_opening_entries_keep; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_opening_entries_keep BEFORE UPDATE OF docstatus ON public.pos_opening_entries FOR EACH ROW EXECUTE FUNCTION private.keep_pos_entry();


--
-- Name: pos_opening_entries pos_opening_entries_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_opening_entries_name BEFORE INSERT ON public.pos_opening_entries FOR EACH ROW EXECUTE FUNCTION private.name_document('POS Opening Entry');


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_opening_entry_balances_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.pos_opening_entry_balances FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('pos_opening_entries', 'pos_opening_entry_id');


--
-- Name: pos_profile_payments pos_profile_payments_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER pos_profile_payments_validate AFTER INSERT OR DELETE OR UPDATE ON public.pos_profile_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_pos_profile_payments();


--
-- Name: pos_profiles pos_profiles_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_profiles_validate BEFORE INSERT OR UPDATE ON public.pos_profiles FOR EACH ROW EXECUTE FUNCTION private.validate_pos_profile();


--
-- Name: pos_profiles pos_profiles_validate_discount_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_profiles_validate_discount_account BEFORE INSERT OR UPDATE OF discount_account ON public.pos_profiles FOR EACH ROW EXECUTE FUNCTION private.validate_discount_account('discount_account');


--
-- Name: pos_profiles pos_profiles_validate_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER pos_profiles_validate_payments AFTER INSERT ON public.pos_profiles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_pos_profile_payments();


--
-- Name: print_formats print_formats_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER print_formats_single_default BEFORE INSERT OR UPDATE OF is_default ON public.print_formats FOR EACH ROW EXECUTE FUNCTION private.single_default();


--
-- Name: role_grants role_grants_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER role_grants_notify AFTER INSERT OR DELETE ON public.role_grants FOR EACH ROW EXECUTE FUNCTION private.notify_access_changed();


--
-- Name: sales_tax_template_rows sales_tax_template_rows_validate_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_tax_template_rows_validate_account BEFORE INSERT OR UPDATE OF account, cost_center ON public.sales_tax_template_rows FOR EACH ROW EXECUTE FUNCTION private.validate_tax_account();


--
-- Name: sales_tax_template_rows sales_tax_template_rows_validate_references; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER sales_tax_template_rows_validate_references AFTER INSERT OR DELETE OR UPDATE ON public.sales_tax_template_rows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_tax_row_references();


--
-- Name: sales_tax_templates sales_tax_templates_single_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_tax_templates_single_default BEFORE INSERT OR UPDATE OF is_default ON public.sales_tax_templates FOR EACH ROW EXECUTE FUNCTION private.sales_tax_templates_single_default();


--
-- Name: selling_settings selling_settings_validate_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER selling_settings_validate_defaults BEFORE INSERT OR UPDATE OF default_price_list ON public.selling_settings FOR EACH ROW EXECUTE FUNCTION private.validate_defaults();


--
-- Name: stock_entries stock_entries_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_entries_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.stock_entries FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus();


--
-- Name: stock_entries stock_entries_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_entries_name BEFORE INSERT ON public.stock_entries FOR EACH ROW EXECUTE FUNCTION private.name_document('Stock Entry');


--
-- Name: stock_entries stock_entries_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_entries_validate BEFORE INSERT OR UPDATE ON public.stock_entries FOR EACH ROW EXECUTE FUNCTION private.validate_stock_document();


--
-- Name: stock_entry_items stock_entry_items_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_entry_items_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.stock_entry_items FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('stock_entries', 'stock_entry_id');


--
-- Name: stock_reconciliation_items stock_reconciliation_items_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_reconciliation_items_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.stock_reconciliation_items FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus_child('stock_reconciliations', 'stock_reconciliation_id');


--
-- Name: stock_reconciliations stock_reconciliations_docstatus; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_reconciliations_docstatus BEFORE INSERT OR DELETE OR UPDATE ON public.stock_reconciliations FOR EACH ROW EXECUTE FUNCTION private.guard_docstatus();


--
-- Name: stock_reconciliations stock_reconciliations_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_reconciliations_name BEFORE INSERT ON public.stock_reconciliations FOR EACH ROW EXECUTE FUNCTION private.name_document('Stock Reconciliation');


--
-- Name: stock_reconciliations stock_reconciliations_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_reconciliations_validate BEFORE INSERT OR UPDATE ON public.stock_reconciliations FOR EACH ROW EXECUTE FUNCTION private.validate_stock_document();


--
-- Name: stock_settings stock_settings_validate_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_settings_validate_defaults BEFORE INSERT OR UPDATE OF stock_uom, default_warehouse ON public.stock_settings FOR EACH ROW EXECUTE FUNCTION private.validate_defaults();


--
-- Name: system_settings system_settings_time_zone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER system_settings_time_zone BEFORE INSERT OR UPDATE OF time_zone ON public.system_settings FOR EACH ROW EXECUTE FUNCTION private.validate_time_zone();


--
-- Name: warehouses warehouses_validate_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warehouses_validate_account BEFORE INSERT OR UPDATE OF account ON public.warehouses FOR EACH ROW EXECUTE FUNCTION private.validate_warehouse_account();


--
-- Name: warehouses warehouses_validate_tree; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warehouses_validate_tree BEFORE INSERT OR DELETE OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION private.validate_tree();


--
-- Name: access_codes access_codes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: access_requests access_requests_access_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_access_code_id_fkey FOREIGN KEY (access_code_id) REFERENCES public.access_codes(id) ON DELETE SET NULL;


--
-- Name: access_requests access_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: access_requests access_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_fk FOREIGN KEY (parent_id, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: accounts_settings accounts_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_settings
    ADD CONSTRAINT accounts_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: accounts_settings accounts_settings_modifier_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_settings
    ADD CONSTRAINT accounts_settings_modifier_fk FOREIGN KEY (frozen_accounts_modifier, merchant_id) REFERENCES public.roles(id, merchant_id) ON DELETE SET NULL (frozen_accounts_modifier);


--
-- Name: bins bins_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: bins bins_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: bins bins_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bins
    ADD CONSTRAINT bins_warehouse_fk FOREIGN KEY (warehouse_id, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: brands brands_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_cost_center_fk FOREIGN KEY (selling_cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: brands brands_income_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_income_account_fk FOREIGN KEY (income_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: brands brands_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: brands brands_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_price_list_fk FOREIGN KEY (default_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: brands brands_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_warehouse_fk FOREIGN KEY (default_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: cost_centers cost_centers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cost_centers cost_centers_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_fk FOREIGN KEY (parent_id, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: countries countries_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currency_presets(code);


--
-- Name: currencies currencies_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_fkey FOREIGN KEY (code) REFERENCES public.currency_presets(code);


--
-- Name: currencies currencies_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fiscal_years fiscal_years_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_years
    ADD CONSTRAINT fiscal_years_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: gl_entries gl_entries_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_entries
    ADD CONSTRAINT gl_entries_account_fk FOREIGN KEY (account_id, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: gl_entries gl_entries_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_entries
    ADD CONSTRAINT gl_entries_cost_center_fk FOREIGN KEY (cost_center_id, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: gl_entries gl_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gl_entries
    ADD CONSTRAINT gl_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: global_defaults global_defaults_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_defaults
    ADD CONSTRAINT global_defaults_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_group_taxes item_group_taxes_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_group_taxes
    ADD CONSTRAINT item_group_taxes_category_fk FOREIGN KEY (tax_category_id, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: item_group_taxes item_group_taxes_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_group_taxes
    ADD CONSTRAINT item_group_taxes_group_fk FOREIGN KEY (item_group_id, merchant_id) REFERENCES public.item_groups(id, merchant_id) ON DELETE CASCADE;


--
-- Name: item_group_taxes item_group_taxes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_group_taxes
    ADD CONSTRAINT item_group_taxes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_group_taxes item_group_taxes_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_group_taxes
    ADD CONSTRAINT item_group_taxes_template_fk FOREIGN KEY (item_tax_template_id, merchant_id) REFERENCES public.item_tax_templates(id, merchant_id);


--
-- Name: item_groups item_groups_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_cost_center_fk FOREIGN KEY (selling_cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: item_groups item_groups_expense_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_expense_account_fk FOREIGN KEY (expense_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: item_groups item_groups_income_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_income_account_fk FOREIGN KEY (income_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: item_groups item_groups_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_groups item_groups_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_parent_fk FOREIGN KEY (parent_id, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: item_groups item_groups_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_price_list_fk FOREIGN KEY (default_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: item_groups item_groups_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_groups
    ADD CONSTRAINT item_groups_warehouse_fk FOREIGN KEY (default_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: item_prices item_prices_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id) ON DELETE CASCADE;


--
-- Name: item_prices item_prices_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_prices item_prices_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_price_list_fk FOREIGN KEY (price_list_id, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: item_prices item_prices_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_uom_fk FOREIGN KEY (uom_id, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: item_tax_template_rows item_tax_template_rows_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_template_rows
    ADD CONSTRAINT item_tax_template_rows_account_fk FOREIGN KEY (account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: item_tax_template_rows item_tax_template_rows_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_template_rows
    ADD CONSTRAINT item_tax_template_rows_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_tax_template_rows item_tax_template_rows_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_template_rows
    ADD CONSTRAINT item_tax_template_rows_template_fk FOREIGN KEY (template_id, merchant_id) REFERENCES public.item_tax_templates(id, merchant_id) ON DELETE CASCADE;


--
-- Name: item_tax_templates item_tax_templates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_tax_templates
    ADD CONSTRAINT item_tax_templates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_taxes item_taxes_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_taxes
    ADD CONSTRAINT item_taxes_category_fk FOREIGN KEY (tax_category_id, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: item_taxes item_taxes_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_taxes
    ADD CONSTRAINT item_taxes_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id) ON DELETE CASCADE;


--
-- Name: item_taxes item_taxes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_taxes
    ADD CONSTRAINT item_taxes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_taxes item_taxes_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_taxes
    ADD CONSTRAINT item_taxes_template_fk FOREIGN KEY (item_tax_template_id, merchant_id) REFERENCES public.item_tax_templates(id, merchant_id);


--
-- Name: item_uoms item_uoms_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id) ON DELETE CASCADE;


--
-- Name: item_uoms item_uoms_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_uoms item_uoms_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_uom_fk FOREIGN KEY (uom_id, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: items items_brand_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_brand_fk FOREIGN KEY (brand_id, merchant_id) REFERENCES public.brands(id, merchant_id);


--
-- Name: items items_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_cost_center_fk FOREIGN KEY (selling_cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: items items_discount_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_discount_account_fk FOREIGN KEY (discount_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: items items_expense_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_expense_account_fk FOREIGN KEY (expense_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: items items_income_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_income_account_fk FOREIGN KEY (income_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: items items_item_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_item_group_fk FOREIGN KEY (item_group_id, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: items items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: items items_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_price_list_fk FOREIGN KEY (default_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: items items_sales_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_sales_uom_fk FOREIGN KEY (sales_uom, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: items items_stock_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_stock_uom_fk FOREIGN KEY (stock_uom, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: items items_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_warehouse_fk FOREIGN KEY (default_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: letter_heads letter_heads_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_heads
    ADD CONSTRAINT letter_heads_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: member_overrides member_overrides_member_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_overrides
    ADD CONSTRAINT member_overrides_member_fk FOREIGN KEY (member_id, merchant_id) REFERENCES public.merchant_members(id, merchant_id) ON DELETE CASCADE;


--
-- Name: member_overrides member_overrides_permission_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_overrides
    ADD CONSTRAINT member_overrides_permission_fkey FOREIGN KEY (permission) REFERENCES public.permissions(key) ON DELETE CASCADE;


--
-- Name: merchant_members merchant_members_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_members merchant_members_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_role_fk FOREIGN KEY (role_id, merchant_id) REFERENCES public.roles(id, merchant_id) ON DELETE SET NULL (role_id);


--
-- Name: merchant_members merchant_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: merchants merchants_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_cost_center_fk FOREIGN KEY (cost_center, id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: merchants merchants_country_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_country_fk FOREIGN KEY (country_code) REFERENCES public.countries(code);


--
-- Name: merchants merchants_default_bank_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_bank_account_fk FOREIGN KEY (default_bank_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_default_cash_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_cash_account_fk FOREIGN KEY (default_cash_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_default_currency_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_currency_fk FOREIGN KEY (default_currency) REFERENCES public.currency_presets(code);


--
-- Name: merchants merchants_default_discount_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_discount_account_fk FOREIGN KEY (default_discount_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_default_expense_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_expense_account_fk FOREIGN KEY (default_expense_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_default_income_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_income_account_fk FOREIGN KEY (default_income_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_default_inventory_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_default_inventory_account_fk FOREIGN KEY (default_inventory_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_expenses_included_in_valuation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_expenses_included_in_valuation_fk FOREIGN KEY (expenses_included_in_valuation, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: merchants merchants_round_off_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_round_off_account_fk FOREIGN KEY (round_off_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_round_off_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_round_off_cost_center_fk FOREIGN KEY (round_off_cost_center, id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: merchants merchants_stock_adjustment_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_stock_adjustment_account_fk FOREIGN KEY (stock_adjustment_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_stock_received_but_not_billed_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_stock_received_but_not_billed_fk FOREIGN KEY (stock_received_but_not_billed, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: merchants merchants_write_off_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_write_off_account_fk FOREIGN KEY (write_off_account, id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: modes_of_payment modes_of_payment_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modes_of_payment
    ADD CONSTRAINT modes_of_payment_account_fk FOREIGN KEY (default_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: modes_of_payment modes_of_payment_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modes_of_payment
    ADD CONSTRAINT modes_of_payment_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: naming_series_counters naming_series_counters_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naming_series_counters
    ADD CONSTRAINT naming_series_counters_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: naming_series naming_series_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naming_series
    ADD CONSTRAINT naming_series_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.access_requests(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: permission_rules permission_rules_doctype_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_rules
    ADD CONSTRAINT permission_rules_doctype_fkey FOREIGN KEY (doctype) REFERENCES public.doctypes(name) ON DELETE CASCADE;


--
-- Name: permission_rules permission_rules_permission_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_rules
    ADD CONSTRAINT permission_rules_permission_fkey FOREIGN KEY (permission) REFERENCES public.permissions(key) ON DELETE CASCADE;


--
-- Name: permissions permissions_requires_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_requires_fkey FOREIGN KEY (requires) REFERENCES public.permissions(key);


--
-- Name: pos_closing_entries pos_closing_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entries
    ADD CONSTRAINT pos_closing_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_closing_entries pos_closing_entries_session_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entries
    ADD CONSTRAINT pos_closing_entries_session_fk FOREIGN KEY (pos_opening_entry_id, merchant_id) REFERENCES public.pos_opening_entries(id, merchant_id);


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entry_payments
    ADD CONSTRAINT pos_closing_entry_payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_mode_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entry_payments
    ADD CONSTRAINT pos_closing_entry_payments_mode_fk FOREIGN KEY (mode_of_payment_id, merchant_id) REFERENCES public.modes_of_payment(id, merchant_id);


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_closing_entry_payments
    ADD CONSTRAINT pos_closing_entry_payments_parent_fk FOREIGN KEY (pos_closing_entry_id, merchant_id) REFERENCES public.pos_closing_entries(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_invoice_items pos_invoice_items_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_discount_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_discount_account_fk FOREIGN KEY (discount_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_expense_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_expense_fk FOREIGN KEY (expense_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_income_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_income_fk FOREIGN KEY (income_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_invoice_items pos_invoice_items_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_parent_fk FOREIGN KEY (pos_invoice_id, merchant_id) REFERENCES public.pos_invoices(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_invoice_items pos_invoice_items_pricing_rule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_pricing_rule_fk FOREIGN KEY (pricing_rule_id, merchant_id) REFERENCES public.pricing_rules(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_return_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_return_fk FOREIGN KEY (return_against_item, merchant_id) REFERENCES public.pos_invoice_items(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_template_fk FOREIGN KEY (item_tax_template_id, merchant_id) REFERENCES public.item_tax_templates(id, merchant_id);


--
-- Name: pos_invoice_items pos_invoice_items_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_items
    ADD CONSTRAINT pos_invoice_items_uom_fk FOREIGN KEY (uom_id, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: pos_invoice_payments pos_invoice_payments_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_payments
    ADD CONSTRAINT pos_invoice_payments_account_fk FOREIGN KEY (account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoice_payments pos_invoice_payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_payments
    ADD CONSTRAINT pos_invoice_payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_invoice_payments pos_invoice_payments_mode_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_payments
    ADD CONSTRAINT pos_invoice_payments_mode_fk FOREIGN KEY (mode_of_payment_id, merchant_id) REFERENCES public.modes_of_payment(id, merchant_id);


--
-- Name: pos_invoice_payments pos_invoice_payments_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_payments
    ADD CONSTRAINT pos_invoice_payments_parent_fk FOREIGN KEY (pos_invoice_id, merchant_id) REFERENCES public.pos_invoices(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_invoice_taxes pos_invoice_taxes_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_taxes
    ADD CONSTRAINT pos_invoice_taxes_account_fk FOREIGN KEY (account_head, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoice_taxes pos_invoice_taxes_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_taxes
    ADD CONSTRAINT pos_invoice_taxes_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: pos_invoice_taxes pos_invoice_taxes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_taxes
    ADD CONSTRAINT pos_invoice_taxes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_invoice_taxes pos_invoice_taxes_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoice_taxes
    ADD CONSTRAINT pos_invoice_taxes_parent_fk FOREIGN KEY (pos_invoice_id, merchant_id) REFERENCES public.pos_invoices(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_invoices pos_invoices_discount_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_discount_account_fk FOREIGN KEY (additional_discount_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_invoices pos_invoices_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_price_list_fk FOREIGN KEY (selling_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_profile_fk FOREIGN KEY (pos_profile_id, merchant_id) REFERENCES public.pos_profiles(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_return_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_return_fk FOREIGN KEY (return_against, merchant_id) REFERENCES public.pos_invoices(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_session_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_session_fk FOREIGN KEY (pos_opening_entry_id, merchant_id) REFERENCES public.pos_opening_entries(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_tax_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_tax_category_fk FOREIGN KEY (tax_category, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_template_fk FOREIGN KEY (taxes_and_charges, merchant_id) REFERENCES public.sales_tax_templates(id, merchant_id);


--
-- Name: pos_invoices pos_invoices_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_invoices
    ADD CONSTRAINT pos_invoices_warehouse_fk FOREIGN KEY (warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: pos_opening_entries pos_opening_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entries
    ADD CONSTRAINT pos_opening_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_opening_entries pos_opening_entries_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entries
    ADD CONSTRAINT pos_opening_entries_profile_fk FOREIGN KEY (pos_profile_id, merchant_id) REFERENCES public.pos_profiles(id, merchant_id);


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entry_balances
    ADD CONSTRAINT pos_opening_entry_balances_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_mode_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entry_balances
    ADD CONSTRAINT pos_opening_entry_balances_mode_fk FOREIGN KEY (mode_of_payment_id, merchant_id) REFERENCES public.modes_of_payment(id, merchant_id);


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_opening_entry_balances
    ADD CONSTRAINT pos_opening_entry_balances_parent_fk FOREIGN KEY (pos_opening_entry_id, merchant_id) REFERENCES public.pos_opening_entries(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_profile_item_groups pos_profile_item_groups_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_item_groups
    ADD CONSTRAINT pos_profile_item_groups_group_fk FOREIGN KEY (item_group_id, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: pos_profile_item_groups pos_profile_item_groups_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_item_groups
    ADD CONSTRAINT pos_profile_item_groups_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_profile_item_groups pos_profile_item_groups_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_item_groups
    ADD CONSTRAINT pos_profile_item_groups_profile_fk FOREIGN KEY (pos_profile_id, merchant_id) REFERENCES public.pos_profiles(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_profile_payments pos_profile_payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_payments
    ADD CONSTRAINT pos_profile_payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_profile_payments pos_profile_payments_mode_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_payments
    ADD CONSTRAINT pos_profile_payments_mode_fk FOREIGN KEY (mode_of_payment_id, merchant_id) REFERENCES public.modes_of_payment(id, merchant_id);


--
-- Name: pos_profile_payments pos_profile_payments_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_payments
    ADD CONSTRAINT pos_profile_payments_profile_fk FOREIGN KEY (pos_profile_id, merchant_id) REFERENCES public.pos_profiles(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_profile_users pos_profile_users_member_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_users
    ADD CONSTRAINT pos_profile_users_member_fk FOREIGN KEY (member_id, merchant_id) REFERENCES public.merchant_members(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_profile_users pos_profile_users_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_users
    ADD CONSTRAINT pos_profile_users_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_profile_users pos_profile_users_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profile_users
    ADD CONSTRAINT pos_profile_users_profile_fk FOREIGN KEY (pos_profile_id, merchant_id) REFERENCES public.pos_profiles(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pos_profiles pos_profiles_change_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_change_account_fk FOREIGN KEY (account_for_change_amount, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_discount_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_discount_account_fk FOREIGN KEY (discount_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_expense_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_expense_account_fk FOREIGN KEY (expense_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_income_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_income_account_fk FOREIGN KEY (income_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_letter_head_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_letter_head_fk FOREIGN KEY (letter_head, merchant_id) REFERENCES public.letter_heads(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_profiles pos_profiles_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_price_list_fk FOREIGN KEY (selling_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_print_format_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_print_format_fk FOREIGN KEY (print_format, merchant_id) REFERENCES public.print_formats(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_tax_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_tax_category_fk FOREIGN KEY (tax_category, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_template_fk FOREIGN KEY (taxes_and_charges, merchant_id) REFERENCES public.sales_tax_templates(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_warehouse_fk FOREIGN KEY (warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_write_off_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_write_off_account_fk FOREIGN KEY (write_off_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: pos_profiles pos_profiles_write_off_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_write_off_cost_center_fk FOREIGN KEY (write_off_cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: price_lists price_lists_currency_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_currency_fk FOREIGN KEY (merchant_id, currency) REFERENCES public.currencies(merchant_id, code);


--
-- Name: price_lists price_lists_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pricing_rule_targets pricing_rule_targets_brand_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_brand_fk FOREIGN KEY (brand_id, merchant_id) REFERENCES public.brands(id, merchant_id);


--
-- Name: pricing_rule_targets pricing_rule_targets_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: pricing_rule_targets pricing_rule_targets_item_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_item_group_fk FOREIGN KEY (item_group_id, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: pricing_rule_targets pricing_rule_targets_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pricing_rule_targets pricing_rule_targets_rule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rule_targets
    ADD CONSTRAINT pricing_rule_targets_rule_fk FOREIGN KEY (pricing_rule_id, merchant_id) REFERENCES public.pricing_rules(id, merchant_id) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_price_list_fk FOREIGN KEY (for_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: print_formats print_formats_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_formats
    ADD CONSTRAINT print_formats_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: print_settings print_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: role_grants role_grants_permission_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_grants
    ADD CONSTRAINT role_grants_permission_fkey FOREIGN KEY (permission) REFERENCES public.permissions(key) ON DELETE CASCADE;


--
-- Name: role_grants role_grants_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_grants
    ADD CONSTRAINT role_grants_role_fk FOREIGN KEY (role_id, merchant_id) REFERENCES public.roles(id, merchant_id) ON DELETE CASCADE;


--
-- Name: roles roles_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: sales_tax_template_rows sales_tax_template_rows_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_account_fk FOREIGN KEY (account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: sales_tax_template_rows sales_tax_template_rows_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: sales_tax_template_rows sales_tax_template_rows_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: sales_tax_template_rows sales_tax_template_rows_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_template_rows
    ADD CONSTRAINT sales_tax_template_rows_template_fk FOREIGN KEY (template_id, merchant_id) REFERENCES public.sales_tax_templates(id, merchant_id) ON DELETE CASCADE;


--
-- Name: sales_tax_templates sales_tax_templates_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_templates
    ADD CONSTRAINT sales_tax_templates_category_fk FOREIGN KEY (tax_category_id, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: sales_tax_templates sales_tax_templates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_templates
    ADD CONSTRAINT sales_tax_templates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: selling_settings selling_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_settings
    ADD CONSTRAINT selling_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: selling_settings selling_settings_price_list_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_settings
    ADD CONSTRAINT selling_settings_price_list_fk FOREIGN KEY (default_price_list, merchant_id) REFERENCES public.price_lists(id, merchant_id);


--
-- Name: stock_entries stock_entries_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_account_fk FOREIGN KEY (difference_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: stock_entries stock_entries_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: stock_entries stock_entries_from_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_from_warehouse_fk FOREIGN KEY (from_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: stock_entries stock_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_entries stock_entries_to_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entries
    ADD CONSTRAINT stock_entries_to_warehouse_fk FOREIGN KEY (to_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: stock_entry_items stock_entry_items_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: stock_entry_items stock_entry_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_entry_items stock_entry_items_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_parent_fk FOREIGN KEY (stock_entry_id, merchant_id) REFERENCES public.stock_entries(id, merchant_id) ON DELETE CASCADE;


--
-- Name: stock_ledger_entries stock_ledger_entries_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: stock_ledger_entries stock_ledger_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_ledger_entries stock_ledger_entries_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_warehouse_fk FOREIGN KEY (warehouse_id, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: stock_reconciliation_items stock_reconciliation_items_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_item_fk FOREIGN KEY (item_id, merchant_id) REFERENCES public.items(id, merchant_id);


--
-- Name: stock_reconciliation_items stock_reconciliation_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_reconciliation_items stock_reconciliation_items_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_parent_fk FOREIGN KEY (stock_reconciliation_id, merchant_id) REFERENCES public.stock_reconciliations(id, merchant_id) ON DELETE CASCADE;


--
-- Name: stock_reconciliation_items stock_reconciliation_items_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_warehouse_fk FOREIGN KEY (warehouse_id, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: stock_reconciliations stock_reconciliations_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_account_fk FOREIGN KEY (difference_account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: stock_reconciliations stock_reconciliations_cost_center_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_cost_center_fk FOREIGN KEY (cost_center, merchant_id) REFERENCES public.cost_centers(id, merchant_id);


--
-- Name: stock_reconciliations stock_reconciliations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_settings stock_settings_item_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_settings
    ADD CONSTRAINT stock_settings_item_group_fk FOREIGN KEY (item_group, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: stock_settings stock_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_settings
    ADD CONSTRAINT stock_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_settings stock_settings_uom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_settings
    ADD CONSTRAINT stock_settings_uom_fk FOREIGN KEY (stock_uom, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: stock_settings stock_settings_warehouse_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_settings
    ADD CONSTRAINT stock_settings_warehouse_fk FOREIGN KEY (default_warehouse, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: system_settings system_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tax_categories tax_categories_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_categories
    ADD CONSTRAINT tax_categories_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tax_presets tax_presets_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_presets
    ADD CONSTRAINT tax_presets_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries(code);


--
-- Name: tax_rules tax_rules_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_category_fk FOREIGN KEY (tax_category_id, merchant_id) REFERENCES public.tax_categories(id, merchant_id);


--
-- Name: tax_rules tax_rules_item_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_item_group_fk FOREIGN KEY (item_group_id, merchant_id) REFERENCES public.item_groups(id, merchant_id);


--
-- Name: tax_rules tax_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tax_rules tax_rules_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_template_fk FOREIGN KEY (sales_tax_template_id, merchant_id) REFERENCES public.sales_tax_templates(id, merchant_id);


--
-- Name: uom_conversion_factors uom_conversion_factors_from_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_from_fk FOREIGN KEY (from_uom, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: uom_conversion_factors uom_conversion_factors_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: uom_conversion_factors uom_conversion_factors_to_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversion_factors
    ADD CONSTRAINT uom_conversion_factors_to_fk FOREIGN KEY (to_uom, merchant_id) REFERENCES public.uoms(id, merchant_id);


--
-- Name: uoms uoms_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: warehouses warehouses_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_account_fk FOREIGN KEY (account, merchant_id) REFERENCES public.accounts(id, merchant_id);


--
-- Name: warehouses warehouses_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: warehouses warehouses_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_parent_fk FOREIGN KEY (parent_id, merchant_id) REFERENCES public.warehouses(id, merchant_id);


--
-- Name: access_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: access_codes access_codes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY access_codes_delete ON public.access_codes FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids)));


--
-- Name: access_codes access_codes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY access_codes_select ON public.access_codes FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids)));


--
-- Name: access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: access_requests access_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY access_requests_select ON public.access_requests FOR SELECT TO authenticated USING (((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids)) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_delete ON public.accounts FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Account'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: accounts accounts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Account'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: accounts accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Account'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: accounts_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts_settings accounts_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_settings_select ON public.accounts_settings FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Accounts Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: accounts_settings accounts_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_settings_update ON public.accounts_settings FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Accounts Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Accounts Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: accounts accounts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Account'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Account'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: bins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;

--
-- Name: bins bins_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bins_select ON public.bins FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Bin'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: brands brands_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_delete ON public.brands FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Brand'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: brands brands_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_insert ON public.brands FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Brand'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: brands brands_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_select ON public.brands FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Brand'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: brands brands_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_update ON public.brands FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Brand'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Brand'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: cost_centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_centers cost_centers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_delete ON public.cost_centers FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Cost Center'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: cost_centers cost_centers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_insert ON public.cost_centers FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Cost Center'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: cost_centers cost_centers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_select ON public.cost_centers FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Cost Center'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: cost_centers cost_centers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_update ON public.cost_centers FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Cost Center'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Cost Center'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

--
-- Name: countries countries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY countries_select ON public.countries FOR SELECT TO authenticated USING (true);


--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies currencies_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_delete ON public.currencies FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Currency'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: currencies currencies_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_insert ON public.currencies FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Currency'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: currencies currencies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_select ON public.currencies FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Currency'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: currencies currencies_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_update ON public.currencies FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Currency'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Currency'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: currency_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currency_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: currency_presets currency_presets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currency_presets_select ON public.currency_presets FOR SELECT TO authenticated USING (true);


--
-- Name: doctypes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doctypes ENABLE ROW LEVEL SECURITY;

--
-- Name: doctypes doctypes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doctypes_select ON public.doctypes FOR SELECT TO authenticated USING (true);


--
-- Name: fiscal_years; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_years fiscal_years_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_years_delete ON public.fiscal_years FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Fiscal Year'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: fiscal_years fiscal_years_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_years_insert ON public.fiscal_years FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Fiscal Year'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: fiscal_years fiscal_years_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_years_select ON public.fiscal_years FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Fiscal Year'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: fiscal_years fiscal_years_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiscal_years_update ON public.fiscal_years FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Fiscal Year'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Fiscal Year'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: gl_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: gl_entries gl_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gl_entries_select ON public.gl_entries FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('GL Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: global_defaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: global_defaults global_defaults_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_defaults_select ON public.global_defaults FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Global Defaults'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: global_defaults global_defaults_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY global_defaults_update ON public.global_defaults FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Global Defaults'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Global Defaults'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_group_taxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_group_taxes ENABLE ROW LEVEL SECURITY;

--
-- Name: item_group_taxes item_group_taxes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_group_taxes_delete ON public.item_group_taxes FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_group_taxes item_group_taxes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_group_taxes_insert ON public.item_group_taxes FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_group_taxes item_group_taxes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_group_taxes_select ON public.item_group_taxes FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_group_taxes item_group_taxes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_group_taxes_update ON public.item_group_taxes FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: item_groups item_groups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_groups_delete ON public.item_groups FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: item_groups item_groups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_groups_insert ON public.item_groups FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: item_groups item_groups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_groups_select ON public.item_groups FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_groups item_groups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_groups_update ON public.item_groups FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Group'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: item_prices item_prices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_prices_delete ON public.item_prices FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Price'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: item_prices item_prices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_prices_insert ON public.item_prices FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Price'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: item_prices item_prices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_prices_select ON public.item_prices FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Price'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_prices item_prices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_prices_update ON public.item_prices FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Price'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Price'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_template_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_tax_template_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: item_tax_template_rows item_tax_template_rows_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_template_rows_delete ON public.item_tax_template_rows FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_template_rows item_tax_template_rows_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_template_rows_insert ON public.item_tax_template_rows FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_template_rows item_tax_template_rows_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_template_rows_select ON public.item_tax_template_rows FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_template_rows item_tax_template_rows_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_template_rows_update ON public.item_tax_template_rows FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_tax_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: item_tax_templates item_tax_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_templates_delete ON public.item_tax_templates FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_templates item_tax_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_templates_insert ON public.item_tax_templates FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_templates item_tax_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_templates_select ON public.item_tax_templates FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_tax_templates item_tax_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_tax_templates_update ON public.item_tax_templates FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item Tax Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_taxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_taxes ENABLE ROW LEVEL SECURITY;

--
-- Name: item_taxes item_taxes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_taxes_delete ON public.item_taxes FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_taxes item_taxes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_taxes_insert ON public.item_taxes FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_taxes item_taxes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_taxes_select ON public.item_taxes FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_taxes item_taxes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_taxes_update ON public.item_taxes FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_uoms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_uoms ENABLE ROW LEVEL SECURITY;

--
-- Name: item_uoms item_uoms_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_uoms_delete ON public.item_uoms FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_uoms item_uoms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_uoms_insert ON public.item_uoms FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: item_uoms item_uoms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_uoms_select ON public.item_uoms FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: item_uoms item_uoms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_uoms_update ON public.item_uoms FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

--
-- Name: items items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_delete ON public.items FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: items items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_insert ON public.items FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: items items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_select ON public.items FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: items items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_update ON public.items FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Item'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: letter_heads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.letter_heads ENABLE ROW LEVEL SECURITY;

--
-- Name: letter_heads letter_heads_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY letter_heads_delete ON public.letter_heads FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Letter Head'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: letter_heads letter_heads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY letter_heads_insert ON public.letter_heads FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Letter Head'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: letter_heads letter_heads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY letter_heads_select ON public.letter_heads FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Letter Head'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: letter_heads letter_heads_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY letter_heads_update ON public.letter_heads FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Letter Head'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Letter Head'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: member_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: member_overrides member_overrides_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_overrides_owner ON public.member_overrides TO authenticated USING ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids)));


--
-- Name: merchant_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_members merchant_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_delete ON public.merchant_members FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('User'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: merchant_members merchant_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_insert ON public.merchant_members FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('User'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: merchant_members merchant_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_select ON public.merchant_members FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('User'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: merchant_members merchant_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_update ON public.merchant_members FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('User'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('User'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: merchants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

--
-- Name: merchants merchants_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_delete_own ON public.merchants FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: merchants merchants_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_insert_own ON public.merchants FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));


--
-- Name: merchants merchants_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_select_own ON public.merchants FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = owner_id) OR (id IN ( SELECT private.current_merchant_ids() AS current_merchant_ids))));


--
-- Name: merchants merchants_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_update_own ON public.merchants FOR UPDATE TO authenticated USING ((id IN ( SELECT private.permitted_merchant_ids('Company'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((id IN ( SELECT private.permitted_merchant_ids('Company'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: modes_of_payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modes_of_payment ENABLE ROW LEVEL SECURITY;

--
-- Name: modes_of_payment modes_of_payment_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modes_of_payment_delete ON public.modes_of_payment FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Mode of Payment'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: modes_of_payment modes_of_payment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modes_of_payment_insert ON public.modes_of_payment FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Mode of Payment'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: modes_of_payment modes_of_payment_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modes_of_payment_select ON public.modes_of_payment FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Mode of Payment'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: modes_of_payment modes_of_payment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modes_of_payment_update ON public.modes_of_payment FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Mode of Payment'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Mode of Payment'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.naming_series ENABLE ROW LEVEL SECURITY;

--
-- Name: naming_series_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.naming_series_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: naming_series_counters naming_series_counters_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_counters_delete ON public.naming_series_counters FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series_counters naming_series_counters_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_counters_insert ON public.naming_series_counters FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series_counters naming_series_counters_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_counters_select ON public.naming_series_counters FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series_counters naming_series_counters_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_counters_update ON public.naming_series_counters FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series naming_series_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_select ON public.naming_series FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: naming_series naming_series_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY naming_series_update ON public.naming_series FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Document Naming Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: permission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_rules permission_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permission_rules_select ON public.permission_rules FOR SELECT TO authenticated USING (true);


--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);


--
-- Name: pos_closing_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_closing_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_closing_entries pos_closing_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entries_delete ON public.pos_closing_entries FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entries pos_closing_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entries_insert ON public.pos_closing_entries FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entries pos_closing_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entries_select ON public.pos_closing_entries FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entries pos_closing_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entries_update ON public.pos_closing_entries FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entry_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_closing_entry_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entry_payments_delete ON public.pos_closing_entry_payments FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entry_payments_insert ON public.pos_closing_entry_payments FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entry_payments_select ON public.pos_closing_entry_payments FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_closing_entry_payments pos_closing_entry_payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_closing_entry_payments_update ON public.pos_closing_entry_payments FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Closing Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_invoice_items pos_invoice_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_items_delete ON public.pos_invoice_items FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_items pos_invoice_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_items_insert ON public.pos_invoice_items FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_items pos_invoice_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_items_select ON public.pos_invoice_items FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_items pos_invoice_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_items_update ON public.pos_invoice_items FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_invoice_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_invoice_payments pos_invoice_payments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_payments_delete ON public.pos_invoice_payments FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_payments pos_invoice_payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_payments_insert ON public.pos_invoice_payments FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_payments pos_invoice_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_payments_select ON public.pos_invoice_payments FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_payments pos_invoice_payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_payments_update ON public.pos_invoice_payments FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_taxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_invoice_taxes ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_invoice_taxes pos_invoice_taxes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_taxes_delete ON public.pos_invoice_taxes FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_taxes pos_invoice_taxes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_taxes_insert ON public.pos_invoice_taxes FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_taxes pos_invoice_taxes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_taxes_select ON public.pos_invoice_taxes FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoice_taxes pos_invoice_taxes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoice_taxes_update ON public.pos_invoice_taxes FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_invoices pos_invoices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoices_delete ON public.pos_invoices FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoices pos_invoices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoices_insert ON public.pos_invoices FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoices pos_invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoices_select ON public.pos_invoices FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_invoices pos_invoices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_invoices_update ON public.pos_invoices FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Invoice'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_opening_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_opening_entries pos_opening_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entries_delete ON public.pos_opening_entries FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entries pos_opening_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entries_insert ON public.pos_opening_entries FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entries pos_opening_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entries_select ON public.pos_opening_entries FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entries pos_opening_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entries_update ON public.pos_opening_entries FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entry_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_opening_entry_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entry_balances_delete ON public.pos_opening_entry_balances FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entry_balances_insert ON public.pos_opening_entry_balances FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entry_balances_select ON public.pos_opening_entry_balances FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_opening_entry_balances pos_opening_entry_balances_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_opening_entry_balances_update ON public.pos_opening_entry_balances FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Opening Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_item_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_profile_item_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_profile_item_groups pos_profile_item_groups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_item_groups_delete ON public.pos_profile_item_groups FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_item_groups pos_profile_item_groups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_item_groups_insert ON public.pos_profile_item_groups FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_item_groups pos_profile_item_groups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_item_groups_select ON public.pos_profile_item_groups FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_item_groups pos_profile_item_groups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_item_groups_update ON public.pos_profile_item_groups FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_profile_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_profile_payments pos_profile_payments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_payments_delete ON public.pos_profile_payments FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_payments pos_profile_payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_payments_insert ON public.pos_profile_payments FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_payments pos_profile_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_payments_select ON public.pos_profile_payments FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_payments pos_profile_payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_payments_update ON public.pos_profile_payments FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_profile_users ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_profile_users pos_profile_users_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_users_delete ON public.pos_profile_users FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_users pos_profile_users_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_users_insert ON public.pos_profile_users FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_users pos_profile_users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_users_select ON public.pos_profile_users FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profile_users pos_profile_users_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profile_users_update ON public.pos_profile_users FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_profiles pos_profiles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profiles_delete ON public.pos_profiles FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profiles pos_profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profiles_insert ON public.pos_profiles FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profiles pos_profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profiles_select ON public.pos_profiles FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pos_profiles pos_profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_profiles_update ON public.pos_profiles FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('POS Profile'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: price_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: price_lists price_lists_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_lists_delete ON public.price_lists FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Price List'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: price_lists price_lists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_lists_insert ON public.price_lists FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Price List'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: price_lists price_lists_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_lists_select ON public.price_lists FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Price List'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: price_lists price_lists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_lists_update ON public.price_lists FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Price List'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Price List'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rule_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rule_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rule_targets pricing_rule_targets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rule_targets_delete ON public.pricing_rule_targets FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rule_targets pricing_rule_targets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rule_targets_insert ON public.pricing_rule_targets FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rule_targets pricing_rule_targets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rule_targets_select ON public.pricing_rule_targets FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rule_targets pricing_rule_targets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rule_targets_update ON public.pricing_rule_targets FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules pricing_rules_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rules_delete ON public.pricing_rules FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rules pricing_rules_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rules_insert ON public.pricing_rules FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rules pricing_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rules_select ON public.pricing_rules FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: pricing_rules pricing_rules_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_rules_update ON public.pricing_rules FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Pricing Rule'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: print_formats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.print_formats ENABLE ROW LEVEL SECURITY;

--
-- Name: print_formats print_formats_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_formats_delete ON public.print_formats FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Format'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: print_formats print_formats_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_formats_insert ON public.print_formats FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Format'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: print_formats print_formats_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_formats_select ON public.print_formats FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Format'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: print_formats print_formats_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_formats_update ON public.print_formats FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Format'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Format'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: print_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: print_settings print_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_settings_select ON public.print_settings FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: print_settings print_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_settings_update ON public.print_settings FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Print Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: role_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: role_grants role_grants_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_grants_owner ON public.role_grants TO authenticated USING ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.owned_merchant_ids() AS owned_merchant_ids)));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_delete ON public.roles FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Role'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: roles roles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_insert ON public.roles FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Role'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: roles roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Role'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: roles roles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_update ON public.roles FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Role'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Role'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_template_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_tax_template_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_tax_template_rows sales_tax_template_rows_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_template_rows_delete ON public.sales_tax_template_rows FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_template_rows sales_tax_template_rows_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_template_rows_insert ON public.sales_tax_template_rows FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_template_rows sales_tax_template_rows_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_template_rows_select ON public.sales_tax_template_rows FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_template_rows sales_tax_template_rows_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_template_rows_update ON public.sales_tax_template_rows FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_tax_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_tax_templates sales_tax_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_templates_delete ON public.sales_tax_templates FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_templates sales_tax_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_templates_insert ON public.sales_tax_templates FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_templates sales_tax_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_templates_select ON public.sales_tax_templates FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: sales_tax_templates sales_tax_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_tax_templates_update ON public.sales_tax_templates FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Sales Taxes and Charges Template'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: selling_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.selling_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: selling_settings selling_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY selling_settings_select ON public.selling_settings FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Selling Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: selling_settings selling_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY selling_settings_update ON public.selling_settings FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Selling Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Selling Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_entries stock_entries_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entries_delete ON public.stock_entries FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entries stock_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entries_insert ON public.stock_entries FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entries stock_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entries_select ON public.stock_entries FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entries stock_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entries_update ON public.stock_entries FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entry_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_entry_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_entry_items stock_entry_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entry_items_delete ON public.stock_entry_items FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entry_items stock_entry_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entry_items_insert ON public.stock_entry_items FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entry_items stock_entry_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entry_items_select ON public.stock_entry_items FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_entry_items stock_entry_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_entry_items_update ON public.stock_entry_items FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Entry'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_ledger_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_ledger_entries stock_ledger_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_ledger_entries_select ON public.stock_ledger_entries FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Ledger Entry'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliation_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_reconciliation_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_reconciliation_items stock_reconciliation_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliation_items_delete ON public.stock_reconciliation_items FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliation_items stock_reconciliation_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliation_items_insert ON public.stock_reconciliation_items FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliation_items stock_reconciliation_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliation_items_select ON public.stock_reconciliation_items FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliation_items stock_reconciliation_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliation_items_update ON public.stock_reconciliation_items FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_reconciliations stock_reconciliations_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliations_delete ON public.stock_reconciliations FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliations stock_reconciliations_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliations_insert ON public.stock_reconciliations FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliations stock_reconciliations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliations_select ON public.stock_reconciliations FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_reconciliations stock_reconciliations_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_reconciliations_update ON public.stock_reconciliations FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Reconciliation'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: stock_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_settings stock_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_settings_select ON public.stock_settings FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: stock_settings stock_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_settings_update ON public.stock_settings FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Stock Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings system_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_settings_select ON public.system_settings FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('System Settings'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: system_settings system_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_settings_update ON public.system_settings FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('System Settings'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('System Settings'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: tax_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_categories tax_categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_categories_delete ON public.tax_categories FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Category'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: tax_categories tax_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_categories_insert ON public.tax_categories FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Category'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: tax_categories tax_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_categories_select ON public.tax_categories FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Category'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: tax_categories tax_categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_categories_update ON public.tax_categories FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Category'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Category'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: tax_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_presets tax_presets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_presets_select ON public.tax_presets FOR SELECT TO authenticated USING (true);


--
-- Name: tax_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_rules tax_rules_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_rules_delete ON public.tax_rules FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Rule'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: tax_rules tax_rules_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_rules_insert ON public.tax_rules FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Rule'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: tax_rules tax_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_rules_select ON public.tax_rules FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Rule'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: tax_rules tax_rules_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_rules_update ON public.tax_rules FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Rule'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Tax Rule'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: uom_conversion_factors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uom_conversion_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: uom_conversion_factors uom_conversion_factors_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_conversion_factors_delete ON public.uom_conversion_factors FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM Conversion Factor'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: uom_conversion_factors uom_conversion_factors_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_conversion_factors_insert ON public.uom_conversion_factors FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM Conversion Factor'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: uom_conversion_factors uom_conversion_factors_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_conversion_factors_select ON public.uom_conversion_factors FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM Conversion Factor'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: uom_conversion_factors uom_conversion_factors_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_conversion_factors_update ON public.uom_conversion_factors FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM Conversion Factor'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM Conversion Factor'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: uoms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uoms ENABLE ROW LEVEL SECURITY;

--
-- Name: uoms uoms_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uoms_delete ON public.uoms FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: uoms uoms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uoms_insert ON public.uoms FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: uoms uoms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uoms_select ON public.uoms FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: uoms uoms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uoms_update ON public.uoms FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('UOM'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_delete ON public.warehouses FOR DELETE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Warehouse'::text, 'delete'::text) AS permitted_merchant_ids)));


--
-- Name: warehouses warehouses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_insert ON public.warehouses FOR INSERT TO authenticated WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Warehouse'::text, 'create'::text) AS permitted_merchant_ids)));


--
-- Name: warehouses warehouses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_select ON public.warehouses FOR SELECT TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Warehouse'::text, 'select'::text) AS permitted_merchant_ids)));


--
-- Name: warehouses warehouses_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_update ON public.warehouses FOR UPDATE TO authenticated USING ((merchant_id IN ( SELECT private.permitted_merchant_ids('Warehouse'::text, 'write'::text) AS permitted_merchant_ids))) WITH CHECK ((merchant_id IN ( SELECT private.permitted_merchant_ids('Warehouse'::text, 'write'::text) AS permitted_merchant_ids)));


--
-- PostgreSQL database dump complete
--

\unrestrict Ma1CgezS4yeK89OHuWjI1EVjVSeKybdv4OTecbny9IEYQbUq6cDBgiFq3mAHwyR

