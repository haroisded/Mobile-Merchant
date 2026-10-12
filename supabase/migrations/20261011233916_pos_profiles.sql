-- Step 17 of the POS batch, on ERPNext's model: the POS Profile — one register's settings
-- (.claude/erpnext-docs/POS-System-Added-Features.md 17.1–17.3; docs.frappe.io/erpnext/pos-profile).
--
-- 1. pos_profiles: the warehouse a register sells from, its price list, taxes and charges, tax category,
--    print format and letter head (17.1); the accounts that win over an item's and the Company's (17.2);
--    the four switches of the Configurations section (17.3).
-- 2. pos_profile_users: Applicable for Users — with one listed, nobody else may use the profile; a member's
--    default profile. pos_profile_payments: the modes offered at checkout, the default one, Allow in Returns.
--    pos_profile_item_groups: the item groups the register lists.
-- 3. private.validate_pos_profile(): each link an enabled record of the kind its field takes.
--    private.validate_pos_profile_payments(): at least one payment method, exactly one default, each mode
--    enabled with a default account — deferred, so a save that replaces the rows is checked once.
-- 4. public.save_pos_profile(): the profile and its three child tables in one transaction.
-- 5. The doctype, its permissions and policies. No seed: ERPNext makes no POS Profile.
--
-- Out of scope, so absent: Company and Currency (a system is one company in one currency), Customer and
-- Customer Group, Print Heading and Terms, Hide Images, Automatically Add Filtered Item To Cart, Validate
-- Stock on Save, Allow Partial Payment, Action on New Invoice. Apply Discount On, Allow User to Edit Discount,
-- Ignore Pricing Rule and the Discount Account arrive with Step 20. Re-runnable, like the rest of
-- supabase/migrations.

create schema if not exists private;


-- 1. The profile. Every link is a composite foreign key, NO ACTION: deleting a record a profile still names
-- fails with 23503 ("in use"), and deleting a system takes its profiles in one statement.

