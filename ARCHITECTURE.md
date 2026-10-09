# Architecture

How this scaffold is laid out and how the session actually flows through it. Setup and dashboard
configuration live in [README.md](./README.md).

**Contents**

- [File map](#file-map)
- [The client — `src/lib/supabase.ts`](#the-client--srclibsupabasets)
- [Session storage — `src/lib/secure-storage.ts`](#session-storage--srclibsecure-storagets)
- [The session store — `src/Store/StoreUser.ts`](#the-session-store--srcstorestoreuserts)
- [The route guard — `src/app/_layout.tsx`](#the-route-guard--srcapp_layouttsx)
- [Sign-in paths — `src/lib/auth.ts`](#sign-in-paths--srclibauthts)
- [How a cancel reaches the app](#how-a-cancel-reaches-the-app)
- [The database — `supabase/`](#the-database--supabase)
- [Frontend wiring](#frontend-wiring)

---

## File map

```
src/lib/supabase.ts        client: typed with <Database>, secure storage, PKCE, AppState refresh
src/lib/secure-storage.ts  storage adapter: the iOS Keychain / the Android Keystore
src/lib/auth.ts            signInWithGoogle / signInWithFacebook / signOut / deleteAccount
src/lib/query.ts           QueryClient factory, STALE constants, onlineManager + focusManager
src/lib/columns.ts         useColumns, the pane widths, ShellWideContext — the shell's width decision;
                           useTableFits, a list's table-vs-rows choice
src/lib/errors.ts          failureMessage — the copy a failed action shows, never the provider's;
                           mutationNotice, the line under a form's buttons; postgrestError, its SQLSTATE
src/lib/dates.ts           stored dates ("YYYY-MM-DD"): display, today, a fiscal year's full-year end
src/lib/money.ts           ERPNext's money: Banker's / Commercial rounding, cash rounding to the
                           smallest coin, the number formats, the amount in words
src/lib/tree.ts            the tree masters' walks: children (a restricted branch shows at the top),
                           the path to a node, a node's subtree
src/lib/theme.ts           useAppTheme() for the Merchant colour keys
src/lib/icons.tsx          the icon name map ({ ios, android } symbols) and Paper's icon renderer
src/lib/database.types.ts  generated from the schema; regenerate whenever a migration lands
src/Store/StoreUser.ts     the session handler — one onAuthStateChange subscription
src/Store/picker.ts        the open searchable picker's options and callback, for the sheets/pick route
src/Store/confirm.ts       the open confirm's text and action, for the sheets/confirm route
src/themes.js              MD3 light/dark palettes + Merchant keys, roundness, spacing and radius
                           scales, the type scale
src/features/<resource>/   data only — queries.ts and schema.ts for merchants (the Company), fiscal-years,
                           profiles; members, roles, role-profiles, role-permissions (usePermissions,
                           can), user-permissions; system-settings, global-defaults, currencies;
                           accounts (ledgerOptions), cost-centers, accounts-settings,
                           modes-of-payment; tax-categories, sales-tax-templates (+ calculate.ts,
                           ERPNext's taxes_and_totals), item-tax-templates; read-only countries,
                           currency-presets, doctypes
src/screens/<screen>/      UI by screen — home (the systems list and the create-system form), setup
                           (the Setup index), company, fiscal-years, users, roles, role-profiles,
                           role-permissions, user-permissions, global-defaults, system-settings,
                           currency, chart-of-accounts, cost-centers, accounts-settings,
                           modes-of-payment, tax-categories, item-tax-templates (each list + form),
                           sales-tax-templates (list, a full-page template with its rows, the tax
                           preview), profile, sign-in
src/components/            one re-export per Paper primitive in use (text.tsx is the Text wrapper:
                           per-variant font-scale cap and iOS ramp), plus what more than one screen or a
                           sheet route draws: adaptive-dialog (+ FormActions, saveOnce),
                           remove-system-dialog, delete-account-dialog, placeholder-screen,
                           page-header, query-state, form-fields (+ ControlledChecklist),
                           search-select (+ ControlledSelect), country-currency-fields, record-list
                           (a Setup master's list), form-footer (PageForm, a full-page form),
                           confirm-dialog (+ useConfirm), folder-nav (the tree masters' folders),
                           repeatable-rows (a child table inside its form) —
                           and the files frontend.md restores on first use: note-callout, header-title
src/app/_layout.tsx        PaperProvider + QueryProvider + the two-state route guard
src/app/sign-in.tsx        renders the sign-in screen
src/app/(app)/_layout.tsx  signed-in group: tabs, systems/, create-system, the sheets/ routes (native
                           formSheet: confirms, the picker) and the forms/ routes (a small form: a
                           page narrow, a transparentModal Dialog wide) beside them, anchored on tabs
src/app/(app)/(tabs)/      home, notifications, settings, account + the NativeTabs bar
src/app/(app)/systems/[id]/ the merchant shell — _layout (header + rail/drawer), Home, and setup/, a
                           Stack of its own: the index and one route per Setup page; chart-of-accounts
                           and cost-centers push themselves once per folder (`parent`)
app.config.ts              derives the Google iOS URL scheme from .env
supabase/migrations/       profiles, merchants, current_merchant_ids, the signup trigger,
                           delete_current_user and rls_auto_enable — whose event trigger hosted
                           Supabase refuses to install — the history of the business schema that
                           20261008050254_revamp_drop_business_schema.sql dropped, then the POS
                           foundation: 20261008101635_company_and_fiscal_year.sql,
                           20261008145056_users_and_access.sql, 20261008151723_defaults_and_money.sql,
                           20261008152613_chart_of_accounts.sql, 20261009004357_accounting_defaults.sql,
                           20261009004450_modes_of_payment.sql, 20261009091028_taxes.sql
supabase/reverts/          one revert per migration, same filename — never inside migrations/
supabase/all-in-one/       add.sql + revert.sql, generated by tools/build-migrations.mjs
.claude/instruction_mds/   conventions for what is built on the scaffold — structure, data layer,
                           tenancy, frontend, migrations, testing workflow, acceptance tests,
                           token budget. See CLAUDE.md §2. The one tracked directory in .claude/
.claude/tests/<screen>.md  plain-language acceptance scripts the human testers run on a device, one
                           file per screen — written by the agent, never run by it; gitignored,
                           local (.claude/instruction_mds/acceptance-tests.md)
patches/                   patch-package diffs, applied by the postinstall hook
.oxlintrc.json             oxlint config: rule list + the local plugin it loads, and the overrides
                           that turn no-design-literals on for src/** and off for src/themes.js, and
                           refuse a react-native-paper import outside src/components/
tools/oxlint/anti-slop/    that plugin — TypeScript rules, not shipped in the app bundle
tools/build-migrations.mjs     npm run build:migrations / check:migrations — writes and checks all-in-one/
tools/fallow-verdict.mjs       runs fallow's review gate and prints a compact verdict, not the raw JSON
tools/check-logic.mjs          npm run check:logic — asserts the pure date math against Postgres' own,
                               the money module and the tax calculation against ERPNext's results,
                               and the tree walks
```

---

## The client — `src/lib/supabase.ts`

One client for every platform:

```ts
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage: secureStorage,  // the iOS Keychain / the Android Keystore, never plaintext
    flowType: 'pkce',        // default is 'implicit' — this is what returns ?code=
    debug: __DEV__,          // the only instrument that reaches inside detectSessionInUrl
  },
});
```

The `<Database>` generic comes from the generated `src/lib/database.types.ts`, and it is what makes
every `.from('merchants').select()` typed end to end from the real schema — which is why no Zod
schema mirrors a migration anywhere in this project ([.claude/instruction_mds/data-layer.md §4](./.claude/instruction_mds/data-layer.md)).
Regenerate it whenever a migration lands.

Three options, and every one of them does work. `storage` is load-bearing twice over: without it
the client falls back to an in-memory adapter and the session dies with the process, and what it
points at decides whether the refresh token sits in plaintext.

### What is deliberately not here

It matters as much, because current tutorials all add it:

- **No `persistSession` / `autoRefreshToken`.** Both are already the defaults.
- **No `detectSessionInUrl`.** The library gates it on `isBrowser()`, which is
  `typeof window !== 'undefined' && typeof document !== 'undefined'`. React Native has no
  `document`, so the option is already inert here whatever it is set to. `browserOAuth` in
  `auth.ts` does the exchange by hand instead.
- **No `lock: processLock`.** It is `@deprecated` in 2.112.3 and the legacy lock path is removed
  in v3. The client single-flights refreshes itself now and lets the GoTrue server resolve
  cross-tab races; setting it opts back into the old path.
- **No `react-native-url-polyfill`.** Every `new URL(...)` in `auth-js` reads
  `window.location.href` behind an `isBrowser()` guard, so native never reaches one.

### The `AppState` listener

An `AppState` listener starts and stops the refresh timer. That is not redundant with
`autoRefreshToken` — on a non-browser platform the library's refresh loop otherwise runs
*continuously in the background*.

---

## Session storage — `src/lib/secure-storage.ts`

Three methods — `getItem`, `setItem`, `removeItem` — which is the whole of `SupportedStorage`.
All three call `expo-secure-store`, on every platform this app runs on.

**Why not AsyncStorage on native.** It is not encrypted: an ordinary SQLite row on Android, an
ordinary file in the app container on iOS. Filesystem access on a rooted or jailbroken device, or
an unencrypted device backup, yields the refresh token — and that alone mints access tokens until
someone revokes it. SecureStore puts the same string behind the iOS Keychain and the Android
Keystore.

**`keychainAccessible: AFTER_FIRST_UNLOCK`**, not the `WHEN_UNLOCKED` default, under which any read
while the device is locked fails outright. The `AppState` listener above already stops refreshing
in the background, so this deletes a failure mode rather than depending on that ordering holding.
The item still never leaves the device: `expo-secure-store` never sets `kSecAttrSynchronizable`, so
iCloud Keychain does not carry it.

**No chunking**, which other scaffolds add to stay under a 2048-byte limit. That limit belonged to
the RSA hybrid encryptor, kept only as a read path for Android API 22 and below — beneath SDK 57's
floor. The live write path is AES into SharedPreferences, and `setItemAsync` checks only that the
value is a string. Splitting a session across keys now buys nothing and adds a torn-write window.

Keys need no escaping either: SecureStore validates them against `/^[\w.-]+$/`, and every key
`auth-js` writes is the storage key plus a suffix — `-user`, `-code-verifier`,
`-flows-code-verifier`, `-flow-<32 hex>-code-verifier`.

---

## The session store — `src/Store/StoreUser.ts`

A single `onAuthStateChange` subscription, subscribed at module scope, is the source of truth. It
fires with `INITIAL_SESSION` (restored from storage) shortly after subscribing, so no separate
`getSession()` call is needed — a second source could disagree with the first.

The session has **three** states, not two:

| State | Meaning |
| --- | --- |
| `undefined` | until the first event arrives |
| `null` | once resolved and signed out |
| `Session` | once signed in |

`isLoading` is derived (`session === undefined`), never stored, so the two cannot desync.

---

## The route guard — `src/app/_layout.tsx`

`PaperProvider` over two mutually exclusive route states:

```tsx
<Stack.Protected guard={!session}><Stack.Screen name="sign-in" /></Stack.Protected>
<Stack.Protected guard={!!session}><Stack.Screen name="(app)" /></Stack.Protected>
```

**No router call ever crosses that boundary.** Sign-in and sign-out only change the session, and the
guards move the user; there is no `router.replace` to a signed-in route anywhere. Ordinary
navigation *inside* the signed-in tree is normal — tapping a SystemCard pushes `systems/[id]`, the
app bar navigates to the account tab — but nothing navigates its way past the guard. The layout
renders `null` while the session is unknown, so the splash screen covers the restore and the sign-in
screen never flashes.

Under the `(app)` guard the tree splits once more: `(tabs)` owns the four bottom-bar destinations,
and `systems/[id]` sits beside it rather than inside it, so opening a system pushes *over* the bar
instead of becoming a fifth tab.

`systems/[id]` is the merchant shell: one expo-router `Drawer`, a permanent rail on a wide window
and an off-canvas drawer on a narrow one. It holds two destinations: Home, which renders nothing yet,
and Setup — a `Stack` of its own (`systems/[id]/setup/`), whose index lists the company's foundation
records on ERPNext's model and pushes each one; a tap on Setup in the rail always lands on that index.
A small form opened from Setup (a fiscal year) is a `forms/` route of the `(app)` stack instead: a
full page on a phone, and on a tablet a `transparentModal` whose whole content is a Dialog, so the
list it was opened from stays visible under the backdrop. The header's
**Your systems** action is `router.dismissTo('/')`, the way out of a system — Back alone is not
enough, because on a phone the front drawer opens from the same left edge iOS pops a screen from.
`(app)/_layout.tsx` anchors the stack on `(tabs)`, so a deep link into a system still has the
systems list underneath. Profile is the Account tab only; on a tablet, where the tab bar is hidden,
the systems list's account icon switches to it. Signing out or deleting the account there is a guard
flip like anywhere else — the whole `(app)` history goes, with no router call.

The guard is **UX, not security** — expo-router evaluates it client-side only, and the signed-in
bundle is on the device either way. Supabase RLS is the real boundary, which is what the policies
under [The database](#the-database--supabase) are for.

---

## Sign-in paths — `src/lib/auth.ts`

| Provider | Path |
| --- | --- |
| Google | native sheet → `signInWithIdToken` |
| Facebook | system browser → `exchangeCodeForSession` |

The Google path never opens a browser, never uses `redirectTo`, and never touches PKCE — so if
Google sign-in fails, no redirect configuration can be the cause.

The browser path uses `WebBrowser.openAuthSessionAsync`, which watches for `redirectTo` as a
prefix and closes the browser the moment a navigation matches, then parses the returned deep link
with `Linking.parse`.

`signOut` uses `scope: 'local'`. The default `'global'` ends the session on every device the user
is signed in on, and it is a server call, so it throws when offline — stranding someone signed in.
It also clears the native Google session, which Supabase leaves cached; without that the next
sign-in silently reuses the last account instead of showing the picker.

`deleteAccount` calls the `delete_current_user` RPC and then `signOut`. The deletion has to happen
in Postgres because no client-side key may write to `auth.users` — see
[The database](#the-database--supabase).

---

## How a cancel reaches the app

It arrives two different ways, and both are handled.

- **Cancel *inside* the provider's dialog** is a normal redirect back through Supabase carrying
  `error=access_denied` — the prefix matches, so the browser closes and reports success. Reading
  `error_description` there would put Facebook's literal "Permissions error" on screen for someone
  who just changed their mind, so `browserOAuth` checks for `access_denied` first and resolves
  `'cancelled'` quietly.
- **Dismissing the browser *itself*** is the other path, and it is not redundant: on Android a
  genuine user cancel arrives that way too, which is also why it only logs a warning rather than
  throwing — a Supabase allow-list miss is indistinguishable from a dismiss at that point.

---

## The database — `supabase/`

`public.profiles`, the person; `public.merchants`, the tenant; plus the event trigger that would
auto-enable RLS (not installable on the hosted project — see below), and two migrations that only
drop: leftovers from an unrelated project, and the business schema (below). Then the POS foundation,
one migration per ERPNext step: the Company and its fiscal years, Users & Access, Defaults & Money,
the Chart of Accounts with Cost Centers, Accounting Defaults, Modes of Payment, and Taxes (the last
sections).

`public.profiles` has `id` referencing `auth.users` with `on delete cascade`, `display_name`,
`avatar_url`, `created_at` — plus its policies, a trigger that fills the row on signup, and the
function behind the **Delete account** button.

There is no `email` column. `auth.users.email` is the source of truth and the client already holds
it as `session.user.email`; a copy would go stale on the first address change and need a second
trigger to keep in step.

### `public.merchants` — the tenant

`id`, `owner_id` referencing `auth.users` with `on delete cascade`, `name` (1–80 characters once
trimmed, a check constraint), `created_at`, and the Company's own fields: `abbr`, `country_code`,
`default_currency` (last section). The 2026-10-08 teardown dropped its category, address, contact
email, phone and currency columns. The cascade is what lets `delete_current_user()` stay one
statement: deleting the `auth.users` row takes the profile and every merchant with it.

**A merchant is a business, not a person**, and each one is what the UI calls a "system" — the cards
on the home screen are this table. `owner_id` is the owner — ERPNext's Administrator, never restricted
and never removed; everyone else is a row of `merchant_members` (Users & Access, below), and the model
is in [.claude/instruction_mds/tenancy.md](./.claude/instruction_mds/tenancy.md).

Its policies: select for the owner or a member (`(select auth.uid()) = owner_id or id in (select
private.current_merchant_ids())` — the owner clause on the row itself, because the function is
`stable` and its snapshot cannot see a row the same `insert … returning` just wrote); update for
whoever holds Company write (`permitted_merchant_ids('Company', 'write')`); insert and delete for the
owner only. `merchants_keep_owner` refuses any change of `owner_id`.

Unlike `profiles`, it has a delete policy: removing one of your own businesses is an ordinary
action, not account deletion.

### `private.current_merchant_ids()` — the seam

`security definer`, `stable`, returning the merchant ids the caller owns plus those where they are an
enabled, claimed member. `authenticated` keeps `usage` on `private` and `execute` on it and on the
permission functions below so policies can call them
([.claude/instruction_mds/tenancy.md §4](./.claude/instruction_mds/tenancy.md)).
It was written before any caller on purpose, and Users & Access proved the point: staff arrived by
rewriting this body and adding `permitted_merchant_ids()` beside it — no table alterations. Business
tables now call `permitted_merchant_ids()`, which builds on it (below).

### The policies

Scoped `to authenticated`, so they are never evaluated for `anon` at all. Every `auth.uid()` is
wrapped as `(select auth.uid())` — unwrapped it runs once per row scanned, wrapped the planner runs
it once as an InitPlan. `profiles_update_own` carries both `using` and `with check`: `using`
decides which rows may be updated, `with check` what they may be updated *to*, and without the
second a user could hand their row to somebody else by rewriting its `id`.

No delete policy — the row goes when the account does, through the cascade.

The table is deliberately **not** `force row level security`. Forcing it subjects the table owner
to the policies too, and the signup trigger inserts as the owner at a moment when there is no JWT,
so `auth.uid()` is null and `profiles_insert_own` would reject the row signup exists to create.

### The `security definer` functions

`private.handle_new_user()` creates the profile row on signup, reading `full_name` and `avatar_url`
out of `raw_user_meta_data` where both providers land them. `public.delete_current_user()` deletes
the caller's own `auth.users` row, which cascades. `private.current_merchant_ids()` is described
above; the permission engine, the claim triggers, the tree and user-permission validators and each
step's `seed_*` trigger function are in the step sections below. `public.my_permissions()` is the one
definer function besides `delete_current_user()` that PostgREST serves, and it answers only for a
system the caller belongs to.

`security definer` means the body runs with the *owner's* privileges, not the caller's — a
deliberate privilege escalation, which is why all three of these are mandatory every time:

| | Stops |
| --- | --- |
| `private` schema, or `revoke execute` | The function being called over PostgREST at `/rest/v1/rpc/<name>` by anyone holding the publishable key |
| `set search_path = ''` + a fully-qualified body | The caller pointing an unqualified name at their own object and having it run as the owner |
| A `(select auth.uid())` check inside the body | The function doing anything for a caller beyond their own rows |

The revokes name `public, anon, authenticated, service_role` individually rather than just `PUBLIC`
because Supabase ships default privileges that grant `EXECUTE` on new functions in `public` to the
last three **directly**. Revoking from `PUBLIC` alone leaves three live grants behind.

Revoking `EXECUTE` does not break the signup trigger: Postgres checks that privilege when a trigger
is *created*, not each time it fires.

### RLS is per-table, and still written by hand

`alter table … enable row level security` is set explicitly for every table — `profiles`,
`merchants`, the reference data, and each foundation step's — and every migration added later must
carry that line for its own tables. The policies themselves are no longer hand-written per business
table: `private.apply_doctype_policies()` writes them (Step 11, below; CLAUDE.md §6.7). A new table in `public` is served over HTTP by
PostgREST the moment it exists. The dashboard's Security Advisor reports the ones missing it under
`rls_disabled_in_public`.

`20260902000003_rls_auto_enable.sql` was meant as a second line of defence: a DDL event trigger,
`ensure_rls`, that enables RLS on every table subsequently created in `public`. It does not replace
the explicit line, for two reasons its header spells out.

Creating an event trigger needs superuser, and the `DO` block around it warns and continues instead
of failing. On this project's hosted database that is not a risk but the outcome: the hosted
`postgres` role is not a superuser, `create event trigger` fails with `permission denied`, and the
trigger is **not installed** (verified 2026-09-13). `private.rls_auto_enable()` exists with nothing
calling it; the trigger works only on a local `supabase start` stack.

And it is invisible: `\d` does not mention it, the table's own migration does not mention it, and an
unexpectedly empty query result leads nowhere near it.

The function behind it lives in `private` and is revoked from `public, anon, authenticated,
service_role`, for the reasons in the section above.

### The business schema, dropped — `20261008050254_revamp_drop_business_schema.sql`

The product catalogue, suppliers, the stock ledger and the Register's sales (`20260914092147` through
`20261004120000`) were dropped on 2026-10-08, rows included, when the app was cut back to the systems
list ahead of a rebuild on ERPNext's model. Their migrations and reverts stay as history, so
`add.sql` still builds them on a fresh project before the drop removes them. Their design notes are in
git (`git show 07bd7aa:ARCHITECTURE.md`).

### The POS foundation, Step 1 — `20261008101635_company_and_fiscal_year.sql`

The rebuild follows ERPNext's setup order (`.claude/erpnext-docs/POS-System-Only-Features.md`), one
migration per step. A system **is** its company — multi-company is out of scope — so ERPNext's
Company fields are `merchants` columns (tenancy.md rule 9):

- `abbr` — 1–10 characters, no spaces (`merchants_abbr_shape`). ERPNext appends it to account, cost
  center and warehouse names; here it will be *displayed* after them, never stored in them, so
  editing it renames nothing. Systems that already existed got their name's initials.
- `country_code` → `public.countries`, `default_currency` → `public.currency_presets`. Existing
  systems got the Philippines and the peso, this app's defaults before the teardown.

`countries` (250) and `currency_presets` (144) are reference data seeded from frappe's
`geo/country_info.json` — the file ERPNext seeds its own Country and Currency records from. RLS on, a
select policy for `authenticated` and nothing else: only a migration writes them. A currency several
countries define differently takes its issuer's definition (USD from the United States).

`public.fiscal_years` — `year` (the name, "2026" or "2026-2027"), `year_start_date`,
`year_end_date`, `is_short_year`, `is_default`, `disabled`. The database holds ERPNext's rules, so no
client can break them:

| Constraint | Rule |
| --- | --- |
| `fiscal_years_length` | a full year ends the day before the same date a year on; a short year (a transition period) ends sooner |
| `fiscal_years_no_overlap` | `exclude using gist` on `daterange(start, end, '[]')` per merchant (`btree_gist`) — a posting date belongs to one year |
| `fiscal_years_year_unique` | one name per merchant |
| `fiscal_years_one_default` | a partial unique index: one default per merchant |

Making a year the default is one update: the `fiscal_years_single_default` trigger
(`private.fiscal_years_single_default()`, security *invoker*, so RLS still decides) clears the old
default in the same statement. Policies are the membership shape (tenancy.md §5).

Seeding: `merchants_seed_10_company` runs `private.seed_company()` after a merchant insert and creates
the current calendar year as the default — "current" in the country's first time zone, so a system
made on New Year's Eve in Manila gets Manila's year. Every later step adds its own
`merchants_seed_NN_<area>` trigger; Postgres fires them in name order. The migration backfilled a
year for the systems that existed.

### Step 11, Users & Access — `20261008145056_users_and_access.sql`

ERPNext's permission model, enforced by RLS rather than mirrored in the client
(docs.frappe.io/erpnext/role-based-permissions, /user-permissions, /role-and-role-profile):

| Table | Holds |
| --- | --- |
| `doctypes` | the registry: each document type, its table, its kind (`record`, `single`, `tree`), whether a User Permission may restrict it. Global, read-only, written by migrations |
| `standard_role_permissions` | ERPNext's standard matrix: role × doctype × select/read/write/create/delete. Global, read-only; copied into each system |
| `roles` | per system: the ten standard roles (`All` implicit) and custom ones. `guard_roles` refuses renaming or deleting a standard role, and disabling `All` |
| `role_profiles`, `role_profile_roles` | a named set of roles given together |
| `merchant_members`, `member_roles` | a person invited by email (lower-cased, one per system); `user_id` is filled when that confirmed address signs in |
| `role_permissions` | the system's own, editable matrix — what the Role Permissions Manager edits |
| `user_permissions` | a member held to one record of a restrictable doctype: Apply To All or one Applicable For, Is Default, Hide Descendants (trees) |

**The engine**, all in `private`, `security definer`, `stable`:
- `effective_role_ids()` — the profile's roles when a profile is set, else the member's own, plus `All`,
  minus disabled roles.
- `permitted_merchant_ids(doctype, ptype)` — the owner's systems always; otherwise systems where an
  effective role's rule grants that permission. **Every business policy calls this**, shaped
  `merchant_id in (select private.permitted_merchant_ids('Fiscal Year', 'read'))` (an InitPlan, once
  per statement).
- `restricted_merchant_ids(doctype)` and `allowed_record_ids(doctype)` — a restrictable table's policies
  add `and (merchant_id not in restricted or id in allowed)`; for a tree, `allowed` walks the records
  under each permitted one unless Hide Descendants.

`private.apply_doctype_policies(table, doctype, child)` writes a table's four policies from its
doctype's kind and restrictability, so every table gets the same shape; `sync_standard_permissions()`
copies new template rows into every system after a migration adds some.

**Invites need no email.** `claim_membership` (on `merchant_members`) and `claim_memberships_for_user`
(on `auth.users`) match a member's email to a *confirmed* `auth.users` address in either order.
Inviting the owner's own address is refused (`member_is_owner`), and an active member's email cannot
change (`member_email_locked`).

The client reads `public.my_permissions(merchant)` (definer, membership-checked) to hide what RLS would
refuse anyway; `save_member`, `save_role_profile` and `save_role_permissions` are security *invoker*
RPCs that write a record and its child rows in one transaction, under the caller's own policies.
`merchants_seed_20_access` seeds roles and the matrix.

### Step 2, Defaults & Money — `20261008151723_defaults_and_money.sql`

Three singles and a record (docs.frappe.io/erpnext/system-settings, /global-defaults, /currency):

- `system_settings` (one row per system): `time_zone` (checked against `pg_timezone_names` by
  `validate_time_zone`), `number_format` (ERPNext's list, `private.is_number_format`),
  `float_precision` and `currency_precision` (0–9), `rounding_method` (Banker's or Commercial).
- `global_defaults` (one row per system): `disable_rounded_total`, `disable_in_words`. ERPNext's Default
  Company, Country and Currency are the merchant's own columns.
- `currencies`: one per currency a system uses, seeded from `currency_presets` — symbol and side,
  fraction and units, smallest coin, number format. `merchants_company_currency` keeps a row for
  `default_currency` when it changes. Multi-currency is out of scope: today it is the base currency.

`merchants_seed_30_defaults` seeds them from the country: its first time zone (UTC when Postgres does
not know it), its number format. The arithmetic itself is the client's: `src/lib/money.ts`.

### Step 3, Chart of Accounts and Cost Centers — `20261008152613_chart_of_accounts.sql`

Two trees (docs.frappe.io/erpnext/chart-of-accounts, /cost-center), each row a group (a folder) or a
ledger, with a composite `(parent_id, merchant_id)` foreign key so a parent is always of the same
system:

- `accounts`: `account_name`, `account_number`, `is_group`, `root_type` (Asset, Liability, Equity,
  Income, Expense), `account_type` (checked against its root type — `accounts_type_fits_root`),
  `disabled`. Names are stored bare; " - ABBR" is displayed, never stored.
- `cost_centers`: `cost_center_name`, `cost_center_number`, `is_group`, `disabled`; one root per system
  (`cost_centers_one_root`), named as the company.

`private.validate_tree()` (definer, so a User Permission hiding children cannot hide them from the
check) holds the tree rules for both: a parent is a group, nothing sits under itself, a group with
children stays a group, a root is a group, an account takes its parent's root type and keeps it while
it has children, and the company's cost center goes only with the system. Deleting a record with
children fails on the foreign key (`23503`).

Both doctypes are trees and restrictable. `merchants_seed_40_accounting` seeds ERPNext's standard chart,
cut to what a POS posts to (Cash, Stock In Hand, Sales, Cost of Goods Sold, Duties and Taxes, Write Off,
Round Off, Stock Received But Not Billed, Temporary Opening …, 32 accounts), and the company's cost
center with Main under it. Receivable, Payable and fixed-asset accounts are not seeded: Customer,
Supplier and Fixed Assets are out of scope.

### Step 4, Accounting Defaults and Perpetual Inventory — `20261009004357_accounting_defaults.sql`

docs.frappe.io/erpnext/company-accounting-defaults, /perpetual-inventory, /accounts-settings. The Company's
defaults are `merchants` columns (tenancy.md rule 10), shown as the Company screen's **Accounts** and
**Stock** sections:

- the fallbacks when an item, warehouse, mode of payment or row names none — Default Cash, Bank, Income
  and Expense Account, Default Cost Center, Write Off, Round Off, Round Off Cost Center;
- `enable_perpetual_inventory` (on) and its four accounts: Default Inventory, Stock Adjustment, Stock
  Received But Not Billed, Expenses Included In Valuation. On without an inventory account only warns, as
  ERPNext does — a warehouse's own account can still serve (4.3).

Each is a composite foreign key `(<column>, id) → accounts (id, merchant_id)` (or `cost_centers`), NO
ACTION: deleting a system takes its accounts and row in one statement; deleting an account a default
names fails `23503`, which the Chart of Accounts reads as "in use". `private.validate_company_accounts()`
(definer, so a User Permission cannot hide the account from it) holds each changed default to an enabled
ledger of ERPNext's filter: Cash → type Cash, Bank → Bank, Income → root Income, Expense / Write Off /
Round Off → root Expense, the stock four → their own types, cost centers → ledgers. Receivable, payable and
exchange-gain/loss defaults are out of scope.

`accounts_settings` (a single): Unlink Payment on Cancellation, Delete Ledger Entries with the document,
Immutable Ledger (on), Discount Accounting, Taxes from Item Tax Templates, Accounts Frozen Till Date and the
role allowed past it (`on delete set null`). Nothing posts yet; the POS Invoice will read them. The `All`
role gains Select on Role — ERPNext's permission for a link field — so whoever edits it can pick that
role. `merchants_seed_50_accounting_defaults` fills the defaults from the seeded chart by name and type, and
the backfill did the same for existing systems.

### Step 5, Modes of Payment — `20261009004450_modes_of_payment.sql`

docs.frappe.io/erpnext/mode-of-payment, /bank-accounts-and-modes-of-payment. `modes_of_payment`: name,
type (Cash, Bank, General, Phone), enabled, and one `default_account` — ERPNext's per-company Accounts row,
collapsed to a column for a single company. `private.validate_mode_of_payment_account()` holds it to an
enabled Cash ledger for Cash, Bank for Bank, either for General and Phone: the docs' point that calling a
mode Cash does not make its ledger a cash account. Bank and Bank Account (5.1) are the form's help text,
not tables. `merchants_seed_60_payments` seeds Cash (on the Cash ledger) and Credit Card (Bank, no account
until a bank or clearing ledger exists).

### Step 6, Taxes — `20261009091028_taxes.sql`

docs.frappe.io/erpnext/setting-up-taxes, /tax-category, /sales-taxes-and-charges-template, /item-tax-template,
/types-in-tax-template, /tax-inclusive-accounting. Sales side only — purchase templates need a Supplier.

| Table | Holds |
| --- | --- |
| `tax_categories` | a named tax treatment (Standard, Exempt …), no rate of its own |
| `sales_tax_templates` + `sales_tax_template_rows` | the rows a sale gets, in calculation order: type (Actual, On Net Total, On Previous Row Amount, On Previous Row Total, On Item Quantity), account, description, rate or fixed amount, Reference Row #, included in the price, cost center. One default per system (`sales_tax_templates_single_default` clears the old one, invoker); a disabled template is never the default; one **enabled** template per tax category |
| `item_tax_templates` + `item_tax_template_rows` | a different rate, or Not Applicable, per tax account, for the items it will be linked to (Step 9) |

ERPNext's save-time checks are the database's: the row's own rules are check constraints (a reference only
on a previous-row type and only to an earlier row; Actual never included); `private.validate_tax_account()`
(definer) holds each row's account to an enabled Tax / Chargeable / Income Account / Expense Account /
Expenses Included In Valuation ledger and a sales row's cost center to a ledger; the cross-row rule (an
included tax calculated on an earlier row needs that row — or every row up to it — included too) is
`private.validate_tax_row_references()`, a **deferred** constraint trigger, so the save that replaces all rows
is checked once they are in place. Templates save through `public.save_sales_tax_template` /
`save_item_tax_template` (invoker), parent and rows in one transaction. Deleting an account or tax category
a template uses fails `23503` ("in use").

`merchants_seed_70_taxes` does what ERPNext's setup wizard does for the company's country:
`public.tax_presets` holds the simple-format entries of ERPNext's `country_wise_tax.json` (212 templates, 165
countries; Australia, France, Germany and Sweden have only a chart-specific format there and get none). Each
preset's ledger goes under **Duties and Taxes**, with a Sales Taxes and Charges Template of one On Net Total row
(described "VAT @ 12", tagged with the company's cost center) and an Item Tax Template of the same title — a
Philippine system gets **VAT** and **Philippines Tax**, 12%, added on top of the price. Existing systems were
backfilled.

The arithmetic is `src/features/sales-tax-templates/calculate.ts`, ERPNext's `taxes_and_totals` without
discounts: inclusive back-calculation, the five types per item, an Item Tax Template's rate by account, an
Actual amount spread by net amount, running totals. The template page's Preview runs it on a sample line; the
POS Invoice will run the same module.

---

## Frontend wiring

The UI rules themselves are in [.claude/instruction_mds/frontend.md](./.claude/instruction_mds/frontend.md). What
follows is only how the tree is put together.

`src/themes.js` holds the two MD3 palettes and reaches every screen through `PaperProvider`, so a
color is read from the theme rather than written at a call site. The handful of places a color is
chosen by hand are all destructive or category actions reading `useAppTheme().colors.error` /
`onError` — **Delete account** and **Sign Out** in `src/screens/profile/index.tsx`, and **Remove**
on `src/screens/home/system-card.tsx` — plus the merchant shell, whose header and rail sit on
`primary` and mark the active item with `accent`, and the native views (`NativeTabs`, sheets,
`Pressable` ripples), which take every colour as a prop because `PaperProvider` does not reach them.

`src/app/(app)/_layout.tsx` provides `ShellWideContext` (`src/lib/columns.ts`) — the one wide/narrow
decision, `useWindowDimensions().width >= WIDE_MIN`, read once for the shell, the `(tabs)` bar, and the
`sheets/` routes alike (frontend.md §4.1).

### The data layer

`src/lib/query.ts` builds the `QueryClient` (`retry: false`, `refetchOnWindowFocus: false`) and, at
module scope, wires the two managers React Native has no events for: `onlineManager` from
`expo-network`, and `focusManager` from `AppState`. That `AppState` listener is **not** the one in
`supabase.ts` — this one reports foreground to React Query, that one starts and stops token refresh.
Both exist.

`src/app/_layout.tsx` mounts `QueryProvider` **keyed on `session?.user.id`**. The key is the whole
point: switching accounts remounts the provider, which builds a new client and drops the old cache.
RLS does not help here — cached rows are already on the device and render before any request goes
out.

Feature folders are keyed on the **resource**, never on the page or screen that happens to use them
([.claude/instruction_mds/structure.md §3](./.claude/instruction_mds/structure.md)). `src/features/merchants/queries.ts` is the only file
in the app that knows the table is called `merchants`.

What a person may do in a system comes from `usePermissions({ merchantId })`
(`src/features/role-permissions/queries.ts`, the `my_permissions` RPC) and `can(permissions, doctype,
ptype)`. Screens use it only to hide what RLS would refuse — a Setup row, a **New** or **Save** button,
a field left editable; the policies stay the boundary. Saving roles, members or rules invalidates it.

Paper's icons go through `PaperProvider`'s `settings` prop in `src/app/_layout.tsx` to
`renderIcon` (`src/lib/icons.tsx`), which draws each app icon name as the platform's own symbol with
`expo-symbols` and falls back to MaterialCommunityIcons for Paper's internal names and the brand logos.
Paper's own default goes through `react-native-vector-icons`, whose font files nothing here loads, so
icons would render as blank boxes. `react-native-vector-icons` stays in `package.json` because Paper
imports it internally regardless of the override.
