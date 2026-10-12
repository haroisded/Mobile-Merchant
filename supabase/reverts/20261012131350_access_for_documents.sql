-- Revert of supabase/migrations/20261012131350_access_for_documents.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- Destroys no row of a system. It drops public.doctype_links (reference data a migration wrote), and a User
-- Permission goes back to restricting only its own doctype's records: documents, ledgers, Items and POS
-- Profiles are no longer filtered by the Warehouse, Item Group, Account or Cost Center they link to.
-- A User Permission saved since with an Applicable For other than its Allow stays, and filters nothing.
-- Regenerate src/lib/database.types.ts afterwards — the User Permission form reads doctype_links.

-- 1. The one-argument questions, as 20261008145056_users_and_access.sql made them.
-- The systems where a User Permission restricts the caller on `doctype`. The owner has no member row, so
-- is never in it.
create or replace function private.restricted_merchant_ids(p_doctype text)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct mm.merchant_id
  from public.user_permissions up
  join public.merchant_members mm on mm.id = up.member_id
  where mm.user_id = (select auth.uid())
    and mm.enabled
    and up.allow = p_doctype
    and (up.apply_to_all_doctypes or up.applicable_for = p_doctype);
$$;

revoke execute on function private.restricted_merchant_ids(text) from public, anon, authenticated, service_role;
grant execute on function private.restricted_merchant_ids(text) to authenticated;

-- The records of `doctype` the caller's User Permissions allow: each For Value, and on a tree doctype its
-- descendants too unless Hide Descendants is on. The table name comes from the registry, quoted with %I.
create or replace function private.allowed_record_ids(p_doctype text)
returns setof uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_table text;
  v_kind text;
begin
  select d.table_name, d.kind into v_table, v_kind from public.doctypes d where d.name = p_doctype;

  if v_kind = 'tree' then
    return query execute format(
      'with recursive granted as (
         select up.for_value, up.hide_descendants
         from public.user_permissions up
         join public.merchant_members mm on mm.id = up.member_id
         where mm.user_id = $1 and mm.enabled and up.allow = $2
           and (up.apply_to_all_doctypes or up.applicable_for = $2)
       ),
       descendants (id) as (
         select g.for_value from granted g where not g.hide_descendants
         union
         select c.id from public.%I c join descendants d on c.parent_id = d.id
       )
       select g.for_value from granted g
       union
       select d.id from descendants d',
      v_table
    ) using (select auth.uid()), p_doctype;
  else
    return query
      select up.for_value
      from public.user_permissions up
      join public.merchant_members mm on mm.id = up.member_id
      where mm.user_id = (select auth.uid()) and mm.enabled and up.allow = p_doctype
        and (up.apply_to_all_doctypes or up.applicable_for = p_doctype);
  end if;
end;
$$;

revoke execute on function private.allowed_record_ids(text) from public, anon, authenticated, service_role;
grant execute on function private.allowed_record_ids(text) to authenticated;


-- 2. The policy helper as 20261011165554_ledgers.sql made it: no links, and a document's rows follow only
-- the doctype's permission.
-- The policy helper (20261008145056_users_and_access.sql), with the two kinds.
-- ledger: a select policy and nothing else — only the engine writes it.
-- document: the record's four policies, and the draft-only guard on the table and on each of its rows'
-- tables (found by the row table's foreign key to the document).
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent text;
  v_restrictable boolean;
  v_restrict text := '';
  v_cmd text;
  v_key text;
begin
  select d.kind, d.restrictable, d.table_name into v_kind, v_restrictable, v_parent from public.doctypes d where d.name = p_doctype;
  if v_kind is null then
    raise exception 'unknown doctype %', p_doctype;
  end if;

  foreach v_cmd in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table || '_' || v_cmd, p_table);
  end loop;

  if v_restrictable and not p_child then
    v_restrict := format(
      ' and (merchant_id not in (select private.restricted_merchant_ids(%L)) or id in (select private.allowed_record_ids(%L)))',
      p_doctype, p_doctype
    );
  end if;

  execute format(
    'create policy %I on public.%I for select to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_select', p_table, p_doctype, case when p_child then 'read' else 'select' end, v_restrict
  );

  if v_kind = 'ledger' then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for update to authenticated
       using (merchant_id in (select private.permitted_merchant_ids(%L, ''write''))%s)
       with check (merchant_id in (select private.permitted_merchant_ids(%L, ''write''))%s)',
    p_table || '_update', p_table, p_doctype, v_restrict, p_doctype, v_restrict
  );

  if v_kind = 'single' and not p_child then
    return;
  end if;

  execute format(
    'create policy %I on public.%I for insert to authenticated with check (merchant_id in (select private.permitted_merchant_ids(%L, %L)))',
    p_table || '_insert', p_table, p_doctype, case when p_child then 'write' else 'create' end
  );

  execute format(
    'create policy %I on public.%I for delete to authenticated using (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_delete', p_table, p_doctype, case when p_child then 'write' else 'delete' end, v_restrict
  );

  if v_kind <> 'document' then
    return;
  end if;

  execute format('drop trigger if exists %I on public.%I', p_table || '_docstatus', p_table);

  if not p_child then
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus()',
      p_table || '_docstatus', p_table
    );
    return;
  end if;

  select a.attname into v_key
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f'
    and c.conrelid = format('public.%I', p_table)::regclass
    and c.confrelid = format('public.%I', v_parent)::regclass
    and a.attname <> 'merchant_id';

  if v_key is null then
    raise exception '% has no foreign key to %', p_table, v_parent;
  end if;

  execute format(
    'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus_child(%L, %L)',
    p_table || '_docstatus', p_table, v_parent, v_key
  );
