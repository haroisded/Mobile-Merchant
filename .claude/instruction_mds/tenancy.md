# Tenancy and access model

How rows are scoped to a business, who may do what inside one, and the shape every RLS policy on a
business table takes.

`public.merchants`, `private.current_merchant_ids()` and the permission engine already exist
(`supabase/migrations/20260908131200_merchants.sql`, `20261008145056_users_and_access.sql`). Call
them; do not rebuild them.

## Rules

1. The tenant is the **merchant**, not the user. A user account is a person; a merchant is the
   business whose rows are protected.
2. Every business table carries `merchant_id` from its **first** migration, not nullable.
3. Business table policies key on **what the caller may do in the row's merchant**, never on
   `auth.uid() = <row>.user_id`. The tenant root is the exception — `public.merchants` keys on its
   own `owner_id` for insert and delete, and on membership and Company write for select and update.
4. Access is resolved by `security definer` functions in `private`, and every business table's policy
   calls them: `private.permitted_merchant_ids(doctype, ptype)`, plus `restricted_merchant_ids` /
   `allowed_record_ids` on a restrictable doctype. These are the seam: what they read may change,
   their signatures and call sites may not.
5. Never add a second merchant table. The owner is `merchants.owner_id` — ERPNext's Administrator,
   who holds every permission, is never restricted and is never a member row. Everyone else is a row of
   `public.merchant_members`.
6. `public.profiles` stays as it is — the person, not the membership. Do not add `merchant_id`.
7. Permissions are ERPNext's: roles (standard and custom), role profiles, a role × doctype matrix of
   select / read / write / create / delete, and User Permissions. No perm levels, If Owner or Strict
   User Permissions until a feature needs them.
8. Every business table is registered as a doctype and gets its policies from
   `private.apply_doctype_policies()` (CLAUDE.md §6.7). No hand-written business policy.
9. Who creates the merchant row: an explicit onboarding step, never a trigger. The create-system form
   (`src/screens/home/create-system.tsx`) inserts it: name, abbreviation, country, currency.
