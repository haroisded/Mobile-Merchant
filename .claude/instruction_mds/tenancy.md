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
   calls them: `private.permitted_merchant_ids(doctype, ptype)`, plus `restricted_merchant_ids(allow,
   doctype)` / `allowed_record_ids(allow, doctype)` on a restrictable doctype and on every table that
   links to one (rule 12). These are the seam: what they read may change, their signatures and call
   sites may not — §4 records the one time they did.
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
    30 defaults, 40 accounting, 50 accounting defaults, 60 payments, 70 taxes, 80 stock, 90 selling,
    92 stock settings, 94 naming, 96 printing — two digits always: "100" would sort before "20"). Each step's migration also
    backfills the merchants that exist.
11. The UI hides what a person may not do — `usePermissions` + `can()` — but never decides it. The
    policies are the boundary; a hidden button is a courtesy.
12. A document type that links to a restrictable doctype says so in `public.doctype_links` (doctype,
    link doctype, column), in its own migration, before `apply_doctype_policies` runs: that row is what
    makes a User Permission on the linked record filter it. Only a document's or a ledger's own link, and
    the one record a master belongs to (an Item's Item Group, a POS Profile's Warehouse). A *default* on
    a master is never a link (§5).
13. **An access code is the only way in** (§6). A member row is made by `public.decide_access_request`
    alone; `merchant_members_require_access_request` refuses any other insert and any move of a row to
    another person or system. The access-code tables (`access_codes`, `access_requests`) are the owner's
    alone — no role may make a code or let someone in — so they are the one exception to rule 8: not
    doctypes, hand-written policies on `private.owned_merchant_ids()`. `notifications` is the person's own,
    keyed on `user_id` like `profiles`.

---

## 1. The model

```
auth.users ──1:1── public.profiles                            the person
     │
     ├── public.merchants (owner_id)                          the tenant; its owner
     │        │
     │        ├── roles ── role_permissions (doctype × ptype)  what each role may do
     │        ├── role_profiles ── role_profile_roles
     │        ├── access_codes ── access_requests (user_id)      the owner's: codes, and who used them
     │        └── merchant_members (user_id) ── member_roles, user_permissions
     │
     ├── merchant_members.user_id, made when the owner approves a request
     └── notifications (user_id)                               the person's inbox

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

`private.owned_merchant_ids()` — the same shape, the merchants the caller owns and nothing else: what the
access-code tables' owner-only policies call (rule 13).

`private.effective_role_ids()` — the caller's roles in each merchant: the role profile's when the member
has one, else their own `member_roles`, plus the implicit `All`, minus disabled roles.

`private.permitted_merchant_ids(doctype, ptype)` — the owner's merchants always; otherwise the merchants
where an effective role's `role_permissions` row grants `ptype` on `doctype`.

`private.restricted_merchant_ids(allow, doctype)` / `private.allowed_record_ids(allow, doctype)` — the
merchants where a User Permission on `allow` restricts the caller under `doctype` (Apply To All, or
Applicable For that doctype), and the record ids of `allow` they may still see: each User Permission's
`for_value`, plus every record under it in a tree unless Hide Descendants. A restrictable master asks with
its own name twice (`'Warehouse', 'Warehouse'`); a linking table asks with the linked doctype and its own
(`'Warehouse', 'POS Invoice'`).

`public.doctype_links` — global and read-only like `doctypes`: which document types link to a restrictable
doctype, and through which column. `apply_doctype_policies` reads it, `private.validate_user_permission()`
holds an Applicable For to it, and the User Permission form lists from it.

**The seam's signature changed once** (Step 21, `20261012131350_access_for_documents.sql`, 2026-10-12): the
two restriction functions gained the document type, and `apply_doctype_policies` rewrote every call site in
that same migration — the five masters and each linking table. Applicable For cannot be answered without
knowing which document is being read. Rejected: a two-argument overload beside the one-argument functions
— two answers to one question, and a policy left on the old one would ignore Applicable For without failing.

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
         and (merchant_id not in (select private.restricted_merchant_ids('Fiscal Year', 'Fiscal Year'))
              or id in (select private.allowed_record_ids('Fiscal Year', 'Fiscal Year'))));
-- a linking table (doctype_links): one more clause per link column, on insert's with check too
--   and (merchant_id not in (select private.restricted_merchant_ids('Warehouse', 'POS Invoice'))
--        or warehouse is null
--        or warehouse in (select private.allowed_record_ids('Warehouse', 'POS Invoice')))
-- a linking doctype's rows (child): only those of a parent the caller may see
--   and exists (select 1 from public.pos_invoices p where p.id = pos_invoice_items.pos_invoice_id)
-- single (one row per merchant): select and update only
-- document: the record's four, plus the trigger private.guard_docstatus() — a signed-in role writes
--           drafts only (on a child table: guard_docstatus_child(), which reads its parent's docstatus)
-- ledger:   select only. Nobody inserts, updates or deletes — the owner included
```

