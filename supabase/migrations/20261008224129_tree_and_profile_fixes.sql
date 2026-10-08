-- Two fixes found on the 2026-10-09 device run (.claude/tests/test-report/).
--
-- 1. private.validate_tree() raised 42703 on every edit of a cost-center group with children: its
--    root_type check read new.root_type on a table that has no such column. Same function, with that
--    check nested under the accounts branch. Everything else in it is unchanged
--    (20261008152613_chart_of_accounts.sql).
--
-- 2. Accounts that signed up before the signup trigger existed (20260902000002_profiles.sql) have no
--    public.profiles row, so my_permissions and the Users page show them without a name. Backfilled
--    the way private.handle_new_user() fills a new one.

create or replace function private.validate_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_group boolean;
  v_parent_root text;
  v_cycle boolean;
  v_children boolean;
begin
  if tg_op = 'DELETE' then
    -- The cost-center root is the company's; it goes only with the system. Deleting the system cascades
    -- here after its row is gone, so a root whose system still exists is a direct delete. (Not
    -- `current_user`: inside a security definer function it is always the owner.)
    if tg_table_name = 'cost_centers' and old.parent_id is null
      and exists (select 1 from public.merchants m where m.id = old.merchant_id) then
      raise exception 'root_locked' using errcode = '42501', detail = 'The company''s cost center cannot be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    execute format('select exists (select 1 from public.%I where parent_id = $1 and merchant_id = $2)', tg_table_name)
      into v_children using new.id, new.merchant_id;
  else
    v_children := false;
  end if;

  if new.parent_id is null then
    if not new.is_group then
      raise exception 'root_must_be_group' using errcode = '23514', detail = 'A root of the tree must be a group.';
    end if;
  else
    if tg_table_name = 'accounts' then
      execute 'select is_group, root_type from public.accounts where id = $1 and merchant_id = $2'
        into v_parent_group, v_parent_root using new.parent_id, new.merchant_id;
    else
      execute 'select is_group from public.cost_centers where id = $1 and merchant_id = $2'
        into v_parent_group using new.parent_id, new.merchant_id;
    end if;

    if not coalesce(v_parent_group, false) then
      raise exception 'parent_not_group' using errcode = '23514', detail = 'A parent must be a group.';
    end if;

    if tg_op = 'UPDATE' then
      execute format(
        'with recursive up (id, parent_id) as (
           select id, parent_id from public.%I where id = $1 and merchant_id = $3
           union
           select t.id, t.parent_id from public.%I t join up on t.id = up.parent_id and t.merchant_id = $3
         )
         select exists (select 1 from up where id = $2)',
        tg_table_name, tg_table_name
      ) into v_cycle using new.parent_id, new.id, new.merchant_id;
      if v_cycle then
        raise exception 'tree_cycle' using errcode = '23514', detail = 'A record cannot sit under itself.';
      end if;
    end if;

    if tg_table_name = 'accounts' then
      new.root_type := v_parent_root;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_children then
    if old.is_group and not new.is_group then
      raise exception 'group_has_children' using errcode = '23514', detail = 'A group with records under it cannot become a ledger.';
    end if;
    -- Nested, not `and`-ed: plpgsql may evaluate both sides, and a cost_centers row has no root_type
    -- (42703 "record new has no field root_type" on every edit of a group with children).
    if tg_table_name = 'accounts' then
      if new.root_type is distinct from old.root_type then
        raise exception 'root_type_locked' using errcode = '23514', detail = 'An account with accounts under it cannot move to another root type.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_tree() from public, anon, authenticated, service_role;

insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  nullif(u.raw_user_meta_data ->> 'full_name', ''),
  nullif(u.raw_user_meta_data ->> 'avatar_url', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
