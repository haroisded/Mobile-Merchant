-- Step 11 of the POS foundation, on ERPNext's model: Users & Access
-- (.claude/erpnext-docs/POS-System-Only-Features.md 11.1–11.4; docs.frappe.io/erpnext/adding-users,
-- /role-and-role-profile, /role-based-permissions, /user-permissions).
--
-- 1. The registry: every doctype a permission can name, and the standard role matrix new systems start
--    from. Global, read-only, written only by migrations.
-- 2. Per system: roles, role profiles, members (ERPNext's User), their roles, the editable role matrix
--    (Role Permissions Manager) and User Permissions.
-- 3. The engine the policies call. private.permitted_merchant_ids(doctype, ptype) is the seam
--    (.claude/instruction_mds/tenancy.md): every business table's policy asks it, and only its body
--    changes as access grows.
-- 4. Claiming an invite: a member row attaches to the account with that confirmed email, whichever of
--    the two arrives first.
-- 5. The RPCs the screens call, and the policies, rebuilt through one helper.
-- 6. Seeding: every system gets the standard roles and matrix; the systems that exist are backfilled.
--
-- The owner of a system is ERPNext's Administrator: never restricted, cannot be removed, and needs no
-- member row. Re-runnable, like the rest of supabase/migrations.

create schema if not exists private;


-- 1. The registry. RLS on with a select policy only (CLAUDE.md §6.1): every signed-in user may read
-- which doctypes exist and what the standard matrix is; only a migration writes either.

create table if not exists public.doctypes (
  name text primary key,
  -- The table its rows live in, for User Permissions' existence check and tree walk.
  table_name text not null,
  -- record: many rows per system. single: one row per system (Company, the Settings doctypes).
  -- tree: records with parent_id + is_group (Account, Cost Center).
  kind text not null,
  -- Whether a User Permission may name it as "Allow".
  restrictable boolean not null default false,

  constraint doctypes_kind check (kind in ('record', 'single', 'tree'))
);

alter table public.doctypes enable row level security;

drop policy if exists doctypes_select on public.doctypes;
create policy doctypes_select on public.doctypes
  for select to authenticated
  using (true);

-- ERPNext's permission types for these doctypes, as columns rather than ERPNext's 0/1 fields. Named
-- can_* because select, create and delete are reserved words. Submit, cancel, amend and print arrive
-- with POS Invoice; perm levels and If Owner are out of scope.
create table if not exists public.standard_role_permissions (
  role_name text not null,
  doctype text not null references public.doctypes (name) on delete cascade,
  can_select boolean not null default false,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_create boolean not null default false,
  can_delete boolean not null default false,

  primary key (role_name, doctype)
);

alter table public.standard_role_permissions enable row level security;

drop policy if exists standard_role_permissions_select on public.standard_role_permissions;
create policy standard_role_permissions_select on public.standard_role_permissions
  for select to authenticated
  using (true);

insert into public.doctypes (name, table_name, kind, restrictable)
values
  ('Company', 'merchants', 'single', false),
  ('Fiscal Year', 'fiscal_years', 'record', true),
  ('User', 'merchant_members', 'record', false),
  ('Role', 'roles', 'record', false),
  ('Role Profile', 'role_profiles', 'record', false),
  ('Role Permission', 'role_permissions', 'record', false),
  ('User Permission', 'user_permissions', 'record', false)
on conflict (name) do nothing;

-- The standard matrix for these doctypes (.claude/erpnext-docs/current-plan.md, "Standard role
-- matrix"). A single doctype has no create or delete: its one row is made by a seed.
insert into public.standard_role_permissions (role_name, doctype, can_select, can_read, can_write, can_create, can_delete)
values
  ('System Manager', 'Company', true, true, true, false, false),
  ('Accounts Manager', 'Company', true, true, true, false, false),
  ('Accounts User', 'Company', true, true, false, false, false),
  ('Stock Manager', 'Company', true, true, false, false, false),
  ('Sales Manager', 'Company', true, true, false, false, false),
  ('Sales Master Manager', 'Company', true, true, false, false, false),
  ('All', 'Company', true, false, false, false, false),

  ('System Manager', 'Fiscal Year', true, true, true, true, true),
  ('Accounts Manager', 'Fiscal Year', true, true, true, true, true),
  ('Accounts User', 'Fiscal Year', true, true, false, false, false),
  ('All', 'Fiscal Year', true, false, false, false, false),

  ('System Manager', 'User', true, true, true, true, true),
  ('System Manager', 'Role', true, true, true, true, true),
  ('System Manager', 'Role Profile', true, true, true, true, true),
  ('System Manager', 'Role Permission', true, true, true, true, true),
  ('System Manager', 'User Permission', true, true, true, true, true)
on conflict (role_name, doctype) do nothing;


-- 2. Per system.

-- ERPNext's standard roles, and "All": the role every member holds implicitly. Created by the seed below,
-- never by a client; a client creates custom roles only.
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  role_name text not null,
  is_standard boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),

  constraint roles_id_merchant unique (id, merchant_id),
  constraint roles_name_unique unique (merchant_id, role_name),
  constraint roles_name_length check (length(btrim(role_name)) between 1 and 60)
);

