# Tenancy and access model

How rows are scoped to a business, who may do what inside one, and the shape every RLS policy on a
business table takes.

`public.merchants`, `private.current_merchant_ids()` and the permission engine already exist
(`supabase/migrations/20260908131200_merchants.sql`, `20261014034106_employees_and_permissions.sql`). Call
them; do not rebuild them.

## Rules

1. The tenant is the **merchant**, not the user. A user account is a person; a merchant is the
   business whose rows are protected.
2. Every business table carries `merchant_id` from its **first** migration, not nullable.
3. Business table policies key on **what the caller may do in the row's merchant**, never on
   `auth.uid() = <row>.user_id`. The tenant root is the exception — `public.merchants` keys on its
   own `owner_id` for insert and delete, and on membership and Company write for select and update.
4. Access is resolved by `security definer` functions in `private`, and every business table's policy
   calls one: `private.permitted_merchant_ids(doctype, ptype)`. That is the seam: what it reads may change,
   its signature and call sites may not — §4 records the times it changed.
5. Never add a second merchant table. The owner is `merchants.owner_id` — ERPNext's Administrator,
   who holds every permission and is never a member row. Everyone else is a row of
   `public.merchant_members`.
6. `public.profiles` stays as it is — the person, not the membership. Do not add `merchant_id`.
7. Permissions are the owner's to hand out, Discord-style (2026-10-14): a global catalog of
   **permissions** (`public.permissions` — Process Sales, View Stock Levels, Taxes …), each spelled out as
   ERPNext's doctype × permission-type rules (`public.permission_rules`); a system's **roles**, each a set of
   permissions (`role_grants`); **one role per employee** (`merchant_members.role_id`), and that employee's own
   **exceptions** (`member_overrides`), which win over the role. A permission counts only with the one it
   requires (`permissions.requires`). No role profiles, no per-doctype matrix to edit, no User Permissions.
8. Every business table is registered as a doctype, gets its policies from
   `private.apply_doctype_policies()`, and is reached through the permissions whose `permission_rules` name it
   (CLAUDE.md §6.7). No hand-written business policy.
9. Who creates the merchant row: an explicit onboarding step, never a trigger. The create-system form
   (`src/screens/home/create-system.tsx`) inserts it: name, abbreviation, country, currency.