10. A merchant is its **Company** (ERPNext's), so a Company field is a `merchants` column, never a
    `companies` table (rule 5). The records a new company starts with are made by one `after insert
    on merchants` trigger per step, `merchants_seed_NN_<area>` — Postgres fires same-event triggers in
    name order, so a later step's seed can read an earlier one's rows (10 company, 20 access,
    30 defaults, 40 accounting, 50 accounting defaults, 60 payments, 70 taxes, 80 stock). Each step's migration
    also backfills the merchants that exist.
11. The UI hides what a person may not do — `usePermissions` + `can()` — but never decides it. The
    policies are the boundary; a hidden button is a courtesy.

---

## 1. The model

```
auth.users ──1:1── public.profiles                            the person
     │
     ├── public.merchants (owner_id)                          the tenant; its owner
     │        │
     │        ├── roles ── role_permissions (doctype × ptype)  what each role may do
     │        ├── role_profiles ── role_profile_roles
     │        └── merchant_members (email, user_id) ── member_roles, user_permissions
     │
     └── merchant_members.user_id, filled when a confirmed email signs in

every business table carries merchant_id; public.doctypes names it
```

Not one merchant per user account with staff sharing a login: that cannot attribute an action to a
person, which a POS needs for a shift report, a void or a discount override.

## 2. Why `merchant_id` ships on day one

Adding a tenant column to a table that already has rows costs a backfill that has to guess which
merchant historic rows belonged to, an `alter column … set not null` that fails if the guess missed
any, and a rewrite of every policy on that table. Every table added before the column exists pays it
again.

Same for the policy shape: a policy written against `auth.uid() = row.user_id` has to be *replaced*
on every table when staff arrive. Staff did arrive (Users & Access, 2026-10-08), and because every
policy already called the membership function, no table changed — only function bodies.

## 3. Ordering

A policy cannot call a function before it exists, and a `merchant_id` has nothing to reference before
`merchants` exists:

```
merchants + private.current_merchant_ids()                   ← first
doctypes, roles, role_permissions, permitted_merchant_ids()  ← Users & Access
fiscal_years, accounts, …                                    ← their policies call it
```

## 4. What exists

`private.current_merchant_ids()` — `security definer`, `stable`, `search_path = ''`: the merchants the
caller owns, plus those where they are an enabled member whose `user_id` is theirs.

`private.effective_role_ids()` — the caller's roles in each merchant: the role profile's when the member
has one, else their own `member_roles`, plus the implicit `All`, minus disabled roles.

`private.permitted_merchant_ids(doctype, ptype)` — the owner's merchants always; otherwise the merchants
where an effective role's `role_permissions` row grants `ptype` on `doctype`.

`private.restricted_merchant_ids(doctype)` / `private.allowed_record_ids(doctype)` — the merchants where
a User Permission restricts the caller on `doctype` (Apply To All, or Applicable For that doctype), and
the record ids they may still see: each User Permission's `for_value`, plus every record under it in a
tree unless Hide Descendants.

All are in `private` so PostgREST never publishes them at `/rest/v1/rpc/`, have `search_path` pinned with
fully-qualified bodies, and read `(select auth.uid())` themselves. `stable` lets the planner call each
once per statement. `authenticated` has `usage` on `private` and `execute` on these — a policy
expression runs as the querying role, so without the grant the first policy to call one refuses every
read. `anon` and `service_role` keep none.

**The recursion trap:** a policy on `merchant_members` that selects from `merchant_members` recurses
infinitely. `security definer` is the fix: it bypasses RLS on the tables inside its body.

## 5. The policy every business table gets

Written by `select private.apply_doctype_policies('<table>', '<Doctype>')`, from the doctype's kind:

```sql
-- record / tree: select, insert, update, delete ← select (or read), create, write, delete
create policy fiscal_years_select on public.fiscal_years
  for select to authenticated
  using (merchant_id in (select private.permitted_merchant_ids('Fiscal Year', 'select'))
         and (merchant_id not in (select private.restricted_merchant_ids('Fiscal Year'))
              or id in (select private.allowed_record_ids('Fiscal Year'))));
-- single (one row per merchant): select and update only
```

Scoped `to authenticated`, each call wrapped in `select` so it runs once as an InitPlan, and every
`update` policy carrying both `using` and `with check` — without the second, a row can be moved to
another merchant. Child tables (`role_profile_roles`, `member_roles`) take their parent's doctype.

## 6. How a member joins

An **invite is a row**, not an email: the owner (or a System Manager) adds the person's address to
`merchant_members`. `private.claim_membership` fills `user_id` when that address already belongs to a
confirmed `auth.users` row, and `private.claim_memberships_for_user` fills it when the person signs in
later. Every OAuth account here arrives with `email_confirmed_at` set, so a claimed address is one the
person proved they own. Inviting the owner's own address is refused (`member_is_owner`); a claimed
member's email cannot change (`member_email_locked`).

Disabling a member drops the merchant from their `current_merchant_ids()` at once — every policy
follows. Removing them deletes their roles and User Permissions with the row.

Rejected, with reasons:
- **A roles column on the member, no matrix** — the first custom role or changed rule needs a schema
  change; ERPNext's matrix is data.
- **Per-user policies** (`auth.uid() in (…)` on each table) — the shape the seam exists to prevent.
- **Invites through an Edge Function with the service key** (creating the account, sending mail) — more
  moving parts than the claim, and the person signs in with Google or Facebook anyway.
- **Mirroring permissions only in the client** — the publishable key ships in the bundle; only RLS holds.

## 7. Still open

- **Which system a request is for** is the route's `[id]` — every query key carries `merchantId`, and
  a person in two systems sees both on the **Home** tab. An active-system store is not needed until
  something outside the shell needs it.
- **Applicable For** is stored and validated but filters nothing yet: it limits a restriction to the
  documents that link to the restricted doctype, and the first linking document (POS Invoice) is ahead.