alter table public.roles enable row level security;

create table if not exists public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  role_profile_name text not null,
  created_at timestamptz not null default now(),

  constraint role_profiles_id_merchant unique (id, merchant_id),
  constraint role_profiles_name_unique unique (merchant_id, role_profile_name),
  constraint role_profiles_name_length check (length(btrim(role_profile_name)) between 1 and 60)
);

alter table public.role_profiles enable row level security;

create table if not exists public.role_profile_roles (
  role_profile_id uuid not null,
  role_id uuid not null,
  merchant_id uuid not null,

  primary key (role_profile_id, role_id),
  -- Composite keys: a profile can only hold roles of its own system.
  constraint role_profile_roles_profile_fk foreign key (role_profile_id, merchant_id)
    references public.role_profiles (id, merchant_id) on delete cascade,
  constraint role_profile_roles_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.role_profile_roles enable row level security;
create index if not exists role_profile_roles_role_id_idx on public.role_profile_roles (role_id, merchant_id);
create index if not exists role_profile_roles_merchant_id_idx on public.role_profile_roles (merchant_id);

-- ERPNext's User, scoped to one system: a person invited by email. `user_id` is null until an account
-- with that confirmed email exists (§4), and goes back to null if that account is deleted.
create table if not exists public.merchant_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- Stored lower-cased and trimmed by the claim trigger below: the email is the person's key.
  email text not null,
  full_name text,
  user_id uuid references auth.users (id) on delete set null,
  enabled boolean not null default true,
  -- ERPNext: a role profile, when set, decides the user's roles in place of their own list.
  role_profile_id uuid,
  created_at timestamptz not null default now(),

  constraint merchant_members_id_merchant unique (id, merchant_id),
  constraint merchant_members_email_unique unique (merchant_id, email),
  constraint merchant_members_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint merchant_members_full_name_length check (full_name is null or length(full_name) <= 120),
  -- on delete set null for a composite key would also null merchant_id; set null on the one column.
  constraint merchant_members_role_profile_fk foreign key (role_profile_id, merchant_id)
    references public.role_profiles (id, merchant_id) on delete set null (role_profile_id)
);

alter table public.merchant_members enable row level security;
create index if not exists merchant_members_user_id_idx on public.merchant_members (user_id);
create index if not exists merchant_members_role_profile_id_idx on public.merchant_members (role_profile_id, merchant_id);

create table if not exists public.member_roles (
  member_id uuid not null,
  role_id uuid not null,
  merchant_id uuid not null,

  primary key (member_id, role_id),
  constraint member_roles_member_fk foreign key (member_id, merchant_id)
    references public.merchant_members (id, merchant_id) on delete cascade,
  constraint member_roles_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.member_roles enable row level security;
create index if not exists member_roles_role_id_idx on public.member_roles (role_id, merchant_id);
create index if not exists member_roles_merchant_id_idx on public.member_roles (merchant_id);

-- The Role Permissions Manager's rows: one per role and doctype, at permission level 0.
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  role_id uuid not null,
  doctype text not null references public.doctypes (name) on delete cascade,
  can_select boolean not null default false,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_create boolean not null default false,
  can_delete boolean not null default false,

  constraint role_permissions_id_merchant unique (id, merchant_id),
  constraint role_permissions_role_doctype_unique unique (role_id, doctype),
  constraint role_permissions_role_fk foreign key (role_id, merchant_id)
    references public.roles (id, merchant_id) on delete cascade
);

alter table public.role_permissions enable row level security;
create index if not exists role_permissions_merchant_doctype_idx on public.role_permissions (merchant_id, doctype);
create index if not exists role_permissions_doctype_idx on public.role_permissions (doctype);

