-- Revert of supabase/migrations/20261011165554_ledgers.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6): the stock documents' revert comes before this one.
--
-- DESTROYS DATA: EVERY GENERAL LEDGER ENTRY, STOCK LEDGER ENTRY AND STOCK BALANCE OF EVERY SYSTEM, and the
-- Submit and Cancel permissions in every system's Role Permissions Manager. Regenerate
-- src/lib/database.types.ts afterwards — the Accounts and Stock screens read these tables.

drop function if exists public.cancel_document(text, uuid);
drop function if exists public.submit_document(text, uuid);

drop function if exists private.cancel_sle(uuid, text, uuid);
drop function if exists private.reverse_sle(bigint, date);
drop function if exists private.reconcile_sle(uuid, text, uuid, text, date, uuid, uuid, numeric, numeric);
drop function if exists private.post_sle(uuid, text, uuid, text, date, uuid, uuid, numeric, numeric);
drop function if exists private.write_sle(public.bins, text, uuid, text, date, numeric, numeric, numeric, numeric, jsonb, boolean);
drop function if exists private.lock_bin(uuid, uuid, uuid, date, boolean);
drop function if exists private.warehouse_account(uuid);
drop function if exists private.cancel_gl(uuid, text, uuid);
drop function if exists private.post_gl(uuid, text, uuid, text, date, jsonb, text);
drop function if exists private.assert_postable(uuid, date);
drop function if exists private.merchant_today(uuid);
drop function if exists private.currency_round(uuid, numeric);
drop function if exists private.money_round(numeric, integer, text);

-- Policies and indexes go with the tables.
drop table if exists public.bins;
drop table if exists public.stock_ledger_entries;
drop table if exists public.gl_entries;

-- Cascades to the standard_role_permissions and role_permissions rows naming them.
delete from public.doctypes where name in ('GL Entry', 'Stock Ledger Entry', 'Bin');

-- private.apply_doctype_policies() as 20261008145056_users_and_access.sql made it: record, single and tree.
create or replace function private.apply_doctype_policies(p_table text, p_doctype text, p_child boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_restrictable boolean;
  v_restrict text := '';
  v_cmd text;
begin
  select d.kind, d.restrictable into v_kind, v_restrictable from public.doctypes d where d.name = p_doctype;
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
end;
$$;

drop function if exists private.name_document();
drop function if exists private.guard_docstatus_child();
drop function if exists private.guard_docstatus();

-- Fails on purpose while a document or ledger doctype is still registered: revert the migrations that
-- registered them first.
alter table public.doctypes drop constraint if exists doctypes_kind;
alter table public.doctypes add constraint doctypes_kind check (kind in ('record', 'single', 'tree'));

-- The four functions that read the matrix, as 20261008145056_users_and_access.sql made them.
create or replace function private.sync_standard_permissions(p_merchant uuid default null)
returns void
language sql
set search_path = ''
as $$
  insert into public.role_permissions (merchant_id, role_id, doctype, can_select, can_read, can_write, can_create, can_delete)
  select r.merchant_id, r.id, s.doctype, s.can_select, s.can_read, s.can_write, s.can_create, s.can_delete
  from public.standard_role_permissions s
  join public.roles r on r.role_name = s.role_name and r.is_standard
  where p_merchant is null or r.merchant_id = p_merchant
  on conflict (role_id, doctype) do nothing;
$$;

create or replace function public.save_role_permissions(p_merchant uuid, p_doctype text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.role_permissions rp
  where rp.merchant_id = p_merchant and rp.doctype = p_doctype
    and rp.role_id not in (
      select (r.value ->> 'role_id')::uuid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r (value)
    );

  insert into public.role_permissions (merchant_id, role_id, doctype, can_select, can_read, can_write, can_create, can_delete)
  select p_merchant, (r.value ->> 'role_id')::uuid, p_doctype,
    coalesce((r.value ->> 'can_select')::boolean, false),
    coalesce((r.value ->> 'can_read')::boolean, false),
    coalesce((r.value ->> 'can_write')::boolean, false),
    coalesce((r.value ->> 'can_create')::boolean, false),
    coalesce((r.value ->> 'can_delete')::boolean, false)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r (value)
  on conflict (role_id, doctype) do update set
    can_select = excluded.can_select,
    can_read = excluded.can_read,
    can_write = excluded.can_write,
    can_create = excluded.can_create,
    can_delete = excluded.can_delete;
end;
$$;

create or replace function public.my_permissions(p_merchant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_owner_email text;
  v_owner_name text;
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
    select jsonb_object_agg(d.name, jsonb_build_object('select', true, 'read', true, 'write', true, 'create', true, 'delete', true))
    into v_perms from public.doctypes d;
  elsif exists (select 1 from public.merchant_members mm where mm.merchant_id = p_merchant and mm.user_id = v_uid and mm.enabled) then
    select coalesce(jsonb_object_agg(x.doctype, jsonb_build_object(
      'select', x.can_select, 'read', x.can_read, 'write', x.can_write, 'create', x.can_create, 'delete', x.can_delete
    )), '{}'::jsonb)
    into v_perms
    from (
      select rp.doctype,
        bool_or(rp.can_select or rp.can_read) as can_select,
        bool_or(rp.can_read) as can_read,
        bool_or(rp.can_write) as can_write,
        bool_or(rp.can_create) as can_create,
        bool_or(rp.can_delete) as can_delete
      from private.effective_role_ids() e
      join public.role_permissions rp on rp.role_id = e.role_id
      where e.merchant_id = p_merchant
      group by rp.doctype
    ) x;
  else
    return null;
  end if;

  return jsonb_build_object(
    'is_owner', v_owner = v_uid,
    'owner_email', v_owner_email,
    'owner_name', v_owner_name,
    'perms', v_perms
  );
end;
$$;

create or replace function private.permitted_merchant_ids(p_doctype text, p_ptype text)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select e.merchant_id
  from private.effective_role_ids() e
  join public.role_permissions rp on rp.role_id = e.role_id and rp.doctype = p_doctype
  where case p_ptype
    when 'select' then rp.can_select or rp.can_read
    when 'read' then rp.can_read
    when 'write' then rp.can_write
    when 'create' then rp.can_create
    when 'delete' then rp.can_delete
    else false
  end;
$$;

alter table public.role_permissions
  drop column if exists can_cancel,
  drop column if exists can_submit;

alter table public.standard_role_permissions
  drop column if exists can_cancel,
  drop column if exists can_submit;
