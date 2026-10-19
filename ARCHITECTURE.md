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
src/lib/dates.ts           stored dates ("YYYY-MM-DD"): display, today, a fiscal year's full-year end;
                           displayDateTime, an instant in the device's words
src/lib/money.ts           ERPNext's money: Banker's / Commercial rounding, cash rounding to the
                           smallest coin, the number formats, the amount in words
src/lib/tree.ts            the tree masters' walks: children (a restricted branch shows at the top),
                           the path to a node, a node's subtree
src/lib/barcode.ts         which of the camera's barcode reports count: three frames agreeing, and a repeat
                           only at the Register after 2 s out of view
src/lib/files.ts           the device's file pickers (expo-file-system): the text of a picked file,
                           a text file saved into a picked folder, and a picked image's address
src/lib/theme.ts           useAppTheme() for the Merchant colour keys
src/lib/icons.tsx          the icon name map ({ ios, android } symbols) and Paper's icon renderer
src/lib/database.types.ts  generated from the schema; regenerate whenever a migration lands
src/Store/StoreUser.ts     the session handler — one onAuthStateChange subscription
src/Store/picker.ts        the open searchable picker's options and callback, for the sheets/pick route
src/Store/confirm.ts       the open confirm's text and action, for the sheets/confirm route
src/Store/ledger-filters.ts what each ledger report is narrowed to, for the forms/ledger-filters route
src/Store/cart.ts          the Register's cart, one per session — shared by the Register and Cart pages
src/Store/scan.ts          the open product scan's mode and callbacks, for the scan route
src/themes.js              MD3 light/dark palettes + Merchant keys, roundness, spacing and radius
                           scales, the type scale