-- ERPNext's User Permission: restrict one member to particular records of a doctype.
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  member_id uuid not null,
  allow text not null references public.doctypes (name) on delete cascade,
  for_value uuid not null,
  -- The value new records of this member start with. One per member and doctype (index below).
  is_default boolean not null default false,
  apply_to_all_doctypes boolean not null default true,
  -- Set only when apply_to_all_doctypes is off: the one doctype this restriction applies under.
  applicable_for text references public.doctypes (name) on delete cascade,
  -- Tree doctypes: grant the record without its descendants.
  hide_descendants boolean not null default false,
  created_at timestamptz not null default now(),

  constraint user_permissions_id_merchant unique (id, merchant_id),
  constraint user_permissions_unique unique nulls not distinct (member_id, allow, for_value, applicable_for),
  constraint user_permissions_applicable_for check ((apply_to_all_doctypes and applicable_for is null) or (not apply_to_all_doctypes and applicable_for is not null)),
  constraint user_permissions_member_fk foreign key (member_id, merchant_id)
    references public.merchant_members (id, merchant_id) on delete cascade
);

alter table public.user_permissions enable row level security;
create index if not exists user_permissions_merchant_id_idx on public.user_permissions (merchant_id);
create index if not exists user_permissions_allow_idx on public.user_permissions (allow);
create index if not exists user_permissions_applicable_for_idx on public.user_permissions (applicable_for);
create unique index if not exists user_permissions_one_default on public.user_permissions (member_id, allow) where is_default;


-- 3. The engine. All security definer in `private` (CLAUDE.md §6.2): out of PostgREST's reach, search_path
-- pinned, and every one answers only for (select auth.uid()). They bypass RLS on the tables they read,
-- which is what stops a policy on merchant_members recursing into itself (tenancy.md §6).

-- The systems the caller may enter: owned, or an enabled membership that has been claimed.
create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid())
  union
  select mm.merchant_id from public.merchant_members mm where mm.user_id = (select auth.uid()) and mm.enabled;
$$;

revoke execute on function private.current_merchant_ids() from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.current_merchant_ids() to authenticated;