10. A merchant is its **Company** (ERPNext's), so a Company field is a `merchants` column, never a
    `companies` table (rule 5). The records a new company starts with are made by one `after insert
    on merchants` trigger per step, `merchants_seed_NN_<area>` — Postgres fires same-event triggers in
    name order, so a later step's seed can read an earlier one's rows (10 company, 20 access,
    30 defaults, 40 accounting, 50 accounting defaults, 60 payments, 70 taxes, 80 stock, 90 selling,
    92 stock settings, 94 naming, 96 printing — two digits always: "100" would sort before "20"). Each step's migration also
    backfills the merchants that exist.
11. The UI hides what a person may not do — `usePermissions` with `can()` for a doctype and `has()` for a
    permission (`src/features/permissions/access.ts`) — but never decides it. The policies are the
    boundary; a hidden button is a courtesy.
12. **A permission's rules are what its screens touch.** `read` on what they list or open, `select` on what
    they only look up — a field's options, a price, a register's setup — and the ERPNext types on what they
    write. A screen a permission's holder needs adds its rules in its own migration; the probe that proves
    them reads each table as that permission alone (CLAUDE.md §6.7). A `read` rule also answers `select`.
13. **An access code is the only way in** (§6). A member row is made by `public.decide_access_request`
    alone; `merchant_members_require_access_request` refuses any other insert and any move of a row to
    another person or system. The access-code tables (`access_codes`, `access_requests`) and the access
    tables (`role_grants`, `member_overrides`) are the owner's alone — no permission may make a code, let
    someone in, or raise anyone's access, their own included — so they are the exception to rule 8: not
    doctypes, hand-written policies on `private.owned_merchant_ids()`. `notifications` is the person's own,
    keyed on `user_id` like `profiles`.

---

## 1. The model

```
auth.users ──1:1── public.profiles                            the person
     │
     ├── public.merchants (owner_id)                          the tenant; its owner holds every permission
     │        │
     │        ├── roles ── role_grants (permission)             a role: a set of permissions
     │        ├── access_codes ── access_requests (user_id)     the owner's: codes, and who used them
     │        └── merchant_members (user_id, role_id) ── member_overrides (permission, allowed)
     │
     ├── merchant_members.user_id, made when the owner approves a request
     └── notifications (user_id)                               the person's inbox

public.permissions ── permission_rules (doctype × ptype)       global: what each permission lets a person do
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
policy already called the membership function, no table changed — only function bodies. It held again on
2026-10-14, when ERPNext's roles gave way to permissions: the same helper re-applied the same policies, and
only the seam's body changed.

## 3. Ordering

A policy cannot call a function before it exists, and a `merchant_id` has nothing to reference before
`merchants` exists:

```
merchants + private.current_merchant_ids()                   ← first
doctypes, roles, permitted_merchant_ids()                    ← Users & Access (2026-10-08)
fiscal_years, accounts, …                                    ← their policies call it
permissions, permission_rules, role_grants, member_overrides ← Employees & permissions (2026-10-14)
```

## 4. What exists

`private.current_merchant_ids()` — `security definer`, `stable`, `search_path = ''`: the merchants the
caller owns, plus those where they are a member.

`private.owned_merchant_ids()` — the same shape, the merchants the caller owns and nothing else: what the
owner-only tables' policies call (rule 13).

`private.my_permission_keys()` — the caller's effective permissions in every merchant they belong to: their
role's grants, less a permission an exception turns off, plus one an exception turns on — and each only
when the permission it requires is kept, all the way down (a recursive query), so an owner's later change to
a role cannot leave Apply Discounts standing without Process Sales.

`private.has_permission(merchant, key)` — whether the caller holds `key` there; the owner holds every one.
The sale's poster asks it.

`private.permitted_merchant_ids(doctype, ptype)` — the owner's merchants always; otherwise the merchants
where one of the caller's effective permissions has a `permission_rules` row for that doctype and type. A
`read` rule also answers `select`.

`public.my_permissions(merchant)` — what the screens hide by: `is_owner`, the owner's email and name,
`perms` (each doctype's seven types) and `permissions` (the keys). Null for a system the caller cannot
enter. Definer, granted to `authenticated`, answering only for the caller.

`public.permissions` and `public.permission_rules` — global and read-only like `doctypes`: the catalog the
editors list, and what each permission reaches. Written by migrations only.

**The seam's signature changed once** (Step 21, `20261012131350_access_for_documents.sql`, 2026-10-12): the
two restriction functions gained the document type, and `apply_doctype_policies` rewrote every call site in
that same migration — the five masters and each linking table. Applicable For cannot be answered without
knowing which document is being read. Rejected: a two-argument overload beside the one-argument functions
— two answers to one question, and a policy left on the old one would ignore Applicable For without failing.
On 2026-10-14 the restriction functions went with User Permissions, and `apply_doctype_policies` re-applied
every policy without them; `permitted_merchant_ids` kept its signature and changed only its body.

All are in `private` so PostgREST never publishes them at `/rest/v1/rpc/` (`my_permissions` aside, which the
app calls), have `search_path` pinned with fully-qualified bodies, and read `(select auth.uid())`
themselves. `stable` lets the planner call each once per statement. `authenticated` has `usage` on
`private` and `execute` on the ones policies call — a policy expression runs as the querying role, so
without the grant the first policy to call one refuses every read. `anon` and `service_role` keep none.

**The recursion trap:** a policy on `merchant_members` that selects from `merchant_members` recurses
infinitely. `security definer` is the fix: it bypasses RLS on the tables inside its body.

## 5. The policy every business table gets

Written by `select private.apply_doctype_policies('<table>', '<Doctype>')`, from the doctype's kind:

```sql
-- record / tree: select, insert, update, delete ← select (a read rule answers it too), create, write, delete
create policy fiscal_years_select on public.fiscal_years
  for select to authenticated
  using (merchant_id in (select private.permitted_merchant_ids('Fiscal Year', 'select')));
-- a child table (third argument true): its parent doctype's — select ← select, every write ← write
-- single (one row per merchant): select and update only
-- document: the record's four, plus the trigger private.guard_docstatus() — a signed-in person writes
--           drafts only (on a child table: guard_docstatus_child(), which reads its parent's docstatus)
-- ledger:   select only. Nobody inserts, updates or deletes — the owner included
```

**Submit and Cancel are permission types too** (`submit`, `cancel`), and no policy enforces them:
`docstatus` cannot be written through a policy at all. `public.submit_document` and `public.cancel_document`
are the only way to move it — security definer, they find the document's merchant, check
`permitted_merchant_ids(doctype, 'submit' | 'cancel')` for the caller, lock the row, and only then post or
reverse. A ledger is written by that engine alone, which is why the only rule a permission gives on one is
Read. `permission_rules` gives each kind only the types that mean something for it: any of the seven for a
document, Read for a ledger, Read and Write for a single.

**Delete on a document means two things.** A draft is deleted through its policy, like any record. A
cancelled one goes only through `public.delete_document` — definer, the same merchant lookup and
`permitted_merchant_ids(doctype, 'delete')` check — because its ledger rows go with it and no one may
delete from a ledger. A return is a POS Invoice created and submitted, so the rules alone cannot tell it
from a sale: `private.submit_pos_invoices()` asks for **Process Refunds** on a return and **Process Sales**
on a sale (`refunds_not_permitted`, `sales_not_permitted`). Undoing a sale is **Cancel** — Void Transactions,
which a Cashier does not hold.

**What the device applies, the cashier must look up.** A Pricing Rule is chosen on the device
(`src/features/pricing-rules/apply.ts`), so Process Sales holds `select` on Pricing Rule — as it does on Item
Price and Tax Rule. What a cashier may *give* is the POS Profile's switches (Allow User to Edit Rate, Allow
User to Edit Discount, Ignore Pricing Rule), the Item's Max Discount — both held by
`private.submit_pos_invoices()` for whoever is selling, the owner included — and **Apply Discounts**: a
discount on the sale or a line, or a rate typed away from its Price List Rate, is refused without it
(`discounts_not_permitted`), the owner excepted. A Pricing Rule's price needs nothing: the owner set it.

**A session is its cashier's.** A POS Opening Entry carries `user_id`, and the posters hold the line the
policies cannot: `private.submit_pos_invoices()` sells only inside the caller's own open session, and
`private.submit_pos_closing_entries()` lets the cashier close it — or whoever holds **Close Any Register**
(Cancel on POS Opening Entry), for a session left open. A POS Profile that lists users is usable by them and
the owner only (`private.pos_profile_usable`). Rejected: a policy per cashier — everyone who may see the
sessions and the sales would need a second rule.

Scoped `to authenticated`, each call wrapped in `select` so it runs once as an InitPlan, and every
`update` policy carrying both `using` and `with check` — without the second, a row can be moved to
another merchant. A child table takes its parent's doctype (`apply_doctype_policies(..., true)`), so
whoever may look a document up may read its rows, as a cashier's receipt needs.

## 6. How a member joins

With an **access code**, and only so (2026-10-14, `20261013213537_access_codes.sql`; ARCHITECTURE.md,
Access Codes). The owner makes codes (`public.create_access_codes`) and sends them outside the app; the
person types one in (`public.claim_access_code`), which leaves a pending `access_requests` row and tells the
owner; the owner approves or declines (`public.decide_access_request`), and approving inserts the
`merchant_members` row — with no role, its name, email and photo copied from the request. All three are
definer RPCs that check `(select auth.uid())` themselves; no client writes `access_codes`,
`access_requests` or `merchant_members` directly (rule 13).

An employee with no role sees **Home** only, and is told why (`src/screens/system-home/`). The owner gives a
role and exceptions on **Employees** (`public.save_role`, `public.save_member_access` — both invoker, so only
the owner gets past `role_grants`' and `member_overrides`' policies), and each change tells the employee
once: one unread **Access changed** at a time (`private.notify_access_changed()`). Removing a member
(Revoke, on Access Codes → Members) deletes their row, their exceptions and their places on POS Profiles
with it, and tells them. There is no Disable: an employee kept but idle is one with no role.

Rejected, with reasons:
- **ERPNext's model** — standard and custom roles, a role × doctype matrix of seven rights edited in a Role
  Permissions Manager, role profiles, and User Permissions holding a person to particular records (the
  model from 2026-10-08 to 2026-10-14). Too fine for a shop owner to set; the revamp asks for a handful of
  named abilities. Its doctype × type rules live on as `permission_rules`, the seam's input, and User
  Permissions were dropped outright (the human's call, 2026-10-13).
- **Several roles per employee, as Discord has** — the human's call, 2026-10-13: one role, and the
  employee's own exceptions for whatever the role does not fit.
- **Policies asking `has_permission` table by table** — every table's policy rewritten, and what a
  permission reaches would live in fifty-five policies instead of one table of rules.
- **An invite by email** (`merchant_members` holding an address, claimed by `claim_membership` /
  `claim_memberships_for_user` when that confirmed address signed in — the model until 2026-10-14) —
  codes are the only way in, and a code needs no address the owner must know.
- **An insert policy on `access_codes`** — the owner could pick a code and read the unique violation as
  "this code exists" without the claim's rate limit.
- **Per-user policies** (`auth.uid() in (…)` on each table) — the shape the seam exists to prevent.
- **Invites through an Edge Function with the service key** (creating the account, sending mail) — more
  moving parts than a code, and the person signs in with Google or Facebook anyway.
- **Mirroring permissions only in the client** — the publishable key ships in the bundle; only RLS holds.

## 7. Still open

- **Which system a request is for** is the route's `[id]` — every query key carries `merchantId`, and
  a person in two systems sees both on the **Home** tab. An active-system store is not needed until
  something outside the shell needs it.
- **A `select` rule is a full read through the API.** RLS cannot tell a lookup from a list, so Process Sales
  can read every sale through the API, though no screen lists them without View Sales. Named, not fixed:
  splitting a lookup from a list needs a view per lookup.
- **Apply Discounts is checked against the Price List Rate the app sends** — the poster's "app calculates,
  database checks" ceiling (ARCHITECTURE.md, the Register). A second price engine in SQL is the upgrade.
- **An access change reaches an open app within a minute**, not at once: `usePermissions` asks again every
  minute and on coming back (no Realtime). A card or list a widened permission reveals may first show what
  was fetched before, until its own refresh (the Dashboard's Open Registers card was seen to, 2026-10-14).
- **The role allowed past a frozen date** (Accounts Settings) is one role; an employee's own exceptions
  never reach it.
