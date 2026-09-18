# Tenancy and access model

How rows are scoped to a business, and the shape every RLS policy on a business table takes.

`public.merchants` and `private.current_merchant_ids()` already exist
(`supabase/migrations/20260908131200_merchants.sql`). Call them; do not rebuild them.

## Rules

1. The tenant is the **merchant**, not the user. A user account is a person; a merchant is the
   business whose rows are protected.
2. Every business table carries `merchant_id` from its **first** migration, not nullable, even while
   a merchant has exactly one user.
3. Business table policies key on **membership of the row's merchant**, never on
   `auth.uid() = <row>.user_id`. The tenant root is the exception — `public.merchants` keys on its
   own `owner_id`.
4. Membership is resolved by one `security definer` function in `private`, and every business table's
   policy calls it. The function is the seam: what it reads may change, its signature and call sites
   may not.
5. Never add a second merchant table. One table, not two — `merchants.owner_id` *is* the membership
   for now.
6. `public.profiles` stays as it is — the person, not the membership. Do not add `merchant_id`.
7. Do not build a permission system, a roles table, or a policy matrix now.
8. Who creates the merchant row: an explicit onboarding step, never a trigger. `CreateSystemModal`
   inserts it, and its step 1 also writes `profiles.display_name`.

---

## 1. The model

```
auth.users ──1:1── public.profiles          the person
     │
     └──────────────────────────────── public.merchants
                                          (owner_id, …)   the tenant
                                              │
                        every business table carries merchant_id
```

Later, `merchant_members (user_id, merchant_id, role)` sits between the two. Nothing else moves —
only the function body changes.

Not one merchant per user account with staff sharing a login: that cannot attribute an action to a
person, which a POS needs for a shift report, a void or a discount override.

## 2. Why `merchant_id` ships on day one

Adding a tenant column to a table that already has rows costs a backfill that has to guess which
merchant historic rows belonged to, an `alter column … set not null` that fails if the guess missed
any, and a rewrite of every policy on that table. Every table added before the column exists pays it
again.

Same for the policy shape: a policy written against `auth.uid() = row.user_id` has to be *replaced*
on every table when staff arrive. A policy written against the membership function is already
correct.

## 3. Ordering

A policy on `products` cannot call `private.current_merchant_ids()` before it exists, and
`products.merchant_id` has nothing to reference before `merchants` exists:

```
merchants + private.current_merchant_ids()   ← first
products, orders, …                          ← their policies call the function
```

## 4. What exists

```sql
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.merchants enable row level security;

create or replace function private.current_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid());
$$;

revoke execute on function private.current_merchant_ids()
  from public, anon, authenticated, service_role;

grant usage on schema private to authenticated;
grant execute on function private.current_merchant_ids() to authenticated;
```

The function is in `private` so PostgREST never publishes it at `/rest/v1/rpc/`, has `search_path`
pinned with a fully-qualified body, and carries its own `(select auth.uid())` check. `stable` lets
the planner call it once per statement rather than once per row.

Both grants are required: a policy expression runs as the querying role, so without them the first
policy to call the function refuses every read. `anon` and `service_role` keep no grant. Granting
does not publish the function — PostgREST serves only the schemas it is configured to expose, and
`private` is not one.

## 5. The policy every business table gets

```sql
create policy products_select_own_merchant on public.products
  for select to authenticated
  using (merchant_id in (select private.current_merchant_ids()));
```

Scoped `to authenticated`, the function call wrapped in `select` so it runs once as an InitPlan, and
every `update` policy carrying both `using` and `with check` — without the second, a row can be moved
to another merchant.

Copy the shape in `20260914092147_products.sql` for the next table.

## 6. When staff arrive

Add `merchant_members (user_id, merchant_id, role)`, backfill one `owner` row per existing merchant
from `merchants.owner_id`, and repoint the function body:

```sql
select m.merchant_id from public.merchant_members m where m.user_id = (select auth.uid());
```

Same signature, same call sites. Zero policy rewrites, zero table alterations, no backfill on any
business table.

**The recursion trap:** a policy on `merchant_members` that selects from `merchant_members` recurses
infinitely. `security definer` is the fix, because it bypasses RLS on the tables inside its body —
already the shape above.

`role` arrives as a plain `text` column with a check constraint, written but not read by any policy.
Policies still gate on membership only, until enough features exist that a real role boundary is
visible.

## 7. Still open

- **How a staff account is created** — an invite consumed by the invitee, or an admin creating the
  account outright. The second needs the service key and therefore an Edge Function.
- **Whether anything crosses merchants.** If a user may belong to two, the app needs an
  active-merchant selection — client state in `src/Store/`, and part of the query key.