-- The caller's effective roles in every system they are a member of: the role profile's roles when one is
-- set (ERPNext replaces the user's roles with the profile's), else their own, plus All — enabled ones only.
create or replace function private.effective_role_ids()
returns table (merchant_id uuid, role_id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select mm.merchant_id, r.id
  from public.merchant_members mm
  join public.roles r on r.merchant_id = mm.merchant_id and not r.disabled
  where mm.user_id = (select auth.uid())
    and mm.enabled
    and (
      (r.is_standard and r.role_name = 'All')
      or (mm.role_profile_id is not null and exists (
        select 1 from public.role_profile_roles rpr where rpr.role_profile_id = mm.role_profile_id and rpr.role_id = r.id
      ))
      or (mm.role_profile_id is null and exists (
        select 1 from public.member_roles mr where mr.member_id = mm.id and mr.role_id = r.id
      ))
    );
$$;

revoke execute on function private.effective_role_ids() from public, anon, authenticated, service_role;

-- The seam. The systems in which the caller may `ptype` (select, read, write, create, delete) rows of
-- `doctype`: every system they own, and every system where one of their effective roles has that
-- permission. `select` also passes on read — a role that may open a record may pick it in a field.
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

revoke execute on function private.permitted_merchant_ids(text, text) from public, anon, authenticated, service_role;
grant execute on function private.permitted_merchant_ids(text, text) to authenticated;

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


-- 4. Claiming an invite. A member row attaches to the account whose CONFIRMED email matches — confirmed,
-- so typing someone's address into a sign-up form cannot take their seat. Google and Facebook sign-ins
-- arrive confirmed (verified on the hosted project, 2026-10-08). Whichever arrives second does the
-- attaching: the invite (trigger on merchant_members) or the account (trigger on auth.users).

create or replace function private.claim_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_email text;
begin
  new.email := lower(btrim(new.email));

  if tg_op = 'UPDATE' and new.email is distinct from old.email and old.user_id is not null then
    raise exception 'member_email_locked' using errcode = '23514',
      detail = 'An active member''s email is their ID; remove them and invite the new address instead.';
  end if;

  select lower(u.email) into v_owner_email
  from public.merchants m join auth.users u on u.id = m.owner_id
  where m.id = new.merchant_id;

  if new.email = v_owner_email then
    raise exception 'member_is_owner' using errcode = '23514',
      detail = 'The owner already has every permission in their own system.';
  end if;

  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.user_id := (
      select u.id from auth.users u
      where lower(u.email) = new.email and u.email_confirmed_at is not null
      limit 1
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.claim_membership() from public, anon, authenticated, service_role;

drop trigger if exists merchant_members_claim on public.merchant_members;
create trigger merchant_members_claim
  before insert or update of email on public.merchant_members
  for each row execute function private.claim_membership();

create or replace function private.claim_memberships_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.merchant_members
    set user_id = new.id
    where email = lower(new.email) and user_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.claim_memberships_for_user() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_claim_memberships on auth.users;
create trigger on_auth_user_claim_memberships
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.claim_memberships_for_user();

-- Standard roles keep their names and stay standard; All stays enabled, since it is every member's
-- floor. Only a seed (running as the owner of these tables, not as `authenticated`) makes a standard
-- role.
create or replace function private.guard_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_standard and current_user in ('authenticated', 'anon') then
      raise exception 'standard_role_reserved' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_standard and current_user in ('authenticated', 'anon') then
      raise exception 'standard_role_locked' using errcode = '42501',
        detail = 'A standard role cannot be deleted; disable it instead.';
    end if;
    return old;
  end if;

  if old.is_standard and (new.role_name is distinct from old.role_name or not new.is_standard) then
    raise exception 'standard_role_locked' using errcode = '42501', detail = 'A standard role cannot be renamed.';
  end if;
  if not old.is_standard and new.is_standard then
    raise exception 'standard_role_reserved' using errcode = '42501';
  end if;
  if new.is_standard and new.role_name = 'All' and new.disabled then
    raise exception 'all_role_required' using errcode = '42501', detail = 'Every member holds All; it cannot be disabled.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_roles() from public, anon, authenticated, service_role;

drop trigger if exists roles_guard on public.roles;
create trigger roles_guard
  before insert or update or delete on public.roles
  for each row execute function private.guard_roles();

-- A system's owner does not change: a member allowed to edit the Company may rename it, but not take it.
create or replace function private.merchants_keep_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.merchants_keep_owner() from public, anon, authenticated, service_role;

drop trigger if exists merchants_keep_owner on public.merchants;
create trigger merchants_keep_owner
  before update of owner_id on public.merchants
  for each row execute function private.merchants_keep_owner();

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

drop trigger if exists user_permissions_validate on public.user_permissions;
create trigger user_permissions_validate
  before insert or update on public.user_permissions
  for each row execute function private.validate_user_permission();


-- 5. RPCs and policies.

-- What the signed-in person may do in one system, for the screens to hide what RLS would refuse. The
-- policies stay the boundary; this only mirrors them. Null for a system the caller cannot enter.
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

revoke execute on function public.my_permissions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Save a member and their roles in one transaction. Security INVOKER: RLS decides, as for any write — the
-- caller needs User create (new) or write (existing). Roles are kept only without a role profile.
create or replace function public.save_member(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
  v_profile uuid := nullif(payload ->> 'role_profile_id', '')::uuid;
begin
  if v_id is null then
    insert into public.merchant_members (merchant_id, email, full_name, enabled, role_profile_id)
    values (v_merchant, payload ->> 'email', nullif(btrim(payload ->> 'full_name'), ''), coalesce((payload ->> 'enabled')::boolean, true), v_profile)
    returning id into v_id;
  else
    update public.merchant_members set
      email = payload ->> 'email',
      full_name = nullif(btrim(payload ->> 'full_name'), ''),
      enabled = coalesce((payload ->> 'enabled')::boolean, true),
      role_profile_id = v_profile
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    -- RLS filters an UPDATE rather than refusing it.
    if v_id is null then
      raise exception 'member_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.member_roles where member_id = v_id;

  if v_profile is null then
    insert into public.member_roles (member_id, role_id, merchant_id)
    select v_id, r.value::uuid, v_merchant
    from jsonb_array_elements_text(coalesce(payload -> 'role_ids', '[]'::jsonb)) as r (value);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_member(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_member(jsonb) to authenticated;

-- Save a role profile and its roles in one transaction. Security invoker, like save_member.
create or replace function public.save_role_profile(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_merchant uuid := (payload ->> 'merchant_id')::uuid;
begin
  if v_id is null then
    insert into public.role_profiles (merchant_id, role_profile_name)
    values (v_merchant, btrim(payload ->> 'role_profile_name'))
    returning id into v_id;
  else
    update public.role_profiles set role_profile_name = btrim(payload ->> 'role_profile_name')
    where id = v_id and merchant_id = v_merchant
    returning id into v_id;

    if v_id is null then
      raise exception 'role_profile_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.role_profile_roles where role_profile_id = v_id;

  insert into public.role_profile_roles (role_profile_id, role_id, merchant_id)
  select v_id, r.value::uuid, v_merchant
  from jsonb_array_elements_text(coalesce(payload -> 'role_ids', '[]'::jsonb)) as r (value);

  return v_id;
end;
$$;

revoke execute on function public.save_role_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_role_profile(jsonb) to authenticated;

-- The Role Permissions Manager's Save: one doctype's rules, replaced as a set. Security invoker — the
-- caller needs Role Permission delete, create and write, as each row change would.
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

revoke execute on function public.save_role_permissions(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_role_permissions(uuid, text, jsonb) to authenticated;

-- The policy helper every doctype table goes through, so no table can ship a policy that forgets the
-- matrix, the `with check`, or a User Permission (CLAUDE.md §6.3). Run by migrations only.
--
-- record/tree: select ← select or read, insert ← create, update ← write, delete ← delete.
-- single: select and update only — its one row is made by a seed and goes with the system.
-- child (p_child): rows edited as part of their parent doctype — select ← read, writes ← write.
-- A restrictable doctype also filters select/update/delete by the caller's User Permissions. Not insert:
-- a new record has no id a permission could have named.
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

revoke execute on function private.apply_doctype_policies(text, text, boolean) from public, anon, authenticated, service_role;

-- The tenant root. Any member may see the system they belong to (the shell needs its name); a Company
-- write permission may edit it; only its owner creates or deletes it.
--
-- The owner clause stays on the row itself. Create System inserts with RETURNING, which is checked
-- against this policy, and current_merchant_ids() is stable: it reads the statement's snapshot, taken
-- before the new row existed, so on its own it refused the system being created (probe, 2026-10-08).
drop policy if exists merchants_select_own on public.merchants;
create policy merchants_select_own on public.merchants
  for select to authenticated
  using ((select auth.uid()) = owner_id or id in (select private.current_merchant_ids()));

drop policy if exists merchants_update_own on public.merchants;
create policy merchants_update_own on public.merchants
  for update to authenticated
  using (id in (select private.permitted_merchant_ids('Company', 'write')))
  with check (id in (select private.permitted_merchant_ids('Company', 'write')));

-- merchants_insert_own and merchants_delete_own stay as 20260908131200_merchants.sql wrote them: keyed on
-- owner_id.

-- Fiscal years move from membership onto the matrix.
drop policy if exists fiscal_years_select_own_merchant on public.fiscal_years;
drop policy if exists fiscal_years_insert_own_merchant on public.fiscal_years;
drop policy if exists fiscal_years_update_own_merchant on public.fiscal_years;
drop policy if exists fiscal_years_delete_own_merchant on public.fiscal_years;
select private.apply_doctype_policies('fiscal_years', 'Fiscal Year');

select private.apply_doctype_policies('roles', 'Role');
select private.apply_doctype_policies('role_profiles', 'Role Profile');
select private.apply_doctype_policies('role_profile_roles', 'Role Profile', true);
select private.apply_doctype_policies('merchant_members', 'User');
select private.apply_doctype_policies('member_roles', 'User', true);
select private.apply_doctype_policies('role_permissions', 'Role Permission');
select private.apply_doctype_policies('user_permissions', 'User Permission');


-- 6. Seeding.

-- Copy the standard matrix onto a system's standard roles (every system's, when p_merchant is null), for
-- the template rows it does not have yet. Each later step's migration calls this with null after adding
-- its doctypes' rows; a rule the system's System Manager removed stays removed only until then.
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

revoke execute on function private.sync_standard_permissions(uuid) from public, anon, authenticated, service_role;

-- A system's standard roles. Names as ERPNext ships them, scoped to this app's doctypes.
create or replace function private.seed_roles(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.roles (merchant_id, role_name, is_standard)
  select p_merchant, r.name, true
  from unnest(array[
    'System Manager', 'Accounts Manager', 'Accounts User', 'Stock Manager', 'Stock User',
    'Item Manager', 'Sales Manager', 'Sales Master Manager', 'Sales User', 'All'
  ]) as r (name)
  on conflict (merchant_id, role_name) do nothing;
$$;

revoke execute on function private.seed_roles(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.owner_id <> (select auth.uid()) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  perform private.seed_roles(new.id);
  perform private.sync_standard_permissions(new.id);
  return new;
end;
$$;

revoke execute on function private.seed_access() from public, anon, authenticated, service_role;

drop trigger if exists merchants_seed_20_access on public.merchants;
create trigger merchants_seed_20_access
  after insert on public.merchants
  for each row execute function private.seed_access();

-- The systems that already exist.
select private.seed_roles(m.id) from public.merchants m;
select private.sync_standard_permissions();