create table if not exists public.pos_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_profile_name text not null,
  disabled boolean not null default false,
  -- "If both Item and POS Profile define a Warehouse, the POS profile warehouse gets priority."
  warehouse uuid not null,
  -- Empty: Selling Settings' Default Price List.
  selling_price_list uuid,
  -- Empty: a Tax Rule, else the default template, decides.
  taxes_and_charges uuid,
  tax_category uuid,
  -- Empty: the default print format, and the default letter head.
  print_format uuid,
  letter_head uuid,
  -- 17.2. Empty: the item's, its group's, its brand's, then the Company's.
  account_for_change_amount uuid,
  write_off_account uuid,
  write_off_cost_center uuid,
  -- The biggest shortfall a sale may leave unpaid and written off.
  write_off_limit numeric not null default 0,
  income_account uuid,
  expense_account uuid,
  cost_center uuid,
  -- 17.3.
  hide_unavailable_items boolean not null default false,
  allow_rate_change boolean not null default false,
  set_grand_total_to_default_mop boolean not null default true,
  print_receipt_on_order_complete boolean not null default false,
  created_at timestamptz not null default now(),

  constraint pos_profiles_id_merchant unique (id, merchant_id),
  constraint pos_profiles_name_unique unique (merchant_id, pos_profile_name),
  constraint pos_profiles_name_length check (length(btrim(pos_profile_name)) between 1 and 140),
  constraint pos_profiles_write_off_limit check (write_off_limit >= 0),
  constraint pos_profiles_warehouse_fk foreign key (warehouse, merchant_id) references public.warehouses (id, merchant_id),
  constraint pos_profiles_price_list_fk foreign key (selling_price_list, merchant_id) references public.price_lists (id, merchant_id),
  constraint pos_profiles_template_fk foreign key (taxes_and_charges, merchant_id) references public.sales_tax_templates (id, merchant_id),
  constraint pos_profiles_tax_category_fk foreign key (tax_category, merchant_id) references public.tax_categories (id, merchant_id),
  constraint pos_profiles_print_format_fk foreign key (print_format, merchant_id) references public.print_formats (id, merchant_id),
  constraint pos_profiles_letter_head_fk foreign key (letter_head, merchant_id) references public.letter_heads (id, merchant_id),
  constraint pos_profiles_change_account_fk foreign key (account_for_change_amount, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_profiles_write_off_account_fk foreign key (write_off_account, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_profiles_write_off_cost_center_fk foreign key (write_off_cost_center, merchant_id) references public.cost_centers (id, merchant_id),
  constraint pos_profiles_income_account_fk foreign key (income_account, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_profiles_expense_account_fk foreign key (expense_account, merchant_id) references public.accounts (id, merchant_id),
  constraint pos_profiles_cost_center_fk foreign key (cost_center, merchant_id) references public.cost_centers (id, merchant_id)
);

alter table public.pos_profiles enable row level security;
create index if not exists pos_profiles_warehouse_idx on public.pos_profiles (warehouse, merchant_id);
create index if not exists pos_profiles_price_list_idx on public.pos_profiles (selling_price_list, merchant_id);
create index if not exists pos_profiles_template_idx on public.pos_profiles (taxes_and_charges, merchant_id);
create index if not exists pos_profiles_tax_category_idx on public.pos_profiles (tax_category, merchant_id);
create index if not exists pos_profiles_print_format_idx on public.pos_profiles (print_format, merchant_id);
create index if not exists pos_profiles_letter_head_idx on public.pos_profiles (letter_head, merchant_id);
create index if not exists pos_profiles_change_account_idx on public.pos_profiles (account_for_change_amount, merchant_id);
create index if not exists pos_profiles_write_off_account_idx on public.pos_profiles (write_off_account, merchant_id);
create index if not exists pos_profiles_write_off_cost_center_idx on public.pos_profiles (write_off_cost_center, merchant_id);
create index if not exists pos_profiles_income_account_idx on public.pos_profiles (income_account, merchant_id);
create index if not exists pos_profiles_expense_account_idx on public.pos_profiles (expense_account, merchant_id);
create index if not exists pos_profiles_cost_center_idx on public.pos_profiles (cost_center, merchant_id);


-- 2. Its child tables. Each goes with its profile; the rows are replaced as a set, idx their order.

-- "Once even one User is set in the POS Profile, other Users cannot use this POS Profile." A member's row
-- goes with the member. The owner is no member row and may use every profile.
create table if not exists public.pos_profile_users (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_profile_id uuid not null,
  idx integer not null,
  member_id uuid not null,
  is_default boolean not null default false,

  constraint pos_profile_users_unique unique (pos_profile_id, member_id),
  constraint pos_profile_users_profile_fk foreign key (pos_profile_id, merchant_id) references public.pos_profiles (id, merchant_id) on delete cascade,
  constraint pos_profile_users_member_fk foreign key (member_id, merchant_id) references public.merchant_members (id, merchant_id) on delete cascade
);

alter table public.pos_profile_users enable row level security;
create index if not exists pos_profile_users_member_idx on public.pos_profile_users (member_id, merchant_id);
-- ERPNext's "Already set default in pos profile … for user …": one default profile per member (23505).
create unique index if not exists pos_profile_users_one_default on public.pos_profile_users (member_id) where is_default;

create table if not exists public.pos_profile_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_profile_id uuid not null,
  idx integer not null,
  mode_of_payment_id uuid not null,
  is_default boolean not null default false,
  allow_in_returns boolean not null default false,

  constraint pos_profile_payments_unique unique (pos_profile_id, mode_of_payment_id),
  constraint pos_profile_payments_profile_fk foreign key (pos_profile_id, merchant_id) references public.pos_profiles (id, merchant_id) on delete cascade,
  -- Deleting a mode of payment a profile offers fails with 23503 ("in use").
  constraint pos_profile_payments_mode_fk foreign key (mode_of_payment_id, merchant_id) references public.modes_of_payment (id, merchant_id)
);

alter table public.pos_profile_payments enable row level security;
create index if not exists pos_profile_payments_mode_idx on public.pos_profile_payments (mode_of_payment_id, merchant_id);

create table if not exists public.pos_profile_item_groups (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pos_profile_id uuid not null,
  idx integer not null,
  item_group_id uuid not null,

  constraint pos_profile_item_groups_unique unique (pos_profile_id, item_group_id),
  constraint pos_profile_item_groups_profile_fk foreign key (pos_profile_id, merchant_id) references public.pos_profiles (id, merchant_id) on delete cascade,
  constraint pos_profile_item_groups_group_fk foreign key (item_group_id, merchant_id) references public.item_groups (id, merchant_id)
);

alter table public.pos_profile_item_groups enable row level security;
create index if not exists pos_profile_item_groups_group_idx on public.pos_profile_item_groups (item_group_id, merchant_id);


-- 3. The checks. Only a changed link is checked, as private.validate_defaults does: a record disabled later
-- does not block the profile's other edits. Security definer for that function's reason — a User Permission
-- must not hide the record from the check.

create or replace function private.validate_pos_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_column text;
  v_id uuid;
  v_ok boolean;
begin
  foreach v_column in array array[
    'warehouse', 'selling_price_list', 'taxes_and_charges', 'tax_category', 'print_format', 'letter_head',
    'account_for_change_amount', 'write_off_account', 'write_off_cost_center', 'income_account', 'expense_account', 'cost_center'
  ] loop
    v_id := (v_new ->> v_column)::uuid;
    continue when v_id is null or (v_new ->> v_column) is not distinct from (v_old ->> v_column);

    v_ok := case v_column
      when 'warehouse' then
        (select not w.is_group and not w.disabled from public.warehouses w where w.id = v_id and w.merchant_id = new.merchant_id)
      when 'selling_price_list' then
        (select p.enabled from public.price_lists p where p.id = v_id and p.merchant_id = new.merchant_id)
      when 'taxes_and_charges' then
        (select not t.disabled from public.sales_tax_templates t where t.id = v_id and t.merchant_id = new.merchant_id)
      when 'tax_category' then
        (select not c.disabled from public.tax_categories c where c.id = v_id and c.merchant_id = new.merchant_id)
      when 'print_format' then
        (select not f.disabled from public.print_formats f where f.id = v_id and f.merchant_id = new.merchant_id)
      when 'letter_head' then
        (select not h.disabled from public.letter_heads h where h.id = v_id and h.merchant_id = new.merchant_id)
      -- Change is handed back out of a cash or bank ledger.
      when 'account_for_change_amount' then
        (select not a.is_group and not a.disabled and a.account_type in ('Cash', 'Bank')
         from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'income_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Income' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'write_off_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      when 'expense_account' then
        (select not a.is_group and not a.disabled and a.root_type = 'Expense' from public.accounts a where a.id = v_id and a.merchant_id = new.merchant_id)
      else
        (select not c.is_group and not c.disabled from public.cost_centers c where c.id = v_id and c.merchant_id = new.merchant_id)
    end;

    if not coalesce(v_ok, false) then
      raise exception 'default_invalid' using errcode = '23514', detail = format('%s cannot name that record.', v_column);
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.validate_pos_profile() from public, anon, authenticated, service_role;

drop trigger if exists pos_profiles_validate on public.pos_profiles;
create trigger pos_profiles_validate
  before insert or update on public.pos_profiles
  for each row execute function private.validate_pos_profile();

-- The rules that read the profile's payment rows together ("Only the modes set here will be available when
-- using POS … set one of them as the default"). A deferred constraint trigger on the profile and on its
-- rows, as private.validate_tax_row_references: a save that replaces every row is checked at commit.
create or replace function private.validate_pos_profile_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Through to_jsonb: the profile's own row has no pos_profile_id, and plpgsql resolves every field it reads.
  v_profile uuid := coalesce(to_jsonb(new) ->> 'pos_profile_id', to_jsonb(old) ->> 'pos_profile_id', to_jsonb(new) ->> 'id')::uuid;
  v_rows integer;
  v_defaults integer;
begin
  -- Deleted with its rows: nothing left to hold.
  if not exists (select 1 from public.pos_profiles p where p.id = v_profile) then
    return null;
  end if;

  select count(*), count(*) filter (where r.is_default) into v_rows, v_defaults
  from public.pos_profile_payments r where r.pos_profile_id = v_profile;

  if v_rows = 0 then
    raise exception 'payment_method_required' using errcode = '23514', detail = 'A POS Profile needs at least one payment method.';
  end if;
  if v_defaults <> 1 then
    raise exception 'payment_default_required' using errcode = '23514', detail = 'Exactly one payment method is the default.';
  end if;

  -- ERPNext's "Please set default Cash or Bank account in Mode of Payment".
  if exists (
    select 1 from public.pos_profile_payments r
    join public.modes_of_payment m on m.id = r.mode_of_payment_id
    where r.pos_profile_id = v_profile and (not m.enabled or m.default_account is null)
  ) then
    raise exception 'payment_mode_unusable' using errcode = '23514',
      detail = 'Each payment method is an enabled Mode of Payment with a default account.';
  end if;

  return null;
end;
$$;

revoke execute on function private.validate_pos_profile_payments() from public, anon, authenticated, service_role;

drop trigger if exists pos_profiles_validate_payments on public.pos_profiles;
create constraint trigger pos_profiles_validate_payments
  after insert on public.pos_profiles
  deferrable initially deferred
  for each row execute function private.validate_pos_profile_payments();

drop trigger if exists pos_profile_payments_validate on public.pos_profile_payments;
create constraint trigger pos_profile_payments_validate
  after insert or update or delete on public.pos_profile_payments
  deferrable initially deferred
  for each row execute function private.validate_pos_profile_payments();


-- 4. Saving a profile with its rows. Security invoker, like public.save_item_group: the caller's own policies
-- decide every row.

create or replace function public.save_pos_profile(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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
    'print_receipt_on_order_complete', coalesce((payload ->> 'print_receipt_on_order_complete')::boolean, false)
  )));

  if v_id is null then
    insert into public.pos_profiles (
      merchant_id, pos_profile_name, disabled, warehouse, selling_price_list, taxes_and_charges, tax_category, print_format,
      letter_head, account_for_change_amount, write_off_account, write_off_cost_center, write_off_limit, income_account,
      expense_account, cost_center, hide_unavailable_items, allow_rate_change, set_grand_total_to_default_mop,
      print_receipt_on_order_complete
    )
    values (
      v_merchant, v_row.pos_profile_name, v_row.disabled, v_row.warehouse, v_row.selling_price_list, v_row.taxes_and_charges,
      v_row.tax_category, v_row.print_format, v_row.letter_head, v_row.account_for_change_amount, v_row.write_off_account,
      v_row.write_off_cost_center, v_row.write_off_limit, v_row.income_account, v_row.expense_account, v_row.cost_center,
      v_row.hide_unavailable_items, v_row.allow_rate_change, v_row.set_grand_total_to_default_mop,
      v_row.print_receipt_on_order_complete
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
      print_receipt_on_order_complete = v_row.print_receipt_on_order_complete
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

revoke execute on function public.save_pos_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_pos_profile(jsonb) to authenticated;


-- 5. Doctype, permissions, policies (supabase/migrations/20261008145056_users_and_access.sql). ERPNext's
-- matrix: Sales Manager and Accounts Manager keep it; a cashier (Sales User) reads the register's settings.

insert into public.doctypes (name, table_name, kind, restrictable)
values ('POS Profile', 'pos_profiles', 'record', false)
on conflict (name) do nothing;

insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('Sales Manager', 'POS Profile', true, true, true, true, true),
  ('Accounts Manager', 'POS Profile', true, true, true, true, true),
  ('Sales User', 'POS Profile', true, true, false, false, false)
on conflict (role_name, doctype) do nothing;

select private.sync_standard_permissions();

select private.apply_doctype_policies('pos_profiles', 'POS Profile');
select private.apply_doctype_policies('pos_profile_users', 'POS Profile', true);
select private.apply_doctype_policies('pos_profile_payments', 'POS Profile', true);
select private.apply_doctype_policies('pos_profile_item_groups', 'POS Profile', true);