end;
$$;

-- The same tables, back on the policies that name the one-argument functions.
select private.apply_doctype_policies('accounts', 'Account');
select private.apply_doctype_policies('cost_centers', 'Cost Center');
select private.apply_doctype_policies('fiscal_years', 'Fiscal Year');
select private.apply_doctype_policies('item_groups', 'Item Group');
select private.apply_doctype_policies('warehouses', 'Warehouse');

select private.apply_doctype_policies('gl_entries', 'GL Entry');
select private.apply_doctype_policies('stock_ledger_entries', 'Stock Ledger Entry');
select private.apply_doctype_policies('bins', 'Bin');
select private.apply_doctype_policies('stock_entries', 'Stock Entry');
select private.apply_doctype_policies('stock_entry_items', 'Stock Entry', true);
select private.apply_doctype_policies('pos_invoices', 'POS Invoice');
select private.apply_doctype_policies('pos_invoice_items', 'POS Invoice', true);
select private.apply_doctype_policies('pos_invoice_taxes', 'POS Invoice', true);
select private.apply_doctype_policies('pos_invoice_payments', 'POS Invoice', true);
select private.apply_doctype_policies('pos_profiles', 'POS Profile');
select private.apply_doctype_policies('pos_profile_users', 'POS Profile', true);
select private.apply_doctype_policies('pos_profile_payments', 'POS Profile', true);
select private.apply_doctype_policies('pos_profile_item_groups', 'POS Profile', true);
select private.apply_doctype_policies('items', 'Item');
select private.apply_doctype_policies('item_uoms', 'Item', true);
select private.apply_doctype_policies('item_taxes', 'Item', true);


-- 3. A User Permission's check as 20261008145056_users_and_access.sql made it: any doctype as Applicable For.
-- A User Permission names a restrictable doctype and a record of it that exists in the same system.
-- Security definer: the check reads the doctype's table whatever the caller may see in it.
create or replace function private.validate_user_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_kind text;
  v_restrictable boolean;
  v_exists boolean;
begin
  select d.table_name, d.kind, d.restrictable into v_table, v_kind, v_restrictable
  from public.doctypes d where d.name = new.allow;

  if not coalesce(v_restrictable, false) then
    raise exception 'not_restrictable' using errcode = '23514', detail = format('%s cannot be restricted by a User Permission.', new.allow);
  end if;

  execute format('select exists (select 1 from public.%I where id = $1 and merchant_id = $2)', v_table)
    into v_exists using new.for_value, new.merchant_id;
  if not v_exists then
    raise exception 'for_value_missing' using errcode = '23503', detail = format('No %s with that id in this system.', new.allow);
  end if;

  if v_kind <> 'tree' then
    new.hide_descendants := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_user_permission() from public, anon, authenticated, service_role;


-- 4. Nothing names these any more.
drop function if exists private.restricted_merchant_ids(text, text);
drop function if exists private.allowed_record_ids(text, text);

drop policy if exists doctype_links_select on public.doctype_links;
drop table if exists public.doctype_links;
