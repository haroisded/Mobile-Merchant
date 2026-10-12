-- Step 21 of the POS system, on ERPNext's model: Access for the New Documents
-- (.claude/erpnext-docs/POS-System-Added-Features.md 21.1–21.2; docs.frappe.io/erpnext/user-permissions,
-- /role-based-permissions).
--
-- 21.1 was laid with each step: every document type of Steps 13–20 has its rules, with Submit and Cancel
-- (20261011165554_ledgers.sql). Nothing here changes a rule.
--
-- 21.2 is this file. A User Permission holds a person to one record of a restrictable doctype — a Warehouse,
-- an Item Group, an Account, a Cost Center. Until now that filtered the master itself and nothing else. The
-- docs: "User Permissions can be used to restrict access to select documents based on the link fields in the
-- document", and Applicable For makes one "applicable only under the selected Document Type". So:
--
-- 1. public.doctype_links: which document types link to a restrictable doctype, and through which column.
-- 2. private.restricted_merchant_ids() and private.allowed_record_ids() take the document type the question
--    is asked for, so Apply To All Document Types and Applicable For both answer.
-- 3. private.apply_doctype_policies() writes the link into every policy of a linking table, and holds a
--    linking document's rows to the documents the person may see.
-- 4. A User Permission's Applicable For must be a document type that links to its Allow.
--
-- The human's decision of 2026-10-12: documents and ledgers follow their own link, and so do the two records
-- that belong to one — an Item to its Item Group, a POS Profile to its Warehouse. A default on a master (an
-- Item's Default Warehouse, a Tax Rule's Item Group, the Company's accounts) restricts nothing — ERPNext's
-- "Ignore User Permissions" on a field — or a cashier held to one warehouse would lose the prices and taxes
-- the Register needs.
--
-- Known ceilings (ponytail): a Stock Reconciliation names its warehouses on its rows, so it follows no link
-- (only a Stock Manager holds it); and the rows of a restrictable master (an Item Group's Item Tax rows) stay
-- readable by whoever may read the doctype, as Step 11 left them.
-- Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. The links. Global and read-only, like public.doctypes: only a migration writes it.

create table if not exists public.doctype_links (
  -- The document type whose rows are restricted,
  doctype text not null references public.doctypes (name) on delete cascade,
  -- the restrictable doctype one of its fields links to,
  link_doctype text not null references public.doctypes (name) on delete cascade,
  -- and that field: a column of the doctype's table.
  column_name text not null,

  primary key (doctype, column_name)
);

alter table public.doctype_links enable row level security;
create index if not exists doctype_links_link_doctype_idx on public.doctype_links (link_doctype);

drop policy if exists doctype_links_select on public.doctype_links;
create policy doctype_links_select on public.doctype_links
  for select to authenticated
  using (true);

insert into public.doctype_links (doctype, link_doctype, column_name)
values
  ('GL Entry', 'Account', 'account_id'),
  ('GL Entry', 'Cost Center', 'cost_center_id'),
  ('Stock Ledger Entry', 'Warehouse', 'warehouse_id'),
  ('Bin', 'Warehouse', 'warehouse_id'),
  ('Stock Entry', 'Warehouse', 'from_warehouse'),
  ('Stock Entry', 'Warehouse', 'to_warehouse'),
  ('POS Invoice', 'Warehouse', 'warehouse'),
  ('POS Profile', 'Warehouse', 'warehouse'),
  ('Item', 'Item Group', 'item_group_id')
on conflict (doctype, column_name) do nothing;


-- 2. The two questions a policy asks, now for one document type: `p_allow` is the restrictable doctype,
-- `p_applicable` the document type being read — the same doctype for the master itself. A User Permission
-- answers when it applies to all document types, or names that one as Applicable For.

-- The systems where a User Permission on `p_allow` restricts the caller under `p_applicable`. The owner has
-- no member row, so is never in it.
create or replace function private.restricted_merchant_ids(p_allow text, p_applicable text)
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
    and up.allow = p_allow
    and (up.apply_to_all_doctypes or up.applicable_for = p_applicable);
$$;

revoke execute on function private.restricted_merchant_ids(text, text) from public, anon, authenticated, service_role;
grant execute on function private.restricted_merchant_ids(text, text) to authenticated;

-- The records of `p_allow` those User Permissions allow: each For Value, and on a tree doctype its
-- descendants too unless Hide Descendants is on. The table name comes from the registry, quoted with %I.
create or replace function private.allowed_record_ids(p_allow text, p_applicable text)
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
  select d.table_name, d.kind into v_table, v_kind from public.doctypes d where d.name = p_allow;

  if v_kind = 'tree' then
    return query execute format(
      'with recursive granted as (
         select up.for_value, up.hide_descendants
         from public.user_permissions up
         join public.merchant_members mm on mm.id = up.member_id
         where mm.user_id = $1 and mm.enabled and up.allow = $2
           and (up.apply_to_all_doctypes or up.applicable_for = $3)
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
    ) using (select auth.uid()), p_allow, p_applicable;
  else
    return query
      select up.for_value
      from public.user_permissions up
      join public.merchant_members mm on mm.id = up.member_id
      where mm.user_id = (select auth.uid()) and mm.enabled and up.allow = p_allow
        and (up.apply_to_all_doctypes or up.applicable_for = p_applicable);
  end if;
end;
$$;

revoke execute on function private.allowed_record_ids(text, text) from public, anon, authenticated, service_role;
grant execute on function private.allowed_record_ids(text, text) to authenticated;


-- 3. The policy helper (20261011165554_ledgers.sql), with the links.
-- A restrictable master: the person's allowed records of it, as before.
-- A linking table: for each link column, the system is not one where the person is restricted on the linked
--   doctype under this document type, or the column is empty, or it holds an allowed record. On insert too —
--   a person held to one warehouse cannot write a document for another.
-- A linking document's rows: only those of a document the person may see. The parent's own policies answer
--   the `exists`, so a row never outlives its document's visibility.
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_parent text;
  v_restrictable boolean;
  -- What limits the rows a person may see or change, and the part of it a new row can be held to.
  v_restrict text := '';
  v_check text := '';
  v_cmd text;
  v_key text;
  v_link record;
begin
  select d.kind, d.restrictable, d.table_name into v_kind, v_restrictable, v_parent from public.doctypes d where d.name = p_doctype;
  if v_kind is null then
    raise exception 'unknown doctype %', p_doctype;
  end if;

  foreach v_cmd in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', p_table || '_' || v_cmd, p_table);
  end loop;

  if p_child then
    -- This table's key to its document: the column of its foreign key to the doctype's table.
    select a.attname into v_key
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid = format('public.%I', p_table)::regclass
      and c.confrelid = format('public.%I', v_parent)::regclass
      and a.attname <> 'merchant_id';

    if exists (select 1 from public.doctype_links l where l.doctype = p_doctype) then
      if v_key is null then
        raise exception '% has no foreign key to %', p_table, v_parent;
      end if;
      v_check := format(' and exists (select 1 from public.%I p where p.id = %I.%I)', v_parent, p_table, v_key);
      v_restrict := v_check;
    end if;
  else
    for v_link in
      select l.link_doctype, l.column_name from public.doctype_links l where l.doctype = p_doctype order by l.column_name
    loop
      v_check := v_check || format(
        ' and (merchant_id not in (select private.restricted_merchant_ids(%L, %L)) or %I is null or %I in (select private.allowed_record_ids(%L, %L)))',
        v_link.link_doctype, p_doctype, v_link.column_name, v_link.column_name, v_link.link_doctype, p_doctype
      );
    end loop;

    if v_restrictable then
      v_restrict := format(
        ' and (merchant_id not in (select private.restricted_merchant_ids(%L, %L)) or id in (select private.allowed_record_ids(%L, %L)))',
        p_doctype, p_doctype, p_doctype, p_doctype
      );
    end if;
    v_restrict := v_restrict || v_check;
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
    'create policy %I on public.%I for insert to authenticated with check (merchant_id in (select private.permitted_merchant_ids(%L, %L))%s)',
    p_table || '_insert', p_table, p_doctype, case when p_child then 'write' else 'create' end, v_check
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

  if v_key is null then
    raise exception '% has no foreign key to %', p_table, v_parent;
  end if;

  execute format(
    'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_docstatus_child(%L, %L)',
    p_table || '_docstatus', p_table, v_parent, v_key
  );
end;
$$;

-- Every table whose policies change: the five restrictable masters (their policies named the one-argument
-- functions dropped below), the linking tables, and the rows of the linking documents and records.
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

-- No policy names them any more.
drop function if exists private.restricted_merchant_ids(text);
drop function if exists private.allowed_record_ids(text);


-- 4. A User Permission names a restrictable doctype and a record of it that exists in the same system
-- (20261008145056_users_and_access.sql) — and, when it is not for all document types, an Applicable For
-- that can follow it: the doctype itself, or a document type that links to it.
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

  if new.applicable_for is not null and new.applicable_for <> new.allow
    and not exists (select 1 from public.doctype_links l where l.doctype = new.applicable_for and l.link_doctype = new.allow) then
    raise exception 'not_applicable' using errcode = '23514', detail = format('%s does not link to a %s.', new.applicable_for, new.allow);
  end if;

  if v_kind <> 'tree' then
    new.hide_descendants := false;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_user_permission() from public, anon, authenticated, service_role;