src/features/<resource>/   data only — queries.ts and schema.ts for merchants (the Company), fiscal-years,
                           profiles; access-codes (+ code.ts: a code's shape, its status, its expiry
                           and the claim's answers), access-requests, notifications (the unread count,
                           and what a new one makes the app fetch again); members (an employee's role
                           and exceptions, + the owner's members across systems), roles (+ save_role and
                           the colour palette's keys), permissions (the catalog; access.ts: can, has, a
                           destination's rule, requirements and exceptions, import-free), role-permissions
                           (usePermissions, which every screen imports); system-settings, global-defaults, currencies;
                           accounts (ledgerOptions), accounts-settings,
                           modes-of-payment; tax-categories, sales-tax-templates (+ calculate.ts,
                           ERPNext's taxes_and_totals), item-tax-templates; warehouses
                           (inventoryAccount), uoms, uom-conversion-factors, price-lists, brands;
                           item-groups, selling-settings, tax-rules (+ resolve.ts, the rule a sale
                           takes), stock-settings; naming-series, print-formats (+ receipt.ts, what a
                           receipt prints), letter-heads, print-settings; items (+ csv.ts, what a CSV file
                           of items holds and what is wrong with it; label.ts, a product label's lines
                           read into an item's fields), item-prices
                           (+ resolve.ts, the rate a sale line takes); pricing-rules (+ apply.ts, the
                           rule a cart line takes and its rate); pos-profiles (a register's
                           settings and its child tables); pos-opening-entries, pos-invoices (+ cart.ts,
                           the sale a cart becomes, and setup.ts, the records it reads) and
                           pos-closing-entries; dashboard (its four reports, and its periods in
                           period.ts); documents (submit and cancel
                           for every document), stock-entries, stock-reconciliations; the ledgers
                           only a posting writes — gl-entries, stock-ledger-entries, bins; read-only
                           countries, currency-presets
src/screens/<screen>/      UI by screen — home (the systems list, its slot cards — Create New System,
                           Enter Access Code — the requests waiting for approval, and the create-system
                           form), access-codes (the Codes, Requests and Members panes, a new code, one
                           code, one request, Enter Access Code), notifications, setup
                           (the Setup index), stock (the Stock index), items (list + search, a
                           full-page item with its UOM and Item Tax rows), item-prices (list +
                           search, form), stock-entries and stock-reconciliations (list + a
                           document's page), stock-balance, stock-ledger, accounts (the Accounts
                           index), general-ledger, system-home (a system's first screen: why someone with
                           no role sees Home only), employees (the list, an employee's permissions, the
                           roles and a role's page, a tablet's two panes; editor/ holds the role and access
                           editors they share), company, fiscal-years, global-defaults, system-settings,
                           currency, chart-of-accounts, accounts-settings,
                           modes-of-payment, tax-categories, item-tax-templates, warehouses, uoms,
                           uom-conversion-factors, price-lists, brands (each list + form),
                           sales-tax-templates (list, a full-page template with its rows, Test
                           Template), item-groups (folders, a full-page group with its Item Tax rows),
                           tax-rules (list, form, Which Template?), selling-settings, pricing-rules
                           (the list, a full-page rule with what it applies on),
                           stock-settings, document-naming-settings (the list, a document's series,
                           Update Series), print-formats (list, a full-page format with its sample
                           receipt), letter-heads, print-settings, pos-profiles (list, a full-page
                           profile with its users, payment methods and item groups), sell (the Sell index
                           and the session box), pos-opening-entries (the list, Open Session), register
                           (the items, the cart and its payment), pos-orders (the list, a sale's receipt,
                           its return),
                           pos-closing-entries (the list, Close Session, one entry), dashboard (the period
                           switch, the number cards, sales per day, best sellers, stock alerts),
                           import-items (the template, a file's mistakes, the import and its log), scan
                           (the product scan: the camera, its barcodes, Read Label), profile, sign-in
src/components/            one re-export per Paper primitive in use (text.tsx is the Text wrapper:
                           per-variant font-scale cap and iOS ramp), plus what more than one screen or a
                           sheet route draws: adaptive-dialog (+ FormActions, saveOnce),
                           remove-system-dialog, delete-account-dialog, placeholder-screen,
                           page-header, query-state, form-fields (+ ControlledChecklist),
                           search-select (+ ControlledSelect), country-currency-fields, record-list
                           (a Setup master's list), form-footer (PageForm, a full-page form),
                           confirm-dialog (+ useConfirm), folder-nav (the tree masters' folders),
                           repeatable-rows (a child table inside its form; RepeatableList, the
                           whole table), section-heading, sample-box (a worked sample: receipt
                           total, tax preview, valuation), record-index (a destination's index: the
                           rows a person's permissions let them open), sales-defaults-fields and
                           item-tax-fields (the sales defaults and the Item Tax row an Item and an
                           Item Group both have), document-page (a document's header, its Submit /
                           Cancel / Delete and its form), stock-document (what the two stock
                           documents share), ledger-filters (a report's filter bar and panel, and
                           the way between a ledger row and its document), chip, record-page-header
                           (a record page's header and its confirmed Delete), receipt (the receipt on
                           screen: a format's sample and a sale's), pos-session (the cashier's open session,
                           and a session page before it), session-amounts-form (an amount per payment
                           method: Open Session and Close Session), row-box (a box of rows: the
                           Dashboard's lists, an import's mistakes and its log), filter-chips (a
                           pick-one row of chips, + PickChip), bell-action (the app bar's bell and its
                           unread count), badge —
                           and the files frontend.md restores on first use: note-callout, header-title
src/app/_layout.tsx        PaperProvider + QueryProvider + the two-state route guard
src/app/sign-in.tsx        renders the sign-in screen
src/app/(app)/_layout.tsx  signed-in group: tabs, systems/, create-system, scan, the sheets/ routes (native
                           formSheet: confirms, the picker) and the forms/ routes (a small form: a
                           page narrow, a transparentModal Dialog wide) beside them, anchored on tabs
src/app/(app)/(tabs)/      home, access-codes, notifications, settings, account + the NativeTabs bar (five:
                           Android's most) and the Notifications badge
src/app/(app)/systems/[id]/ the merchant shell — _layout (header + rail/drawer), Home, dashboard.tsx, and five Stacks
                           of their own: sell/ (the index, open-session, register, cart, pos-invoices,
                           pos-invoice, pos-return, the two entries' lists, close-session, pos-closing-entry), stock/ (the index, items, item, item-prices, import-items, the stock
                           documents and reports), accounts/ (the index, general-ledger; each re-exports
                           the other's document and report pages, so Back returns), employees/ (the
                           owner's: index, employee, roles, role, permissions) and setup/ (the
                           index and one route per Setup page; chart-of-accounts, warehouses and
                           item-groups push themselves once per folder, `parent`)
app.config.ts              derives the Google iOS URL scheme from .env
supabase/migrations/       profiles, merchants, current_merchant_ids, the signup trigger,
                           delete_current_user and rls_auto_enable — whose event trigger hosted
                           Supabase refuses to install — the history of the business schema that
                           20261008050254_revamp_drop_business_schema.sql dropped, then the POS
                           foundation: 20261008101635_company_and_fiscal_year.sql,
                           20261008145056_users_and_access.sql, 20261008151723_defaults_and_money.sql,
                           20261008152613_chart_of_accounts.sql, 20261009004357_accounting_defaults.sql,
                           20261009004450_modes_of_payment.sql, 20261009091028_taxes.sql,
                           20261009171705_stock_building_blocks.sql,
                           20261010011003_item_groups_and_selling_settings.sql,
                           20261010011005_tax_rules.sql, 20261010011013_stock_settings.sql,
                           20261010064803_naming_series.sql, 20261010065138_printing.sql; then the
                           second batch: 20261011134250_items.sql, 20261011134357_item_prices.sql,
                           20261011165554_ledgers.sql, 20261011170112_stock_in_and_adjustments.sql,
                           20261011233916_pos_profiles.sql, 20261012004616_pos_shift_and_sale.sql,
                           20261012080419_pos_returns_and_voids.sql, 20261012085121_discounts.sql,
                           20261012085548_pos_invoice_discounts.sql,
                           20261012131350_access_for_documents.sql, 20261012200010_dashboard.sql,
                           20261012204315_import_items.sql; then 20261013213537_access_codes.sql,
                           20261014034106_employees_and_permissions.sql,
                           20261014170428_backend_performance.sql and 20261015000059_item_barcodes.sql
supabase/reverts/          one revert per migration, same filename — never inside migrations/
supabase/all-in-one/       add.sql + revert.sql, generated by tools/build-migrations.mjs
.claude/instruction-mds/   conventions for what is built on the scaffold — structure, data layer,
                           tenancy, frontend, migrations, testing workflow, acceptance tests,
                           token budget. See CLAUDE.md §2. The one tracked directory in .claude/
.claude/tests/<screen>.md  plain-language acceptance scripts the human testers run on a device, one
                           file per screen — written by the agent, never run by it; gitignored,
                           local (.claude/instruction-mds/acceptance-tests.md)
patches/                   patch-package diffs, applied by the postinstall hook
.oxlintrc.json             oxlint config: rule list + the local plugin it loads, and the overrides
                           that turn no-design-literals on for src/** and off for src/themes.js, and
                           refuse a react-native-paper import outside src/components/
tools/oxlint/anti-slop/    that plugin — TypeScript rules, not shipped in the app bundle
tools/build-migrations.mjs     npm run build:migrations / check:migrations — writes and checks all-in-one/
tools/fallow-verdict.mjs       runs fallow's review gate and prints a compact verdict, not the raw JSON
tools/check-logic.mjs          npm run check:logic — asserts the pure date math against Postgres' own,
                               the money module and the tax calculation against ERPNext's results,
                               the tree walks, the Tax Rule a sale takes, what a receipt prints,
                               the Item Price a sale line takes, the Dashboard's periods, what a CSV
                               file of items holds, an access code's shape, status and expiry, and the
                               permission checks (can, has, a destination's rule, requirements, an
                               employee's exceptions, a cart without Apply Discounts), what a product
                               label's lines fill, and which camera barcode reports count
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
schema mirrors a migration anywhere in this project ([.claude/instruction-mds/data-layer.md §4](./.claude/instruction-mds/data-layer.md)).
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
and an off-canvas drawer on a narrow one. It holds six destinations: Home, which renders nothing yet; the Dashboard, one screen and so a route file
with no stack (Step 22, below); Sell,
Stock and Accounts, each a `Stack` of its own whose index lists what the reader's roles let them open;
and Setup — a `Stack` of its own (`systems/[id]/setup/`), whose index lists the company's foundation
records on ERPNext's model and pushes each one; a tap on Setup in the rail always lands on that index.
Opening a system asks for `my_permissions` and System Settings side by side: the shell subscribes to System
Settings without reading it, so the Dashboard (which waits for its time zone) and every amount formatted by it
find it cached instead of asking first and only then for their own rows — 0.7–1.0 s off the first Dashboard on
the dev build (`.claude/test-report/backend-performance-test-report.md`, 2026-10-15).
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
the Chart of Accounts with Cost Centers, Accounting Defaults, Modes of Payment, Taxes, the Stock
Building Blocks, Item Groups with Selling Settings, Tax Rules, Stock Settings, Naming Series, and Printing;
the second batch (Steps 13–23); Access Codes; Employees & permissions, which replaced Users & Access's
ERPNext roles; a backend-performance pass before deployment; item barcodes; and One store, which took
Cost Centers and the Abbreviation back out (the last sections).

`public.profiles` has `id` referencing `auth.users` with `on delete cascade`, `display_name`,
`avatar_url`, `created_at` — plus its policies, a trigger that fills the row on signup, and the
function behind the **Delete account** button.

There is no `email` column. `auth.users.email` is the source of truth and the client already holds
it as `session.user.email`; a copy would go stale on the first address change and need a second
trigger to keep in step.

### `public.merchants` — the tenant

`id`, `owner_id` referencing `auth.users` with `on delete cascade`, `name` (1–80 characters once
trimmed, a check constraint), `created_at`, and the Company's own fields: `country_code`,
`default_currency` (last section) — `abbr` went with One store (below). The 2026-10-08 teardown dropped its category, address, contact
email, phone and currency columns. The cascade is what lets `delete_current_user()` stay one
statement: deleting the `auth.users` row takes the profile and every merchant with it.

**A merchant is a business, not a person**, and each one is what the UI calls a "system" — the cards
on the home screen are this table. `owner_id` is the owner — ERPNext's Administrator, holding every
permission and never removed; everyone else is a row of `merchant_members` (Access Codes and Employees &
permissions, below), and the model is in [.claude/instruction-mds/tenancy.md](./.claude/instruction-mds/tenancy.md).

Its policies: select for the owner or a member (`(select auth.uid()) = owner_id or id in (select
private.current_merchant_ids())` — the owner clause on the row itself, because the function is
`stable` and its snapshot cannot see a row the same `insert … returning` just wrote); update for
whoever holds Company write (`permitted_merchant_ids('Company', 'write')`); insert and delete for the
owner only. `merchants_keep_owner` refuses any change of `owner_id`.

Unlike `profiles`, it has a delete policy: removing one of your own businesses is an ordinary
action, not account deletion.

### `private.current_merchant_ids()` — the seam

`security definer`, `stable`, returning the merchant ids the caller owns plus those where they are a
member. `authenticated` keeps `usage` on `private` and `execute` on it and on the
permission functions below so policies can call them
([.claude/instruction-mds/tenancy.md §4](./.claude/instruction-mds/tenancy.md)).
It was written before any caller on purpose, and Users & Access proved the point: staff arrived by
rewriting this body and adding `permitted_merchant_ids()` beside it — no table alterations. Business
tables now call `permitted_merchant_ids()`, which builds on it (below), and Employees & permissions proved
it again: a different permission model behind the same two signatures.

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
above; the permission engine, the tree validator, each step's `seed_*` trigger function, the access-code
triggers and the "Access changed" trigger are in the sections below. The definer functions PostgREST
serves besides `delete_current_user()` are `public.my_permissions()` (it answers only for a system the
caller belongs to), the document RPCs `submit_document`, `cancel_document` and `delete_document`
(Steps 15 and 19), and the access-code RPCs `create_access_codes`, `claim_access_code` and
`decide_access_request` (Access Codes, below) — each checks `(select auth.uid())` itself. The Employees
saves, `save_role` and `save_member_access`, are invoker: the owner-only policies decide them.

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
table: `private.apply_doctype_policies()` writes them (Step 11 and Employees & permissions, below; CLAUDE.md §6.7). A new table in `public` is served over HTTP by
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
`20261003195252`) were dropped on 2026-10-08, rows included, when the app was cut back to the systems
list ahead of a rebuild on ERPNext's model. Their migrations and reverts stay as history, so
`add.sql` still builds them on a fresh project before the drop removes them. Their design notes are in
git (`git show 07bd7aa:ARCHITECTURE.md`).

### The POS foundation, Step 1 — `20261008101635_company_and_fiscal_year.sql`

The rebuild follows ERPNext's setup order (`.claude/erpnext-docs/POS-System-Only-Features.md`), one
migration per step. A system **is** its company — multi-company is out of scope — so ERPNext's
Company fields are `merchants` columns (tenancy.md rule 9):

- `abbr` — 1–10 characters, no spaces (`merchants_abbr_shape`). ERPNext appends it to account, cost
  center and warehouse names; here it will be *displayed* after them, never stored in them, so
  editing it renames nothing. Systems that already existed got their name's initials. **Dropped on
  2026-10-19** (One store, below).
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

> **Superseded on 2026-10-14** by Employees & permissions (below): of this step, `doctypes`, `roles`,
> `merchant_members`, `permitted_merchant_ids()`, `my_permissions()` and `apply_doctype_policies()` remain,
> re-created there; the rest was dropped. What follows is what this migration did. The ERPNext roles the later
> step sections name (Sales User, Stock Manager, System Manager …) are the model of their day; today a doctype
> is reached through the permissions in that section's table.

ERPNext's permission model, enforced by RLS rather than mirrored in the client
(docs.frappe.io/erpnext/role-based-permissions, /user-permissions, /role-and-role-profile):

| Table | Holds |
| --- | --- |
| `doctypes` | the registry: each document type, its table, its kind (`record`, `single`, `tree`), whether a User Permission may restrict it. Global, read-only, written by migrations |
| `standard_role_permissions` | ERPNext's standard matrix: role × doctype × select/read/write/create/delete. Global, read-only; copied into each system |
| `roles` | per system: the ten standard roles (`All` implicit) and custom ones. `guard_roles` refuses renaming or deleting a standard role, and disabling `All` |
| `role_profiles`, `role_profile_roles` | a named set of roles given together |
| `merchant_members`, `member_roles` | a person let into the system — since 2026-10-14 only by an approved access code (Access Codes, below); their name, email and photo are copies from the request |
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
  under each permitted one unless Hide Descendants. Step 21 (below) gave both a second argument, the
  document type being read, and the policies of every table that links to a restrictable doctype.

`private.apply_doctype_policies(table, doctype, child)` writes a table's four policies from its
doctype's kind and restrictability, so every table gets the same shape; `sync_standard_permissions()`
copies new template rows into every system after a migration adds some.

**Invites by email are gone.** Until 2026-10-14 an invite was a `merchant_members` row with an email,
which `claim_membership` and `claim_memberships_for_user` matched to a confirmed `auth.users` address.
`20261013213537_access_codes.sql` dropped both triggers and their functions: a member row is now made
by `decide_access_request` alone (Access Codes, below).

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

> **Cost centers removed on 2026-10-19** by One store (below): the table, every column that named one and every
> rule about them. The later step sections still mention them as they were; this one is what the migration did.

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
Actual amount spread by net amount, running totals. Test Template (beside New Template on the list) runs a saved
template on a sample line; the POS Invoice runs the same module.

### Step 8, Stock Building Blocks — `20261009171705_stock_building_blocks.sql`

docs.frappe.io/erpnext/warehouse, /uom, /managing-fractions-in-uom, /price-lists, /brand, /inventory-account.

| Table | Holds |
| --- | --- |
| `warehouses` | a tree (All Warehouses → Stores …) on `private.validate_tree()`, whose parent lookup now reads the table it fires on, so any tree uses it. `account` → an enabled **Stock** ledger (`private.validate_warehouse_account()`, definer). Restrictable: a User Permission can hold someone to one warehouse |
| `uoms` | a unit, `must_be_whole_number` (a quantity in it cannot be a fraction), `enabled` |
| `uom_conversion_factors` | one `from_uom` is `value` `to_uom` (1 Kg = 1000 Gram); `value > 0`, two different units, one row per pair |
| `price_lists` | selling only, in one of the system's `currencies`, `enabled`, `price_not_uom_dependent` |
| `brands` | a name, a description, and the sales defaults its items take — warehouse, price list, selling cost center, income account; `private.validate_defaults()` (definer, Step 9 below) holds each to an enabled ledger warehouse, an enabled price list, a ledger cost center, an Income ledger |

A warehouse with no account of its own posts to its nearest parent's, then the Company's Default Inventory
Account (4.3, "Linking stock warehouse and accounts"); the Warehouses screen resolves and shows it
(`inventoryAccount`, `src/features/warehouses/queries.ts`). Nothing posts stock yet, so there is no server-side
resolver. Deleting a warehouse, price list, unit or ledger something still names fails `23503`, named on screen
by the constraint that refused (`treeFailure`, `src/components/folder-nav.tsx`).

`merchants_seed_80_stock` gives each system All Warehouses → Stores (no account: the Company's Stock In Hand
serves), thirteen units (Nos, Unit, Box, Pack, Pair, Set whole; Kg, Gram, Litre, Millilitre, Meter, Centimeter,
Hour), three conversions (Kg → Gram 1000, Litre → Millilitre 1000, Meter → Centimeter 100) and Standard Selling
in its currency. Existing systems were backfilled. Out of scope: Warehouse Type, addresses, buying price lists,
a brand's purchase defaults.

### Step 9.1–9.2, Item Groups and Selling Settings — `20261010011003_item_groups_and_selling_settings.sql`

docs.frappe.io/erpnext/item-group, /selling-settings.

| Table | Holds |
| --- | --- |
| `item_groups` | a tree (All Item Groups → Products, Services …) on `private.validate_tree()`; a name is unique across the whole tree, as the docs require. The docs' Defaults as columns — Default Price List, Warehouse, Selling Cost Center, Income and Expense Account. Restrictable: a User Permission can hold someone to one group and what is under it |
| `item_group_taxes` | the group's Item Tax rows: an Item Tax Template, for a tax category, from a date, within a net-rate range (`max = 0` is no limit; otherwise `min <= max`). Saved with the group through `public.save_item_group` (invoker), as a template's rows are |
| `selling_settings` | a single, the Pricing tab: Default Price List, the fallback to it, editing a line's Price List Rate, validating the selling price against valuation |

`private.validate_defaults()` (definer) is now the one check for every record that names defaults — a brand,
an item group, Selling Settings, Stock Settings. It reads the row through `to_jsonb`, so a table without a
column skips it, and holds each changed default to an enabled non-group warehouse, an enabled price list, a
ledger cost center, an Income or Expense ledger, an enabled unit (`default_invalid`). It replaced
`private.validate_brand_defaults()`. `merchants_seed_90_selling` seeds All Item Groups → Products, Services
and Selling Settings on Standard Selling. Out of scope: an item group's Default Supplier, buying cost center
and website fields; Selling Settings' customer, transaction, commission and naming tabs.

### Step 7, Tax Rule — `20261010011005_tax_rules.sql`

docs.frappe.io/erpnext/tax-rule. `tax_rules` picks the Sales Taxes and Charges Template a sale takes from its
Tax Category, its Item Group, its date and a priority (1 is the highest). Sales only; no party, address or
shopping-cart conditions. ERPNext's "Tax Rule Conflicts with …" is an exclusion constraint,
`tax_rules_no_conflict` (`btree_gist`): the same conditions at the same priority on overlapping dates fail
`23P01`.

Choosing the rule is `src/features/tax-rules/resolve.ts`, as the tax arithmetic is `calculate.ts`: a blank
condition matches every sale, an item group matches the items of every group under it, the most conditions
filled in win, then priority 1 over 2, then the older rule; a winning rule whose template is disabled picks
nothing. The Tax Rules screen's **Which Template?** runs a sample sale through it; the POS Invoice will run
the same module. Rejected: a resolve RPC — a second copy of the ranking with nothing to call it yet.

### Step 10 with 9.3, Stock Settings — `20261010011013_stock_settings.sql`

docs.frappe.io/erpnext/stock-settings, /fifo-and-moving-average, /change-valuation-method. `stock_settings`, a
single: Item Naming By (Item Code or Naming Series), the Default Item Group, Stock UOM and Warehouse a new
item starts with, the Default Valuation Method (FIFO or Moving Average), Allow Negative Stock, and Auto Insert
Price List Rate if Missing. No Show Barcode Field (barcode is out of scope), no LIFO or Standard Cost.
`merchants_seed_92_stock_settings` sets Products, Nos, Stores, FIFO — 92, not 100, because triggers fire in
name order and "100" sorts before "20". The screen shows the docs' worked example (10 at 100, 10 at 120,
sell 15: FIFO 1,600, Moving Average 1,650) as static copy until stock posting exists, and both settings
screens warn when Selling Settings' fallback and Stock Settings' auto insert are on together, as the Selling
Settings docs advise against.

A delete refused because one of these tables still names the record is worded by `usedElsewhere`
(`src/lib/errors.ts`), from the table Postgres names in the `23503`; each screen keeps its own words for the
references it had before.

### Step 12.1–12.2, Naming Series — `20261010064803_naming_series.sql`

docs.frappe.io/erpnext/naming-series, /document-naming-settings, /naming-series-current-value.

| Table | Holds |
| --- | --- |
| `naming_series` | one row per document that takes a series — POS Invoice, Sales Invoice, Item: its `options` (the first is the default) and User must always select. `private.are_naming_series()` checks them; a trigger refuses a series another document uses (`series_in_use`, `23505`) |
| `naming_series_counters` | ERPNext's `tabSeries`: the last number given out under each **resolved** prefix (`ACC-SINV-2026-`), so a series with the year in it starts again each year by itself |

A series is parts separated by dots: `YYYY`, `YY`, `MM`, `DD` are today's in the system's time zone, `FY` the
fiscal year today falls in, a run of `#` at the end the counter and its digits (none means five); anything
else prints as typed, so the docs' `SINV12####` works. The parser lives only in the database —
`private.series_prefix()` — because the database hands out the numbers: `private.make_name()` (definer, out of
every role's reach) moves a counter up in one `insert … on conflict` and returns the name, for the triggers of
the documents to come. The screen reads `public.naming_series_preview()` and writes a counter with
`public.update_series_counter()`, both security *invoker*. Rejected: a second parser in TypeScript for a live
preview — two copies of the same rules drift.

The doctype is **Document Naming Settings**, a single whose rows the `merchants_seed_94_naming` trigger makes
(`ACC-PSINV-.YYYY.-`, `ACC-SINV-.YYYY.-`, `STO-ITEM-.YYYY.-`); only a System Manager holds it. Out of scope:
field values in a series, the amended-documents counter, Document Naming Rule.

### Step 12.3–12.5, Printing — `20261010065138_printing.sql`

docs.frappe.io/erpnext/print-format, /letter-head, /print-settings.

| Table | Holds |
| --- | --- |
| `print_formats` | a receipt layout: `paper` (58mm, 80mm, A4), `print_heading`, `show_item_code` (ERPNext's Print Hide on Item Code), `footer_note`, default, disabled |
| `letter_heads` | the header (`content`) and `footer` a printed document carries, as text; default, disabled |
| `print_settings` | a single, under ERPNext's own names: `with_letterhead`, `compact_item_print`, `print_taxes_with_zero_amount` |

Both records allow one default per system (a partial unique index), never a disabled one, and share
`private.single_default()` — one trigger function for any table shaped `(id, merchant_id, is_default)`.
`merchants_seed_96_printing` gives a system Print Settings, the **POS Receipt** format on the 80mm roll, and a
default letter head named and worded as the company; each is made the default only while the system has none.
Everyone reads the three doctypes (a cashier prints receipts); a System Manager keeps them.

Nothing prints yet. A print format is a structured layout, not Jinja or HTML, and its page draws a **sample
receipt** from the unsaved values: the default letter head when Print Settings says so, two made-up items, the
default Sales Taxes and Charges Template through `calculate.ts`, and Global Defaults' rounded total and amount
in words. Which columns an item line prints and which tax rows print is `src/features/print-formats/receipt.ts`,
import-free and asserted like `calculate.ts`; the POS Invoice's receipt will print through it. Out of scope: a
print format's DocType (only the POS Invoice prints), Custom Format, Raw Printing, the Print Format Builder,
Print Style, the Print Heading master, a letter head's image.

### Step 13, Item Master — `20261011134250_items.sql`

docs.frappe.io/erpnext/item, /item-valuation-fifo-and-moving-average, /stock-settings.

| Table | Holds |
| --- | --- |
| `items` | what is sold: `item_code` (unique per system, never renamed), `item_name` (blank = the code), `item_group_id` (a leaf), `stock_uom`, `brand_id`, `description`, `disabled`; `is_stock_item`, `valuation_method` and `allow_negative_stock` (null = Stock Settings decides), `reorder_level`; `sales_uom`; the five sales defaults an Item Group and a Brand also carry |
| `item_uoms` | the other units it sells in: `uom_id`, `conversion_factor` (stock units in one of it), one row per unit |
| `item_taxes` | ERPNext's Item Tax table: `item_tax_template_id`, `tax_category_id`, `valid_from` — these rows come before the item group's |

`private.prepare_item()` runs before every write: with Stock Settings' Item Naming By on **Naming Series** it
takes the code from the Item series through `private.make_name()` (`no_item_series` when the document has
none), otherwise a typed code is required (`item_code_required`); it refuses a renamed code
(`item_code_locked`) and a group as the item group (`item_group_is_group`). `private.validate_defaults()` holds
the defaults to enabled records of the right kind, as it does for an Item Group. `public.save_item(payload)`
(security invoker) writes the item and replaces its two child tables in one transaction.

Item Manager keeps the doctype; the stock, sales and accounts roles read it; everybody may pick one. Left
for Pass 2, when something can post it: Opening Stock and Valuation Rate on a new item. Out of scope:
variants, barcodes, serial and batch numbers, the supplier and purchase tabs, images.

### Step 14, Item Price — `20261011134357_item_prices.sql`

docs.frappe.io/erpnext/item-price, /price-lists.

`item_prices` holds one rate of one item in one price list for one unit, with an optional `valid_from` /
`valid_upto`. As in ERPNext, two prices may overlap in time and only an **identical** one is refused — the
unique constraint is `nulls not distinct` over item, price list, unit and both dates (`23505`). Rejected: an
exclusion constraint on the date range, which would refuse the seasonal price beside the regular one that
the docs describe. `private.validate_item_price()` refuses a disabled price list (`price_list_disabled`)
and a unit the item neither stocks in nor lists (`uom_not_on_item`). Deleting an item takes its prices
with it; a price list or a unit that a price uses cannot be deleted.

`save_item` is re-created here: a **Standard Selling Rate** above zero on a *new* item writes its Item Price in
Selling Settings' default price list for the stock unit, with no dates (`no_default_price_list` when there is
none). Sales Master Manager and Item Manager keep the doctype; the rest read it.

Which price a sale line takes is `src/features/item-prices/resolve.ts`, import-free and asserted: the price
for that unit valid on the date (the later Valid From wins) → on a **Price Not UOM Dependent** list, the
stock-unit price × the conversion factor → the same two in the fallback list → none. The Register (Step 18)
will call it; nothing does yet.

### Step 15, Ledgers — `20261011165554_ledgers.sql`

The posting engine every later document uses (docs.frappe.io/erpnext/accounting-entries, /general-ledger,
/stock-ledger, /stock-level-report, /perpetual-inventory, /immutable-ledger).

| Piece | What it does |
| --- | --- |
| `can_submit`, `can_cancel` | two more permission columns on `standard_role_permissions` and `role_permissions`, read by `permitted_merchant_ids`, `my_permissions`, `save_role_permissions` and `sync_standard_permissions` |
| doctype kinds `document`, `ledger` | `apply_doctype_policies` gives a document the record's four policies plus `private.guard_docstatus()` (its rows: `guard_docstatus_child()`), and a ledger a select policy only |
| `gl_entries` | one debit or credit of an account for a voucher: posting date, cost center, voucher type / id / number, remarks, `is_cancelled` |
| `stock_ledger_entries` | one movement of an item in a warehouse: quantity, incoming rate, and the valuation rate, quantity and value it left |
| `bins` | the Stock Balance: per item and warehouse, the quantity, valuation rate, value and FIFO layers |
| `private.assert_postable` | refuses a date in the future, outside an enabled Fiscal Year, or on or before Accounts Frozen Till (the owner and the role Accounts Settings names may pass the last) |
| `private.post_gl` / `cancel_gl` | rounds at the currency's precision, merges rows per account and cost center, refuses an unbalanced voucher, sends a rounding cent to the Round Off Account. Cancel: reversing rows dated the cancellation day when Immutable Ledger is on, else the rows marked cancelled |
| `private.post_sle` / `reconcile_sle` / `cancel_sle` | locks the bin, values the movement by FIFO or Moving Average (the item's method, else Stock Settings'), refuses negative stock unless the item or Stock Settings allow it, a fraction in a whole-number unit, and a date before the bin's last movement |
| `public.submit_document`, `public.cancel_document` | the two definer RPCs: `auth.uid()`, the caller's Submit or Cancel permission, the row lock, then `private.submit_<table>` or the two cancels, then `docstatus` |
| `public.delete_document` (Step 19) | the third: a **cancelled** document only (`not_cancelled`), the caller's Delete permission, and Accounts Settings' Delete Ledger Entries with the Document — on, its ledger rows and the document go; off, `ledger_entries_kept` |

Two ceilings, each marked `ponytail:` in the SQL. A posting dated before an item's last movement in that
warehouse is refused (`stock_backdated`) — there is no repost engine. And a cancel puts the original value
back at today's date, after which the bin's FIFO layers are one layer at the average: `bins.stock_value` is
the truth the General Ledger follows, so the two always agree.

### Step 16, Stock In & Adjustments — `20261011170112_stock_in_and_adjustments.sql`

`stock_reconciliations` (purpose Opening Stock or Stock Reconciliation) and `stock_entries` (Material
Receipt, Issue or Transfer), each with its rows, numbered from their own series (`MAT-RECO-.YYYY.-`,
`MAT-STE-.YYYY.-`) when first saved. Both count in the item's stock unit; a Stock Entry names its
warehouses once, on the document. `private.validate_stock_document()` fills an empty Difference Account and
Cost Center on a new one — Temporary Opening for an Opening Stock, else the Company's Stock Adjustment
Account — and holds each link to an enabled record of the right kind. `save_stock_reconciliation` and
`save_stock_entry` (invoker) write a draft and its rows in one transaction.

With Perpetual Inventory on, a receipt debits the warehouse's inventory account and credits the Difference
Account; an issue is the reverse; a transfer moves value between the two warehouses' accounts and posts
nothing when they share one; a reconciliation posts the change in value. A reconciliation that changes
nothing is refused. `public.save_item_with_opening_stock` wraps `save_item`: a new stock item's Opening Stock
is saved and submitted as an Opening Stock reconciliation in its Default Warehouse, else Stock Settings'.

On the client a ledger is read with its filters sent to the server, newest `LEDGER_PAGE` rows; a document's
page reads its document by id, so a ledger row opens one however old. A new document's Posting Date starts
on the system's day (`todayIn`, `src/lib/dates.ts`), the day the database posts by.

### Step 17, POS Profile — `20261011233916_pos_profiles.sql`

docs.frappe.io/erpnext/pos-profile. One register's settings; nothing sells yet — the session and the sale
(Step 18) read it.

| Table | Holds |
| --- | --- |
| `pos_profiles` | `pos_profile_name` (unique per system), `disabled`; `warehouse` (required — it wins over an item's), `selling_price_list`, `taxes_and_charges`, `tax_category`, `print_format`, `letter_head`; the accounts that win over an item's and the Company's — `account_for_change_amount` (a Cash or Bank ledger), `write_off_account`, `write_off_cost_center`, `write_off_limit`, `income_account`, `expense_account`, `cost_center`; the Configurations switches `hide_unavailable_items`, `allow_rate_change`, `set_grand_total_to_default_mop` (on), `print_receipt_on_order_complete` |
| `pos_profile_users` | Applicable for Users: a member, and whether this is their default profile — one default per member (a partial unique index, `23505`). With one listed, nobody else may use the profile; the owner is no member row and may use any |
| `pos_profile_payments` | the modes offered at checkout: the default one, Allow in Returns |
| `pos_profile_item_groups` | the item groups the register lists |

`private.validate_pos_profile()` (definer, changed links only, the `validate_defaults` shape) holds each link
to an enabled record of the kind its field takes. `private.validate_pos_profile_payments()` is a **deferred**
constraint trigger on the profile and on its payment rows, as the tax rows' is: at least one payment method
(`payment_method_required`), exactly one default (`payment_default_required`), each an enabled Mode of Payment
with a default account (`payment_mode_unusable`) — so the seeded Credit Card cannot be offered until it has a
ledger. `public.save_pos_profile(payload)` (invoker) writes the profile and replaces its three child tables in
one transaction. A mode of payment, warehouse, price list, template or ledger a profile names cannot be deleted
(`23503`). Sales Manager and Accounts Manager keep the doctype; a Sales User reads it. No seed: ERPNext makes
no POS Profile. Left for Step 20: Apply Discount On, Allow User to Edit Discount, Ignore Pricing Rule, the
Discount Account. Out of scope: Company and Currency, Customer, Print Heading, Hide Images, Validate Stock on
Save, Allow Partial Payment.

### Step 18, Shift & Sale — `20261012004616_pos_shift_and_sale.sql`

docs.frappe.io/erpnext/pos-opening-entry, point-of-sale, pos-closing-entry. Three documents, none of them ever
a draft in the app: each is inserted and submitted in one transaction, so a refusal leaves nothing behind and
uses no number.

| Table | Holds |
| --- | --- |
| `pos_opening_entries` + `pos_opening_entry_balances` | a session: its POS Profile, its cashier (`user_id default auth.uid()`), `status` Open / Closed, and an opening amount per payment method. One submitted Open entry per profile and cashier (a partial unique index, `23505`) |
| `pos_invoices` | a sale: its session and profile, the warehouse, price list and template it was sold under, net total, total taxes, grand total, rounding adjustment, rounded total, paid, change, write off |
| `pos_invoice_items` | item, the name it was sold under, qty, UOM, conversion factor, stock qty, price list rate, rate, amount, net rate, net amount, item tax template — and, filled on submit, the income and expense accounts, the cost center and the valuation rate it left at |
| `pos_invoice_taxes` | the template's row as it was applied: type, account head, description, rate, row id, included, cost center, amount, running total |
| `pos_invoice_payments` | mode and amount; the account is filled on submit |
| `pos_closing_entries` + `pos_closing_entry_payments` | one per session: per payment method the opening, expected, counted (`closing_amount`) and difference, and what the session sold |

**App calculates, the database checks** (the human's decision of 2026-10-11). `src/features/pos-invoices/cart.ts`
— import-free, asserted in `tools/check-logic.mjs` — turns a cart into the sale: each line's price
(`item-prices/resolve.ts`), the Sales Taxes and Charges Template (the profile's; else the Tax Rule for the
profile's tax category, a rule with an Item Group applying when every line is under that group; else the
default), each item's Item Tax Template (the Item's rows, then its Item Group's and each group above), Accounts
Settings' Taxes from Item Tax Templates, `calculateTaxes`, the Rounded Total, and paid / change / write-off.
`private.submit_pos_invoices()` checks what it can without a second engine — the caller's own open session on
that profile (`no_open_session`), enabled items in a unit the item has (`item_unusable`, `uom_not_on_item`),
amount = qty × rate, the rate equal to the price list's unless the profile allows a change (`rate_locked`), the
totals adding up (`totals_mismatch`), only the profile's payment methods (`payment_method_not_offered`), paid
covering the rounded total with change as the excess and a shortfall within the Write Off Limit (`underpaid`)
— then posts: `post_sle` out of the profile's warehouse per stock item, and one `post_gl` (each mode's account
debited, change credited to Account for Change Amount → the Company's cash, the write-off, income per line,
each tax row, the rounding to Round Off, and with Perpetual Inventory Cost of Goods Sold against the
warehouse's account). Accounts resolve POS Profile → Item → Item Group → Brand → Company. Known ceiling
(`ponytail:` in the SQL): the tax amounts are the app's.

`private.submit_pos_opening_entries()` takes only the caller's own entry on a profile they may use
(`private.pos_profile_usable`) with the profile's payment methods. `private.submit_pos_closing_entries()` is
run by the session's cashier, or by whoever may **Cancel** a POS Opening Entry (a manager, for a session left
open); it fills each method's opening, expected (opening + the session's payments − change, the change coming
off the sale's first Cash-type payment) and difference, the totals, and marks the session Closed. Neither
entry can be cancelled (`private.keep_pos_entry`, `not_cancellable`). The app's three calls are security
**invoker** wrappers over `submit_document` — `public.open_pos_session`, `pos_checkout`, `close_pos_session`
— and the database dates each document (`private.merchant_today`). Rejected: a definer RPC per document.
A cashier is a **Sales User** (Read, Write, Create, Submit on the three); Sales Manager has all seven;
Accounts Manager all seven on POS Invoice; Accounts User reads POS Invoice; `All` now reads Accounts Settings.

The client: Sell is a rail destination with its own Stack. Its index shows the cashier's session
(`src/components/pos-session.tsx`) over the Orders and the two entries' lists. The Register lists what the
profile offers (`offeredItems`: its item groups, Hide Unavailable Items against `bins`, a search) in a
FlashList; the cart is client state per session (`src/Store/cart.ts`) and its page is the payment too. A sale
opens its receipt where the profile says so — `src/components/receipt.tsx`, which the Print Format's sample
also draws — and Orders reopens it; that is the reprint. Returns and voids are Step 19, below. Out of scope:
Customer, held sales, partial payment, loyalty, barcode, a printer.

### Step 19, Returns & Voids — `20261012080419_pos_returns_and_voids.sql`

docs.frappe.io/erpnext/sales-return, /immutable-ledger-in-erpnext, /deleting-a-submitted-document. No new
table and no new permission row: a cashier (Create, Submit) refunds, a void needs **Cancel**, a delete
**Delete**.

**A return is a POS Invoice** — `pos_invoices.is_return` and `return_against`, each line's
`pos_invoice_items.return_against_item` — through the same `public.pos_checkout` and
`private.submit_pos_invoices()`, with quantities, amounts, totals and payments **below zero**, as ERPNext
stores one. A closing entry's sums therefore net a refund by themselves. Rejected: a returned-quantity
column and a second poster.

**A return is prorated from the sale as stored, never recalculated.** Every tax row now keeps what it charged
each line (`pos_invoice_taxes.item_wise_tax_detail`, an array in line order — ERPNext's field; `calculate.ts`
returns it as `rows[i].byItem`, and a sale without it is `totals_mismatch`). `buildReturn`
(`src/features/pos-invoices/cart.ts`, asserted in `tools/check-logic.mjs`) takes each line and each tax row
by the returned quantity's share, and the poster checks every figure against the original. Rejected:
re-running the tax engine — wrong once a template is edited after the sale. The sales that existed before
this step were backfilled by net amount, exact for one tax rate.

The poster's return branch: the caller's own open session (the refund comes out of that drawer); the
original submitted, in the same system and not itself a return (`return_original_invalid`), row-locked; each
line the original's item, unit, conversion factor and rate (`return_line_invalid`), no more than sold less
what submitted returns already took (`return_qty_exceeds`); payments only through the profile's **Allow in
Returns** methods (`refund_method_not_allowed`), summing to the rounded total with no change and no write-off
(`refund_mismatch`). It posts `post_sle(+qty)` into the original's warehouse at the original line's valuation
rate, and one `post_gl` of the sale's own rows the other way, on the original line's accounts and cost center.

**A void is `cancel_document`**, unchanged. `private.guard_pos_invoice_void()` (a trigger on `docstatus` → 2)
refuses it while a submitted return stands (`has_returns`) and once the sale's session is closed
(`session_closed` — the human's decision of 2026-10-12: a return, rung in an open session, corrects it).
Rejected: a per-doctype hook inside `cancel_document`; allowing a void after closing, which would leave the
closing entry's expected cash disagreeing with the books.

**Delete** is `public.delete_document(doctype, id)` for every document, in the engine's table above.

The client: `DocumentHeader` (`src/components/document-page.tsx`) is the saved document's header, now shared
with the sale's page — Cancel, Delete on a cancelled document while the switch is on, both ledgers, and the
page's own `extra` action, **Return**. `src/screens/pos-orders/pos-return.tsx` (routes `sell/pos-return.tsx`,
re-exported into `stock/` and `accounts/`) asks the quantity per line, prefilled with what is left
(`returnableLines`), shows the refund, and takes an amount per Allow in Returns method; **Complete Return**
replaces the page with the return's receipt. A return names its sale, a sale lists its returns, and Orders
marks both a return and a cancelled sale. Out of scope: exchanges, a credit note kept for later.

### Step 20, Discounts — `20261012085121_discounts.sql`, `20261012085548_pos_invoice_discounts.sql`

docs.frappe.io/erpnext/applying-discount, /pricing-rule, /discount_accounting, /pos-profile. Two migrations:
what a discount is set up from, then the sale that takes one.

| Table or column | Holds |
| --- | --- |
| `merchants.default_discount_account` | where a discount posts when nothing nearer names an account. `merchants_seed_52_discounts` gives every system a **Sales Discounts Allowed** ledger under Indirect Expenses as that default |
| `items.max_discount`, `items.discount_account` | the most a line of the item may be discounted (0: no limit), and where its discounts post |
| `pos_profiles.apply_discount_on`, `allow_discount_change`, `ignore_pricing_rule`, `discount_account` | what an additional discount is taken from to start with, whether a cashier may discount, whether Pricing Rules apply at this register, and where its additional discounts post |
| `pricing_rules` + `pricing_rule_targets` | a rule: Apply On (Item Code, Item Group, Brand) and the rows of that kind, Min / Max Qty and Amt (0: no limit), Valid From / Upto, For Price List, Priority (**1 is the highest**, as a Tax Rule's reads — the human's decision of 2026-10-12), Disable, and one of Rate, Discount Percentage or Discount Amount |
| `pos_invoice_items.discount_percentage`, `discount_amount`, `distributed_discount_amount`, `pricing_rule_id`, `discount_account` | ERPNext's fields: the discount per unit against the Price List Rate, the line's share of the additional discount (already out of its net amount), the rule that priced it, and — filled on submit — where its discount posted |
| `pos_invoices.apply_discount_on`, `additional_discount_percentage`, `discount_amount`, `additional_discount_account` | the additional discount as taken, and where it posted |

`private.validate_discount_account()` is one check for all three discount accounts — an enabled Income or
Expense ledger of the same system — with the column as the trigger's argument. Rejected: a branch in each of
the three existing validators. `public.save_item` and `save_pos_profile` are re-created with the new fields;
`public.save_pricing_rule` (invoker) writes a rule and its rows, keeping only the kind its Apply On names.
**Pricing Rule** is a `record` doctype: Sales Manager and Sales Master Manager keep it, Sales User and
Accounts Manager read it — the Register applies it on the device.

**A line's discount** (20.1) is `price_list_rate − rate`, per unit, however it came about — a percentage or
an amount typed on the line, a typed lower rate, or a Pricing Rule. `priceLine`
(`src/features/pos-invoices/cart.ts`) takes them in that order; anything typed stands in for a rule.
**The additional discount** (20.2) is ERPNext's `apply_discount_amount` in
`src/features/sales-tax-templates/calculate.ts`: taken from the Net Total or the Grand Total (less any fixed
charge), spread over the lines by net amount with the rounding loss on the line that made it, and the taxes
run again on what is left; off the Grand Total, the grand total lands on the first one less the discount to
the cent.

**Which rule** a line takes is `pickPricingRule` (`src/features/pricing-rules/apply.ts`, import-free,
asserted): among the rules that cover it — enabled, valid today, for the sale's price list, naming the item,
its brand, or its group or one above, within their quantity and amount — Item Code over Item Group over
Brand, then priority, then a rule naming the price list, then the older rule. Rejected: ERPNext's error at
the till when two rules tie.

`private.submit_pos_invoices()` checks, for a sale: the discount is the Price List Rate less the rate and
the percentage says the same (`totals_mismatch`); a rule a line claims covers it and gives its rate, and no
rule is claimed where the profile ignores them (`pricing_rule_mismatch` — which rule *won* stays the app's,
`ponytail:` in the SQL); a typed discount needs Allow User to Edit Discount or Edit Rate, an additional one
Allow User to Edit Discount (`discount_locked`); a rate above the list needs Edit Rate (`rate_locked`); the
item's Max Discount (`max_discount_exceeded`); with Selling Settings' Validate Selling Price, a line's net
amount no less than its cost (`below_valuation`); the lines' shares against the additional discount and its
percentage. A return carries its line's discount fields as sold and their share of the additional discount.

**Discount Accounting** (20.5), when Accounts Settings turn it on: each discount is debited to its account
— the Item's, the POS Profile's for the additional one, each falling back to the Company's — **net of
tax**, and income is credited by as much more, so Sales shows the full price and the taxes stay what the
customer was charged (the docs' case posts Sales 1,398.00 and discounts 202.71). Rejected: ERPNext's Grand
Total variant, which credits tax at the amount before the discount. With no account found, a discount only
reduces the sale. The accounts used are kept on the line and the invoice, so a return posts back there.

The client: Setup → Selling → **Pricing Rules** (a list and a Setup-stack page with rows); Discount (%) and
Discount Amount on a cart line, and an Additional Discount section on the Cart, where the profile allows
them (`src/Store/cart.ts` holds what was typed, per session); the receipt lists Item Discount and
Additional Discount above its Net Total; the new fields sit on the Company, Item and POS Profile pages. Out
of scope: Apply On Transaction, customer-specific rules, free items, margins, coupons, promotional schemes,
loyalty.

### Step 21, Access for the New Documents — `20261012131350_access_for_documents.sql`

> **Undone on 2026-10-14** with User Permissions (Employees & permissions, below): `doctype_links`, the two
> restriction functions and the link clauses are gone. What follows is what this migration did.

docs.frappe.io/erpnext/user-permissions, /role-based-permissions. 21.1 needed no change: every document type
of Steps 13–20 got its rules, Submit and Cancel included, with its own step. This migration is 21.2 — a User
Permission now restricts the documents that *link* to its record, and **Applicable For** means something.

| Piece | What it does |
| --- | --- |
| `public.doctype_links` | global, read-only, like `doctypes`: a document type, the restrictable doctype one of its columns links to, and that column. GL Entry → Account (`account_id`) and Cost Center (`cost_center_id`); Stock Ledger Entry and Bin → Warehouse (`warehouse_id`); Stock Entry → Warehouse (`from_warehouse`, `to_warehouse`); POS Invoice and POS Profile → Warehouse (`warehouse`); Item → Item Group (`item_group_id`) |
| `private.restricted_merchant_ids(allow, doctype)`, `private.allowed_record_ids(allow, doctype)` | the Step 11 pair with the document type being read: a User Permission answers when it applies to all document types or names that one as Applicable For. The one-argument forms are dropped |
| `private.apply_doctype_policies()` | re-created. A restrictable master asks about itself (`'Warehouse', 'Warehouse'`). A linking table gets one clause per link column on select, update, delete and insert's `with check`: not restricted there, or the column is empty, or it holds an allowed record — so a person held to one warehouse cannot save a document for another. The rows of a linking doctype (`pos_invoice_items`, `stock_entry_items`, `item_uoms` …) are held to `exists` on their parent, whose own policies answer |
| `private.validate_user_permission()` | Applicable For must be the Allow doctype itself or one that links to it (`not_applicable`, `23514`) |

Re-applied in the same migration: the five restrictable masters, the seven linking tables and their nine
row tables. The human's decision of 2026-10-12 is what counts as a link: a document's or a ledger's own, and
the one record a master belongs to. A default on a master — an Item's Default Warehouse, a Tax Rule's Item
Group, the Company's accounts — restricts nothing (ERPNext's "Ignore User Permissions" on a field). Rejected:
every table with any link, which would take the Tax Rules, Pricing Rules and Items a sale is priced with away
from a cashier held to one warehouse; and a `links` column on `doctypes`, which the form could only read by
taking a JSON value apart.

Known ceilings: a Stock Reconciliation names its warehouses on its rows and follows no link; the rows of a
restrictable master stay readable by whoever may read the doctype; and a helper held to one Item Group
cannot read the groups above it, so the Register's walk up the tree for an Item Group's Item Tax rows stops
at their own (`.claude/instruction-mds/tenancy.md` §7).

The client: the User Permission form's **Applicable For** lists the Allow doctype and the document types
that link to it (`useDoctypeLinksQuery`, `src/features/doctypes/queries.ts`), and picking another Allow
empties it. The shell lists a destination only for someone who may read a row of its index — each index
exports its sections, `readsAny` (`src/components/record-index.tsx`) asks — while every screen stays
registered: a hidden destination is not a refused one, and RLS still answers a deep link. Out of scope:
Strict Permissions, Ignore User Permissions as a per-field switch, the Permitted Documents for User report.

### Step 22, Dashboard — `20261012200010_dashboard.sql`

docs.frappe.io/erpnext/erpnext-dashboards, /sales-analytics, /stock-level-report. No table, so no doctype,
seed or backfill: four `stable`, security **invoker** functions that `return table`, so the caller's own
policies decide every row they add up — a role reads here what it reads in Orders, Sell and Stock Balance,
and a User Permission narrows these figures as it narrows those lists (Step 21). Rejected: definer functions
with permission checks of their own, a second copy of what the policies say.

| Function | Returns |
| --- | --- |
| `dashboard_cards(merchant, from, to)` | one row. `sales` — Σ Net Total of the period's submitted POS Invoices, a return being one below zero; `invoices` — how many, returns left out; `gross_profit` — Σ per line of net amount less valuation rate × stock quantity, **null** unless the caller may read the Stock Ledger; `open_registers` and `expected_cash` — the sessions open now, and their Cash-type opening amounts plus Cash-type payments less change; `low_stock` — how many items `stock_alerts` lists |
| `sales_by_day(merchant, from, to)` | a row a day (`generate_series`), a day without a sale at zero; a year and a day at most |
| `top_selling(merchant, from, to, by, group, limit)` | the best sellers by Item or by the Item Group each is in, ranked by stock quantity or net amount; what was wholly returned drops out |
| `stock_alerts(merchant, limit)` | per warehouse, the enabled stock items whose bin is at zero or less, or at or below a Re-order Level above zero. An item never stocked has no bin, so it does not alert |

**Sales is the Net Total** and Gross Profit is shown only to who reads both POS Invoice and Stock Ledger
Entry (the human's decisions of 2026-10-12): ERPNext's Sales Analytics values a sale before tax, and the cost
of what was sold is the stock ledger's to tell. The dates are the caller's — the app works the period out in
the system's time zone (`periodRange`, `src/features/dashboard/period.ts`, over `todayIn`), the day
`private.merchant_today` dates a sale by. Known ceiling (`ponytail:` in the SQL): change comes off the
expected cash only for a sale with a Cash-type payment; the closing entry's fallback to a sale's first
payment is not repeated.

The client: **Dashboard** is a rail destination of its own, second after Home — Home stays as it is (the
human, 2026-10-11) — listed for whoever may read POS Invoice, POS Opening Entry or Bin. It is one screen, so
a route file with no stack; the shell hands it the system's `id`, as it does every destination.
`src/screens/dashboard/` draws the period switch (Today, Last 7 Days, This Month), the four number cards,
sales per day as bars drawn with Views — the last seven days when the period is Today — the best sellers
with their two switches, and the stock alerts; each block shows only with Read on what it adds up. The
drawer keeps the screen mounted, so `invalidateDashboard` follows every posting and session
(`invalidateLedgers`, `invalidatePosOpeningEntries`), and a `useFocusEffect` asks again for what went stale
while another screen was in front. Out of scope: custom dashboards, saved charts, targets, projected
quantity.

### Step 23, Bulk Import (Items) — `20261012204315_import_items.sql`

docs.frappe.io/erpnext/data-import, /opening-stock. Insert new Items from a CSV file: save the template,
choose the filled file, see every row and column mistake before anything is saved, import, read the log. One
file loads items, their first prices and their opening stock. No table, so no doctype, seed or backfill.

**The file is read on the device.** `src/features/items/csv.ts` (import-free, asserted in
`tools/check-logic.mjs`) holds the template's eleven columns — the Item's 13.1 fields, then Standard Selling
Rate, Opening Stock and Valuation Rate — a parser (quoted cells, doubled quotes, CRLF, a byte order mark),
and `readItemsCsv`, which turns each row into the payload `public.save_item` takes or into a mistake named by
the spreadsheet's row (the header is row 1) and the column's heading. A mistake is: a header that is not the
template's; a missing code, one an item already has, or one twice in the file; an Item Group, unit or Brand
not in the system — **never created** — a group that is a group, a disabled unit; a yes/no cell that is
neither; a number that is not one or is below zero; Opening Stock on an item that keeps no stock, as a
fraction of a unit that can't be divided, with no rate to value it, with no Default Warehouse in Stock
Settings, or without the roles to post it; a rate with no Default Price List, or without Item Price create;
more than 500 rows. A blank Item Group or unit takes Stock Settings' default, as a new item's form starts
with; names match as typed. Under the Item naming series the code column is not read.

**The write is one function.** `public.import_items(p_merchant, p_rows)` is security **invoker**, so it needs
what the form needs: Item create, Item Price create for a row with a rate, Stock Reconciliation create and
submit for a row with opening stock. It calls `public.save_item` for each row — `private.prepare_item`,
`validate_defaults`, the naming series and the rate's Item Price all run as for one item — with `id` and
`merchant_id` set by the function and the Default Warehouse Stock Settings'; then **one** Opening Stock
reconciliation for every row that carries stock, saved and submitted through `save_stock_reconciliation` and
`submit_document`. Every row or none: a refusal is re-raised with its own SQLSTATE and message and
`hint = 'row N'` — the Nth row sent, which the screen turns back into the file's row — or `'opening stock'`
once the rows are in. It answers the created codes and names in the file's order. Rejected: a reconciliation
per item; a definer function with permission checks of its own. Known ceiling (`ponytail:` in the SQL): 500
rows a call, the whole file being one statement under the `authenticated` role's 8 s `statement_timeout` —
500 rows, each with a price and opening stock, took 3.8 s.

The client: **Import Items** is a row of the Stock index, shown with Item **create** — `IndexEntry` gained
`ptype`, Read unless the row is an action — and a page of the Stock stack
(`src/screens/import-items/index.tsx`): **Download Template**, **Choose File**, the file's mistakes or "n
items ready", **Import** through `sendOnce`, then the log with **Import Another File** and **Go to Items**.
The files are the phone's own pickers, `src/lib/files.ts` over `expo-file-system` 57.0.7, which ships with
`expo` and was already in the development build — no new native package and no rebuild (the human,
2026-10-13; rejected: `expo-document-picker` and `expo-sharing`). The module has no "save as", so Download
Template asks for a folder; Android refuses the Downloads folder itself. What the Item form and this page
both say for a refused item is `itemRefusal` (`src/lib/errors.ts`).

**The pickers after Android rebuilds the window.** Once the system has rebuilt the app's window while the
app was open — the text size, display size or language changed in Settings — a pick rejected until the app
was restarted (`Attempting to launch an unregistered ActivityResultLauncher`, seen on the emulator,
2026-10-13). Three pieces, each right alone: `expo-modules-core`'s `AppContextActivityResultRegistry`
unregisters a launcher when its Activity is destroyed; `AppContext.onHostResume()` registered the contracts
again only when `AppContext.onHostDestroy()` had run; and `expo`'s `ReactActivityDelegateWrapper` posts
`onDestroy` while `onResume` runs inline, so on a relaunch the new Activity resumes first and React Native's
`ReactHostImpl.onHostDestroy(activity)` drops the late destroy as not its current Activity. The emulator's
log shows that order under the `BridgelessReact` tag: `onHostPause(activity)`, `onHostResume(activity)`, then
`onHostDestroy(activity)` with no `ReactContext.onHostDestroy()` after it (2026-10-13, both directions of a
text-size change).
`patches/expo-modules-core+57.0.20.patch` makes `onHostResume()` register the contracts again whenever it
resumes with another Activity. Run on the emulator after a rebuild, 2026-10-13: the log still shows the late
destroy, and both pickers open after a text-size, a display-size and a language change (English to Filipino
and back), in the same process.
`expo` 57.0.28 and `expo-modules-core` 57.0.22 carry the same code, so an
update does not replace the patch. Rejected: running the wrapper's `onDestroy` inline — the origin, but it
reorders Activity teardown for the whole app; a patch to `expo-file-system` — linked as a prebuilt AAR, its
source is not compiled. `src/lib/files.ts` still calls the picker in the form that rejects rather than
answering `canceled`, and the page still says to close the app and open it again — for a build made without
the patch. Still lost: the one pick in flight when the Activity is destroyed under an open picker.
Unverified: iOS — the pickers were run on Android only. Out of scope: updating existing items, importing
any other record, a saved import log, files other than comma-separated.

### Access Codes — `20261013213537_access_codes.sql`

The one way into someone else's system (`.claude/updates-and-revamps/access-codes-references/`). The owner
makes codes and sends them outside the app; whoever enters one waits until the owner approves them.

| Table | Holds |
| --- | --- |
| `access_codes` | per system: `code` — six of `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O, 1/I), unique, shown `ABC-123` — `label` (≤ 40, optional), `expires_at` (null: never), `max_uses` (null: any number of people). Select and delete for the owner; **no insert or update policy** |
| `access_requests` | a code used: the system's name, the code, the person's name, email and photo — copies, since the requester cannot read the system and the code may be deleted — and `status` (`pending`, `approved`, `declined`). One pending per person and system. Select only: the owner, or the requester |
| `notifications` | one person's inbox: `kind`, `title`, `body`, `read_at`. Their own rows to read, mark and clear; only triggers write them |
| `private.access_code_failures` | the claim's rate limit: ten wrong, expired or used-up codes in 15 minutes stop a person |

They are owner-only tables, not doctypes — no role may make a code or let someone in — so their policies are
written by hand on `private.owned_merchant_ids()` (definer, like `current_merchant_ids()`; tenancy.md rule 13).

**The RPCs** — security definer, in `public` because the app calls them, revoked from everyone, granted to
`authenticated`, each checking `(select auth.uid())`:

- `create_access_codes(merchant, label, quantity 1–20, expires_minutes | expires_on, max_uses)` — the only way
  to make a code. An insert policy would let a caller pick a code and read the unique violation as "it
  exists", around the claim's rate limit. The expiry is decided here: minutes from now, or the end of the
  picked day in System Settings' time zone (`expiry_in_past` before today). Characters come from
  `extensions.gen_random_bytes` — 256 is a multiple of 32, so none is likelier — drawn again on a collision.
- `claim_access_code(code)` — normalises it (upper case, no dash or spaces), locks the code `for update` so two
  people cannot share a one-person code, and **answers** rather than raising, so a failure's rate-limit row
  survives: `requested`, `invalid`, `expired`, `used_up`, `own_system`, `already_member`, `already_requested`,
  `declined`, `too_many_attempts`. The system's name comes back only once the code is real and unspent, so
  guessing names nothing. A use is a pending or approved request; a decline frees it for someone else, not
  for the person declined.
- `decide_access_request(request, approve)` — the owner's; refuses a request already decided
  (`request_decided`) or not theirs (`request_not_found`). Approving inserts the member, with no role, the
  copies and the code.

**Members.** `merchant_members.user_id` is not null and goes with the account (it was `set null`, which left
rows nobody could use); `(merchant_id, user_id)` is unique; the email is a copy and may be null (a Facebook
account may have none). `merchant_members_require_access_request` refuses every insert from `authenticated`
or `anon` (`access_code_required`) and any change of a row's person or system (`member_locked`), so the
definer RPC, running as the table's owner, is the only way in. Revoking is a plain delete under the `User`
delete policy.

**Notifications** come from three triggers: a request made tells the owner (Access code used); a request
decided tells the requester (Request approved / Request declined); a member deleted tells them (Access
removed) — unless the system or either account is being deleted, when there is nobody to tell and the insert
would fail its foreign keys. Nothing pushes them: the app asks for the unread ones every minute and on coming
back (`src/features/notifications/queries.ts`), and an unread one it has not seen makes it fetch the systems
list, requests, codes and members again — how an approved person's system appears, and a revoked one's leaves,
within a minute (phone emulator, 2026-10-14: seconds and 35 s).

Rejected: invites by email (the claim triggers above) — codes are the only way in; codes the owner types —
guessable, and an existence oracle; Realtime — a subscription to keep alive for a minute's latency; these
tables as doctypes — no role may let someone in. Out of scope: push notifications, editing a code (delete it
and make another). Unverified: two people using a one-person code at the same instant (the row lock is
standard Postgres; the probes ran in one session).

### Employees & permissions — `20261014034106_employees_and_permissions.sql`

Discord-style roles in place of ERPNext's (`.claude/updates-and-revamps/roles-perms-references/`). The owner
makes roles, turns permissions on for each, gives every employee one role, and may turn a permission on or off
for one employee alone — that employee's own setting wins. Someone with no role sees Home only. Supersedes Step
11's roles, role profiles and permission matrix, and Step 21's User Permissions (the human's call, 2026-10-13:
removed, not rebuilt).

| Table | Holds |
| --- | --- |
| `permissions` | global, read-only: 20 abilities in five groups — `key`, `label`, `description`, `position`, and `requires`, the one it needs (Process Sales and Process Refunds need Open/Close Register; Apply Discounts needs Process Sales) |
| `permission_rules` | global, read-only: what each permission reaches, as ERPNext's doctype × type (`select`, `read`, `write`, `create`, `delete`, `submit`, `cancel`). Every permission also gets `select` on the seven one-row settings every screen reads (System Settings, Global Defaults, Currency, Accounts, Selling, Stock and Print Settings) |
| `role_grants` | per system: a role's permissions. Owner-only (`for all` on `owned_merchant_ids()`) |
| `member_overrides` | per system: one employee's exceptions — `permission`, `allowed`. Owner-only |
| `roles` | now the owner's own, every one: `role_name`, `description` (≤ 200), `color` (one of 13 palette keys). ERPNext's 50 seeded roles are deleted, and `is_standard`, `disabled` and the name guard with them |
| `merchant_members` | gains `role_id` — one role, or none; deleting the role leaves its holders with none (`on delete set null (role_id)`). Loses `role_profile_id` and `enabled` |

**What each permission reaches** (the rules, abridged — `select` is a lookup: a price, a field's options):

| Group | Permission | Reach |
| --- | --- | --- |
| Sales & POS | Process Sales | sells: POS Invoice select/create/write/submit, and looks up what the Register prices with |
| | Apply Discounts | nothing more: the poster checks it |
| | Process Refunds | POS Invoice read/create/write/submit — opens a sale to return it |
| | Void Transactions | POS Invoice read/cancel/delete |
| | View Sales | POS Invoice read: Orders and the Dashboard's sales |
| Payment & Cash | Open/Close Register | POS Opening and Closing Entry select/create/write/submit |
| | View Shift Totals | both entries read: the sessions, their closings, the cash a drawer should hold |
| | Close Any Register | POS Opening Entry read/cancel, POS Closing Entry select/create/write/submit |
| Inventory | View Stock Levels | Bin, Stock Ledger Entry and Item read |
| | Manage Items | Item and Item Price read/write/create/delete |
| | Receive Shipments | Stock Entry read/write/create/delete/submit |
| | Adjust Inventory | Stock Reconciliation in full, cancel included; Stock Entry read/cancel |
| Accounting | View General Ledger | GL Entry read |
| Setup | Store & Calendar | Company, Global Defaults, System Settings, Currency read/write; Fiscal Year in full |
| | Accounting & Payments | Account, Mode of Payment in full; Accounts Settings read/write |
| | Taxes | the four tax doctypes in full |
| | Stock Setup | Warehouse, UOM, UOM Conversion Factor, Brand, Item Group in full; Stock Settings read/write |
| | Selling & Pricing | Price List, Pricing Rule in full; Selling Settings read/write |
| | POS Profiles | POS Profile in full; looks employees up (`User` select) for its users |
| | Naming & Printing | Print Format, Letter Head in full; Document Naming Settings, Print Settings read/write |

The owner, and only the owner: Employees, roles and exceptions, Access Codes.

**The engine** (definer, in `private`, `search_path = ''`, answering for `(select auth.uid())`):
`my_permission_keys()` — the caller's effective permissions everywhere: the role's grants less what an
exception turns off, plus what one turns on, each kept only with the one it requires (recursive), so a later
change to a role cannot leave Apply Discounts standing alone. `has_permission(merchant, key)` — the owner holds
all. `permitted_merchant_ids(doctype, ptype)` keeps its signature and now reads the rules (a `read` rule answers
`select` too), so every policy, poster and RPC that asked it still works; `my_permissions(merchant)` keeps its
shape and adds `permissions`, the keys. `current_merchant_ids()` (no more Enabled), `pos_profile_usable()` and
`assert_postable()` (the frozen period's role is the member's `role_id`) are re-created to match.

**The sale's poster** (`private.submit_pos_invoices()`, re-created from Step 20's): a sale needs Process
Sales (`sales_not_permitted`), a return Process Refunds (`refunds_not_permitted`), and a discount — on the sale,
on a line, or a rate typed more than one smallest unit away from the line's Price List Rate — Apply Discounts
(`discounts_not_permitted`); all 42501, the owner excepted. A Pricing Rule's price needs nothing.

**The policies.** `apply_doctype_policies()` is re-created without User Permissions or link clauses — select
← `select`, insert ← create, update ← write, delete ← delete; a child table's select ← its parent's `select`, its
writes ← its parent's write — and re-applied to all 55 tables (38 parents, 17 children). Then the old model goes:
`role_permissions`, `standard_role_permissions`, `role_profiles` and `role_profile_roles`, `member_roles`,
`user_permissions`, `doctype_links`, `doctypes.restrictable`, the Role Profile, Role Permission and User
Permission doctypes, and their functions.

**The owner's saves** — security invoker, so `role_grants`', `member_overrides`' and the members' policies decide:
`save_role(payload)` writes a role, its permissions and — with `member_ids` — who holds it (they move to it;
anyone left off loses it); `save_member_access(member, role, overrides)` sets an employee's role and replaces
their exceptions. Both refuse a set that breaks a requirement (`permission_requires`, the label in `detail`).
**"Access changed"**: `private.notify_access_changed()` on `role_grants`, `member_overrides` and a member's
`role_id` tells each employee a change reaches — once, while it is unread.

**Starter roles**, in every system (`private.seed_roles()`, from `merchants_seed_20_access`, and backfilled):
Cashier (green: Process Sales, Open/Close Register), Stock Clerk (orange: View Stock Levels, Receive Shipments),
Store Manager (maroon: every permission). A role the owner already has by that name is left alone.

**The app.** **Employees** is a destination for the owner alone (`ownerOnly` in `DESTINATIONS`), its own Stack
(`src/app/(app)/systems/[id]/employees/`): the list (`src/screens/employees/index.tsx` — the owner pinned, search,
a chip per role, a table wide), an employee's permissions (`employee.tsx` over `editor/access-editor.tsx`: the role,
how far they are from it, every permission as a switch, "Role: On/Off" where they differ), the roles
(`roles.tsx`) and a role's page (`role.tsx` over `editor/role-editor.tsx`: General with 13 colours, Permissions,
Members), and on a tablet two panes that ask before dropping unsaved changes (`roles.tsx`, `permissions.tsx`). The
checks are import-free in `src/features/permissions/access.ts` (`can`, `has`, `showsDestination`, `toggle`,
`effective`, `overridesFor`), asserted in `tools/check-logic.mjs`. What changed on other screens: the Dashboard's
blocks follow View Sales, View Shift Totals / Close Any Register and View Stock Levels; Sell shows the session box
for whoever may open one and **Register** only with Process Sales; **Return** needs Process Refunds; the cart's
rate and discount fields need the POS Profile's switches **and** Apply Discounts, and `buildSale` ignores a typed
price without it; the in-system Home tells someone with no role why it is empty. Setup → Users & Access is gone.

How it was checked: a rolled-back probe harness of 30 identities — the owner, no role, each permission alone with
its requirement, the starter roles, exceptions on and off, a broken requirement, an outsider — comparing what RLS
lets each read and write with what `my_permissions` says, 0 mismatches; the revert run twice to a catalog identical
to before (1,946 items); then the phone run (`.claude/tests/test-report/`, 2026-10-14). Two bugs that run found and
fixed: the editors never enabled Save on a saved role or employee (the React Compiler and a `form` object passed
down — they read `useFormState` now), and an open app missed a change while an earlier "Access changed" was unread
(`usePermissions` asks every minute).

Rejected: keeping ERPNext's model — too fine for a shop owner; several roles per employee (Discord's own) — one
role and the employee's exceptions, the human's call; a `has_permission` call in each table's policies — fifty-five
policies to rewrite, and a permission's reach no longer one table of rules. Known limits (tenancy.md §7): a `select`
rule is a full read through the API — Process Sales can read every sale there, though no screen lists them without
View Sales; Apply Discounts is checked against the Price List Rate the app sends. Tablet layouts are built and
untested (owed).

### Backend performance — `20261014170428_backend_performance.sql`

Before deployment, `supabase/database-improvements.txt` (a review of the schema dump) was checked item by item against
the live functions, the app's queries and `get_advisors`, and applied where it held (2026-10-15). No table, no new
behaviour, no change to `src/` or to `database.types.ts`.

| Applied | What it does |
| --- | --- |
| `bins`, `naming_series_counters`: fillfactor 70, autovacuum at 1% | every sale rewrites its items' bins and its series counter; neither update touches an indexed column, so free room on the page lets Postgres update in place (HOT) |
| `pos_opening_entries_open_merchant_idx` | a system's open sessions — the Dashboard's Open Registers |
| `pos_invoices_submitted_date_idx` `(merchant_id, posting_date desc) include (id, net_total, is_return) where docstatus = 1` | an index-only scan for `dashboard_cards`, `sales_by_day` and `top_selling`; `id` is included because all three read it |
| `notifications_unread_idx` `(user_id, created_at desc) where read_at is null` | the unread poll every minute, and Mark all as read |
| `dashboard_cards` | Low Stock counted directly instead of through `stock_alerts()` (which sorted every alert to count them), keeping the `warehouses` join so the caller's policies see the same rows; a session's Cash payments read once instead of twice |
| the eight `save_*` RPCs | child rows deleted only when the record was already saved — a new one has none; `import_items` gains through `save_item` |

How it was checked: the new `dashboard_cards` against the old body, side by side in rolled-back blocks, as the owner,
a Store Manager, a Stock Clerk and a Cashier over four periods, with open sessions, change, mixed payments and a low
bin made up for the run — 0 differences, before and after the apply. The `save_*` bodies differ from the live ones
only by the moved `delete` lines (a line-by-line check), and the live bodies after the apply hash-match the migration
file. The revert's bodies hash-match the bodies the database held before. Plans with sequential scans off: the
submitted-sales index serves an index-only scan, the unread index serves the poll; for open sessions the planner
picked the existing `pos_opening_entries_one_open` partial index at the dev database's few rows.

Rejected, with the human on 2026-10-15:
- **Numbering a document at the end of its submit**, to hold the series counter's row lock for less of a sale.
  `post_gl` and `post_sle` write the name as `voucher_no`, a document keeps its name (`guard_docstatus`), and a draft
  Stock Entry shows its number from its first save; two tills of one shop already queue on the shared `bins` lock.
- **`CACHE 100` on the ledger sequences.** The General and Stock Ledger order a day's rows by `id`; cached blocks
  hand ids out of order across connections. `nextval` already writes WAL only once per 32 values.
- **Dropping `bins_item_idx`.** No bin update touches it (HOT does not depend on how many indexes a table has), and it
  covers `bins_item_fk`.
- **Statement-level child guards.** `guard_docstatus_child` is the drafts-only boundary; per row it costs one
  primary-key lookup.
- **`(id, merchant_id)` as `pos_invoice_items`' key, an item-name or trigram index** (the Register searches on the
  device; lists order by `item_code`), **wider ledger voucher indexes** (`voucher_id` is a uuid), **Supavisor's
  transaction port** (the app reaches Postgres only through PostgREST), **a `pg_cron` clean-up** (expired codes and
  read notifications are still on screen; the claim's rate-limit rows prune themselves per person).

Not in the review and left as they are: `get_advisors`' 38 INFO unindexed foreign keys, mostly `merchant_id` on
child tables — they matter when a whole system is removed.

### Item barcodes — `20261015000059_item_barcodes.sql`

The key the Register's scan finds an item by (Product scan, below). `items.barcode` is nullable text, held to
`items_barcode_shape` (1–64 printable ASCII characters, no spaces) and unique within a system by the partial index
`items_barcode_unique (merchant_id, barcode) where barcode is not null` — two systems may sell the same product. No
new table, so RLS and the Item doctype's policies already cover it.

`save_item` re-created from its backend-performance body: an insert takes `nullif(btrim(payload ->> 'barcode'), '')`;
an update takes the barcode only when the payload names the key, so a build from before this migration — which sends
no `barcode` — cannot clear one. `import_items` and `save_item_with_opening_stock` reach it through `save_item`
unchanged; the CSV template has no Barcode column yet. The revert restores the previous body and drops the index,
the check and the column, with every item's barcode.

Checked in a rolled-back block as two owners (2026-10-15): trimmed on save, a duplicate refused with 23505 on
`items_barcode_unique`, blank stored as null, a space refused by the check, a payload without the key keeps the
barcode and `''` clears it, `import_items` unaffected, the same barcode allowed in another system, another owner's
update refused (`item_not_found`).

Rejected: **the Item Code as the barcode** — a shop's codes are its own (`NOTE-A5`), and Item Naming By can number
them from a series; **ERPNext's Item Barcode child table** (several barcodes, a type per row) — one per item covers a
shop's packs, and a unit's own barcode can come with the units when asked; **matching the scanned label's name** to
find an item — a guess at the till charges the wrong product.

### One store — `20261018162135_single_store.sql`

What a person creates is **one store**: a single business with no branches (the human's call, 2026-10-19). Two
ERPNext things exist only to tell several companies or branches apart, and both went, data included:

- **Cost Centers** (docs.frappe.io/erpnext/cost-center: "which team, branch, project, or business unit") — the
  `cost_centers` table, its doctype row and permission rules, and the 13 columns that named one:
  `merchants.cost_center` and `round_off_cost_center`, `sales_tax_template_rows.cost_center`, the
  `selling_cost_center` of brands, item groups and items, `gl_entries.cost_center_id`, the two stock documents'
  `cost_center`, the POS Profile's `cost_center` and `write_off_cost_center`, and `cost_center` on a sale's items
  and taxes — each with its foreign key and index.
- **The Abbreviation** (docs.frappe.io/erpnext/company: "short suffix used to distinguish company-specific accounts,
  cost centers, and warehouses") — `merchants.abbr` and `merchants_abbr_shape`. Nothing in the database read it;
  the app showed it after account and warehouse names, and no longer does.

23 functions were re-created from their latest bodies without a cost center, signatures unchanged.
`private.post_gl` merges rows **per account** and needs no cost center on a Profit and Loss row
(`cost_center_unusable` is gone); `cancel_gl` copies rows without one; `validate_tree` lost the cost-center root's
delete lock, its only delete rule; `validate_company_accounts`, `validate_tax_account`, `validate_defaults`,
`validate_stock_document` and `validate_pos_profile` lost their cost-center checks; the seeds no longer make a
cost-center tree or default; the posters and the `save_*` RPCs no longer read or write one. Five triggers were
re-created first, since an `UPDATE OF` list naming a column blocks dropping it. A build that still sends a
cost-center key is ignored (`jsonb_to_recordset` skips undeclared keys); one that still selects `abbr` or a
cost-center column is refused by PostgREST, so the app change ships with it.

Words only, identifiers kept: the database's texts say store — the permission **Store & Calendar** ("The store, its
fiscal years, currency and defaults."), the Store Manager's "Every permission in the store." (only where the owner
had not edited it), "People join a store by using one of its access codes.", "…nor the store names an inventory
account." The app says store wherever it said system or company; `merchants`, `merchant_id`, `/systems/[id]`, the
doctype `'Company'` and the error codes stay. **Account Head** (a tax row's ledger), **Round Off Account** and
**Warehouses** stay: they are not branch concepts — a store may keep a stockroom and a shelf.

Applied through the Supabase MCP as the migration file's statements, with 15 of its 23 function bodies derived on the
server from their live definitions by edits each asserted to match — so a drifted body would have stopped it. After:
all 23 `prosrc` bodies equal the file's byte for byte (md5), no column, table, function body or registry row names a
cost center or `abbr`, and every store's per-account GL balance equals the snapshot taken before. Checked in
rolled-back blocks as owners (2026-10-19): a sale with tax, a line and an additional discount (Discount Accounting
on), rounding and a write-off, voided; a sale returned in full; a Material Receipt and a Stock Reconciliation
submitted and cancelled; a session closed; a pre-migration Stock Reconciliation cancelled — every voucher balanced;
a new store seeded exactly like one made before (34 accounts, a tax template with its account, three roles);
`save_item_with_opening_stock` and `import_items` posting their openings. The revert's 23 function blocks are byte
for byte their latest earlier definitions; its other statements ran rolled back and restored the table, its
policies, the columns, keys, indexes, triggers and texts, initials as abbreviations, every store on "Main", and a
stock entry posted with its cost center under the old functions. The revert cannot bring back a deleted cost center,
a cost center a row named, or an abbreviation an owner chose.

Rejected: **keeping cost centers hidden** with one "Main" per store — every posting would still carry a column
nobody sees, and a P&L row would still be refused without it; **renaming the identifiers** (`merchants` → `stores`,
`/systems` → `/stores`) — every table's foreign key, policy and route for no change a person sees; **dropping
Warehouses** with the branches — a store's stockroom and shelf are places, not branches.

---

## Frontend wiring

The UI rules themselves are in [.claude/instruction-mds/frontend.md](./.claude/instruction-mds/frontend.md). What
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

**The tablet pass (2026-10-19).** `WIDE_MIN` is 600, so a tablet held upright (800dp) gets the rail, tables and
Dialogs as one held sideways does; a phone stays under it. On a wide window the Register is two panes — the items
and, beside them, the Cart's own form (`CartPane`, `src/screens/register/cart.tsx`), so a sale is rung up without
leaving the page; the Dashboard's period switch moves into its page header, its number cards fill one row and its
blocks sit two to a row where they fit; the three trees (Chart of Accounts, Warehouses, Item Groups) draw a table;
Notifications and every full-page form, footer included, are held to `FORM_MEASURE`; and a `FieldGrid` too narrow
for two half fields (the Register's cart upright) stacks them. Checked on the Medium Tablet emulator held both
ways, at font scale 1.0, 1.3 and 2.0, and at a phone's width, where nothing changed. Rejected: keeping 840 (an
upright tablet got the phone's drawer and bottom bar); a second, tablet-only Register screen (rule 14: one
threshold, no tablet-only screens); a measured cart-pane width (flex shares follow the pane, rule 15).

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
([.claude/instruction-mds/structure.md §3](./.claude/instruction-mds/structure.md)). `src/features/merchants/queries.ts` is the only file
in the app that knows the table is called `merchants`.

What a person may do in a system comes from `usePermissions({ merchantId })`
(`src/features/role-permissions/queries.ts`, the `my_permissions` RPC) with `can(permissions, doctype,
ptype)` and `has(permissions, key)` (`src/features/permissions/access.ts`). Screens use it only to hide what RLS
would refuse — a Setup row, a **New** or **Save** button, a field left editable, a rail destination with nothing
in it to open; the policies stay the boundary. Saving a role or an employee's access invalidates it, and it is
asked again every minute, so an owner's change on another phone reaches an open app within one (Employees &
permissions, above).

Paper's icons go through `PaperProvider`'s `settings` prop in `src/app/_layout.tsx` to
`renderIcon` (`src/lib/icons.tsx`), which draws each app icon name as the platform's own symbol with
`expo-symbols` and falls back to MaterialCommunityIcons for Paper's internal names and the brand logos.
Paper's own default goes through `react-native-vector-icons`, whose font files nothing here loads, so
icons would render as blank boxes. `react-native-vector-icons` stays in `package.json` because Paper
imports it internally regardless of the override.

## Product scan

A camera page that reads a product for the person: on the Item form it fills a new item, at the Register it
rings one up. Everything runs on the phone — Google ML Kit, no network, no per-scan cost.

```
Item form ── Scan Product ─┐                         ┌─ barcode ─ onBarcode ─ the form's Barcode (+ an empty typed Item Code)
                           ├─ src/Store/scan.ts ─ /scan                         or addToCart, at the Register
Register ── barcode button ┘   (mode, callbacks)     └─ Read Label / Choose Photo ─ recognizeText ─ readLabel ─ empty fields
```

- **The route.** `src/app/(app)/scan.tsx`, a full-screen leaf of the `(app)` stack like `create-system`. A route
  cannot take a callback, so the screen that opens it leaves `{ title, mode, onBarcode, onLabel? }` in
  `src/Store/scan.ts` first — the picker's pattern.
- **Barcodes**, live: `expo-camera`'s `CameraView` with `barcodeScannerSettings` EAN-13, EAN-8, UPC-A, UPC-E and Code
  128 — on Android its scanner is ML Kit's barcode model. A code still in view is reported every frame, and one frame
  can misread a slanted barcode as another valid code (seen on the emulator), so `src/lib/barcode.ts` counts a code
  only once three frames running agree. At the Register the same code counts again after 2 s out of view, so holding
  a jar up adds one and showing it twice adds two; on the Item form never — taking the label's picture pauses the
  scanner longer than that, and the repeat would cover what the label said. The
  Register looks the code up among the items it has loaded — `barcode`, then `item_code` (a shop's own Code 128
  labels) — and refuses one its POS Profile does not offer (`offeredItems` without the search).
- **Labels**, from one picture: **Read Label** (`takePictureAsync`) or **Choose Photo** (`pickImage`,
  `src/lib/files.ts`) hands the file to `recognizeText` from `@infinitered/react-native-mlkit-text-recognition` —
  ML Kit text recognition v2, Latin script. `src/features/items/label.ts` (import-free, in `check:logic`) turns its
  lines into the fields: the first ₱ / PHP / P amount is the Standard Selling Rate; an existing Brand named as a whole
  word, the longest first; the tallest line left is the name; up to four more are the description; a line of digits
  and separators alone (the numbers under a barcode, a date or time stamp) is none of them. The form fills only empty
  fields (`setValue` with `shouldDirty`), except Barcode, which is the scan's own, and answers whether the label held
  anything: nothing keeps the scan open on "No print found".
- **Permission.** `useCameraPermissions({ request: true })`; refused for good, the page offers `Linking.openSettings`
  and asks again whenever the app returns to the foreground — the hook itself asks only when it mounts.

Packages, both native (a development build, not Metro, picks them up): `expo-camera` 57.0.6, with its config plugin
in `app.json` (`cameraPermission`, `recordAudioAndroid: false` — no microphone permission for a scanner), and
`@infinitered/react-native-mlkit-text-recognition` 5.0.1 (an Expo module, `com.google.mlkit:text-recognition:16.0.1`
bundled, so it works with no Play-services download) with its `@infinitered/react-native-mlkit-core`.

Rejected:
- **A cloud OCR or a vision model** for the label — a network round-trip and a cost per scan for what the phone reads
  in a fraction of a second. It is the named next step (Claude through an Edge Function) for what ML Kit cannot do:
  picking an Item Group, reading a supplier's receipt into a Stock Entry.
- **`@react-native-ml-kit/text-recognition`** — it bundles the Latin, Chinese, Devanagari, Japanese and Korean models
  into every build. **`expo-mlkit-ocr`** — it needs `useFrameworks: static` and iOS 16 for the whole app.
- **A barcode read from a chosen photo** (`scanFromURLAsync`). On Android it loads the picture through
  `expo-image-loader`, which is not installed; without it the call's promise never settles
  (`CameraViewModule.kt`, `appContext.service<ImageLoaderInterface>()?.`). Choose Photo reads words only.
- **Text recognition on live frames** — a frame processor and a second native package, for a label that one picture
  reads.

Testing on the Android emulator (2026-10-15): the back camera is the virtual scene, and `adb emu virtualscene-image
wall <png>` puts a label on its wall poster, which the device pose (the emulator's gRPC `setPhysicalModel`, rotation
and position) aims the camera at — live barcodes work there. Its still capture does not: `takePictureAsync` returns a
black frame with the date and time stamped on it, so Read Label is checked on a phone, and Choose Photo stands in for
it on the emulator (same recognizer, same parser).

Not built (named, for when asked): a supplier's delivery receipt into Stock Entry rows, a shelf price tag into an
Item Price, a count sheet into a Stock Reconciliation, a Barcode column in the CSV template, a haptic on each scan.
