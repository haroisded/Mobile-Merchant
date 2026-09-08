# Tenancy and access model

How rows are scoped to a business, and the shape every RLS policy on a business table takes.

**What already exists — use it, do not rebuild it.** `public.merchants` and
`private.current_merchant_ids()` are in `supabase/migrations/20260908131200_merchants.sql`, and
[`ARCHITECTURE.md`](../ARCHITECTURE.md#the-database--supabase) describes what they do.

**What this file governs:** `merchant_members`, roles, and every business table that carries a
`merchant_id`. Read §3 before writing the first of those — designing it against the wrong model is
the one mistake in this area that is expensive to undo, and the function its policies must call is
already sitting there with no caller.

## Rules

1. The tenant is the **merchant**, not the user. A user account is a person; a merchant is the
   business whose rows are being protected.
2. Every business table carries `merchant_id` from its **first** migration, even while a merchant
   has exactly one user. Not nullable.
3. **Business table** policies key on **membership of the row's merchant**, never on
   `auth.uid() = <row>.user_id`. A business table is one carrying a `merchant_id`. The tenant root
   itself is the exception: `public.merchants` keys on its own `owner_id`, because routing it
   through the function that reads it is a self-reference. §3.
4. Membership is resolved by one `security definer` function in `private`, and every business
   table's policy calls that function. The function is the seam — what it reads is allowed to
   change, its signature and its call sites are not.
5. `public.merchants` and `private.current_merchant_ids()` already exist. Call the function from
   your business table's policies; never add a second merchant table. §3.
6. One table, not two. `merchants.owner_id` *is* the membership — do not build `merchant_members`
   until staff accounts are real, and when you do, change only the function body. §3, §4.
7. `public.profiles` stays as it is — the person, not the membership. Do not add `merchant_id` to it.
8. Do not build a permission system, a roles table, or a policy matrix now. §4.

The rest of this file is why.

**Contents**

1. [The model](#1-the-model)
2. [Why `merchant_id` cannot wait](#2-why-merchant_id-cannot-wait)
3. [What must exist first, and the shape the policies take](#3-what-must-exist-first-and-the-shape-the-policies-take)
4. [Roles come later, deliberately](#4-roles-come-later-deliberately)
5. [Settled, and still open](#5-settled-and-still-open)

---

## 1. The model

A merchant owns staff accounts. Access is scoped RBAC: what a user may do is decided by their role
*within one merchant*, and a user may in principle belong to more than one.

Where it ends up:

```
auth.users ──1:1── public.profiles          the person
     │
     └──── public.merchant_members ────── public.merchants
              (user_id, merchant_id, role)      the tenant
                        │
        every business table carries merchant_id
```

What gets built first — the same model with the join table collapsed, because one merchant currently
has exactly one user:

```
auth.users ──1:1── public.profiles          the person
     │
     └──────────────────────────────── public.merchants
                                          (owner_id, …)   the tenant
                                              │
                        every business table carries merchant_id
```

The second becomes the first by adding `merchant_members` and rewriting one function body. Nothing
else moves — §3 is why.

Not one merchant per user account with staff sharing a login. That shape cannot attribute an action
to a person, which a POS needs for anything resembling a shift report, a void, or a discount
override.

---

## 2. Why `merchant_id` cannot wait

Adding a tenant column to a table that already has rows costs three things at once: a backfill that
has to guess which merchant historic rows belonged to, an `alter column … set not null` that fails if
the guess missed any, and a rewrite of every policy on that table. Every table added before the
column exists pays it again.

Adding it on day one costs a column on a table where the answer is currently always the same value.
So the column ships with the first business table, even though staff accounts are far off and every
merchant will have exactly one user for a long time.

The same argument applies to the policy shape (§3): a policy written against
`auth.uid() = row.user_id` today has to be *replaced* when staff arrive, on every table. A policy
written against a membership function is already correct — only the function's body changes.

---

## 3. What must exist first, and the shape the policies take

### The ordering, which is the part that bites

A policy on `products` cannot call `private.current_merchant_ids()` before that function exists, and
`products.merchant_id` has nothing to reference before `merchants` exists. So the order is fixed:

```
merchants + private.current_merchant_ids()   ← first
products, orders, …                          ← their policies call the function
```

Get it backwards and you write `auth.uid() = owner_id` policies on the first table or two "just for
now" — which is exactly the rewrite-every-table cost §2 exists to avoid.

**Trigger condition:** the moment the first business table is being written, the merchant migration
goes in ahead of it, in the same sitting. Not before then — there is nothing for it to protect.

**Nothing blocks the first business table.** Both prerequisites are in place and
`current_merchant_ids()` has no caller yet, so go straight to the table: give it a `not null
merchant_id`, and give every one of its policies the shape below.

### One table, not two

The seam is the **function**, not the table behind it. So `merchants.owner_id` is the membership for
now, and `merchant_members` does not get built yet:

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
```

That function satisfies all three requirements in
[CLAUDE.md §6.2](../CLAUDE.md#62-three-things-every-security-definer-function-needs): `private`
so PostgREST never publishes it at `/rest/v1/rpc/`, `search_path` pinned with a fully-qualified body,
and its own `(select auth.uid())` check inside — so it cannot be made to answer for anyone but its
caller. `stable` lets the planner call it once per statement rather than once per row.

### The policy every business table gets

```sql
create policy products_select_own_merchant on public.products
  for select to authenticated
  using (merchant_id in (select private.current_merchant_ids()));
```

Subject to [CLAUDE.md §6.3](../CLAUDE.md#63-policy-shape) like any other: scoped
`to authenticated`, the function call wrapped in `select` so it runs once as an InitPlan, and every
`update` policy carrying both `using` and `with check` — without the second, a row can be moved to
another merchant.

### What changes when staff arrive

Add `merchant_members (user_id, merchant_id, role)`, backfill one `owner` row per existing merchant
from `merchants.owner_id`, and repoint the function body:

```sql
-- the only thing that changes
select m.merchant_id from public.merchant_members m where m.user_id = (select auth.uid());
```

Same signature, same call sites. **Zero policy rewrites, zero table alterations, no backfill on any
business table** — every one of them already carries `merchant_id`, which is what §2 bought. Whether
`merchants.owner_id` is then dropped or kept as a denormalised convenience is a decision for that
day, not this one.

### The recursion trap, for that day

Noted now because it costs an afternoon when it is hit. A policy on `merchant_members` that selects
from `merchant_members` recurses infinitely — Postgres re-enters the policy to evaluate the policy.
`security definer` is the fix, because it bypasses RLS on the tables inside its body, which is
already the shape above. The trap only exists once the join table does; the `merchants.owner_id`
version has no self-reference to recurse through.

---

## 4. Roles come later, deliberately

The model is scoped RBAC, but a role system built before the actions exist is a guess at a
permission matrix. Nothing can validate it, and every feature added afterwards inherits it.

Nothing about roles gets built now — not even a column, because §3 does not build the table it would
sit on. With one owner per merchant there is no role to record and nothing to backfill later: the
migration that adds `merchant_members` writes `role = 'owner'` for every existing merchant as it goes.

When that table arrives, `role` is a plain `text` column with a check constraint, written but not
read by any policy. Policies still gate on *membership* only. Later still, when enough features exist
that a real role boundary is visible — who may void a sale, who may see margins, who may add staff —
the column is already populated and the policies that need it gain a second condition.

Do not build: a roles table, a permissions table, a role-permission join, a `has_permission()`
function, or a client-side permission map. None of them are needed to add the column.

---

## 5. Settled, and still open

**Who creates the merchant row — an explicit onboarding step, never a trigger.**
`CreateSystemModal` in `src/features/merchants/` inserts it, and its step 1 also writes
`profiles.display_name`, so one wizard covers both the person and the business. Follow that shape
for anything else a user must opt into: a trigger would give a staff member joining an existing
merchant a second one of their own. The invite path is the other half of the first question below.

Still open, and worth settling before the next migration rather than during it:

- **How does a staff account get created?** An invite consumed by the invitee, or an admin creating
  the account outright. The second needs the service key and therefore an Edge Function; the first
  does not.
- **Does anything cross merchants?** If a user may belong to two, the app needs an active-merchant
  selection, and that selection is client state — `src/Store/`, not the query cache. It also becomes
  part of the query key, per
  [`data-layer.md §5`](./data-layer.md#5-tanstack-query-conventions).