**Submit and Cancel are permissions too** (`can_submit`, `can_cancel`; ptypes `submit` and `cancel`), and
no policy enforces them: `docstatus` cannot be written through a policy at all. `public.submit_document`
and `public.cancel_document` are the only way to move it — security definer, they find the document's
merchant, check `permitted_merchant_ids(doctype, 'submit' | 'cancel')` for the caller, lock the row, and
only then post or reverse. A ledger is written by that engine alone, which is why its doctype's rules are
Read and nothing else. The Role Permissions Manager offers each kind the columns that mean something for
it: all seven for a document, Read for a ledger, Read and Write for a single.

**Delete on a document means two things.** A draft is deleted through its policy, like any record. A
cancelled one goes only through `public.delete_document` — definer, the same merchant lookup and
`permitted_merchant_ids(doctype, 'delete')` check — because its ledger rows go with it and no role may
delete from a ledger. A return needs no permission of its own: it is a POS Invoice created and submitted, so
a Sales User refunds; undoing a sale is **Cancel**, which a cashier does not hold.

**What the device applies, the cashier must read.** A Pricing Rule is chosen on the device
(`src/features/pricing-rules/apply.ts`), so Sales User holds Read on Pricing Rule — as it does on Item
Price and Tax Rule. What a cashier may *give* is not a permission at all but the POS Profile's switches
(Allow User to Edit Rate, Allow User to Edit Discount, Ignore Pricing Rule) and the Item's Max Discount,
which `private.submit_pos_invoices()` holds whoever is selling — the owner included.

**A session is its cashier's.** A POS Opening Entry carries `user_id`, and the posters hold the line the
policies cannot: `private.submit_pos_invoices()` sells only inside the caller's own open session, and
`private.submit_pos_closing_entries()` lets the cashier close it — or whoever holds **Cancel** on POS Opening
Entry, for a session left open. A POS Profile that lists users is usable by them and the owner only
(`private.pos_profile_usable`). Rejected: a policy per cashier — every other member with Read still needs to
see the sessions and the sales.

**What a User Permission's link restricts** (the human's decision, 2026-10-12): a document or a ledger by
its own link — a POS Invoice, a Stock Entry, the Stock Ledger and the Stock Balance by Warehouse; the
General Ledger by Account and Cost Center — and the two masters that belong to one record, an Item by its
Item Group and a POS Profile by its Warehouse. An empty link passes. A default on a master (an Item's
Default Warehouse, a Tax Rule's Item Group, the Company's accounts) restricts nothing: ERPNext's "Ignore
User Permissions" on a field. Rejected: every table with any link — a cashier held to one warehouse would
lose the Tax Rules, Pricing Rules and Items the Register prices a sale with.

Scoped `to authenticated`, each call wrapped in `select` so it runs once as an InitPlan, and every
`update` policy carrying both `using` and `with check` — without the second, a row can be moved to
another merchant. Child tables (`role_profile_roles`, `member_roles`) take their parent's doctype.

## 6. How a member joins

With an **access code**, and only so (2026-10-14, `20261013213537_access_codes.sql`; ARCHITECTURE.md,
Access Codes). The owner makes codes (`public.create_access_codes`) and sends them outside the app; the
person types one in (`public.claim_access_code`), which leaves a pending `access_requests` row and tells the
owner; the owner approves or declines (`public.decide_access_request`), and approving inserts the
`merchant_members` row — with no role, its name, email and photo copied from the request. All three are
definer RPCs that check `(select auth.uid())` themselves; no client writes `access_codes`,
`access_requests` or `merchant_members` directly (rule 13).

Disabling a member drops the merchant from their `current_merchant_ids()` at once — every policy
follows. Removing them (Revoke, or Remove on the Users page) deletes their roles and User Permissions with
the row, and tells them.

Rejected, with reasons:
- **An invite by email** (`merchant_members` holding an address, claimed by `claim_membership` /
  `claim_memberships_for_user` when that confirmed address signed in — the model until 2026-10-14) —
  codes are the only way in, and a code needs no address the owner must know.
- **An insert policy on `access_codes`** — the owner could pick a code and read the unique violation as
  "this code exists" without the claim's rate limit.
- **A roles column on the member, no matrix** — the first custom role or changed rule needs a schema
  change; ERPNext's matrix is data.
- **Per-user policies** (`auth.uid() in (…)` on each table) — the shape the seam exists to prevent.
- **Invites through an Edge Function with the service key** (creating the account, sending mail) — more
  moving parts than a code, and the person signs in with Google or Facebook anyway.
- **Mirroring permissions only in the client** — the publishable key ships in the bundle; only RLS holds.

## 7. Still open

- **Which system a request is for** is the route's `[id]` — every query key carries `merchantId`, and
  a person in two systems sees both on the **Home** tab. An active-system store is not needed until
  something outside the shell needs it.
- **A helper held to one Item Group cannot read the groups above it**, so the Register's walk up the tree
  for an Item Group's Item Tax rows (`src/features/pos-invoices/setup.ts`) stops at their own group. It
  predates Step 21, which only made such a helper practical by filtering Items; named, not fixed.
- **A Stock Reconciliation follows no link**: its warehouses are on its rows, not on the document, and only
  a Stock Manager holds it.
- **The rows of a restrictable master** (an Item Group's Item Tax rows) are readable by whoever may read
  the doctype, whichever records they are held to — only a *linking* doctype's rows follow their parent.
