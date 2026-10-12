# React Native + Expo SDK 57 + Supabase — Auth Scaffold

A starting point for an app that needs Supabase auth on day one: clone it, fill in `.env`, build
your screens on top. Authentication, session handling, deep linking and OAuth are already wired
together and explained inline.

> How the pieces work — the file map, the client options, the session store, the route guard, the
> sign-in paths and the frontend rules — is in [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> The conventions for what you build on top — feature folders, the data layer, tenancy and the
> frontend — are in [`.claude/instruction_mds/`](./.claude/instruction_mds/), indexed in
> [CLAUDE.md §2](./CLAUDE.md#2-how-to-work-on-this).

**Contents**

- [What ships](#what-ships)
- [1. Setup](#1-setup)
- [2. Patched dependencies](#2-patched-dependencies)
- [3. Supabase project](#3-supabase-project)
- [4. Google sign-in](#4-google-sign-in)
- [5. Facebook sign-in](#5-facebook-sign-in)
- [6. Run it](#6-run-it)
- [Verify](#verify)

---

## What ships

- **Expo SDK 57** — React Native 0.86, React 19.2, expo-router v7, New Architecture
- **Google and Facebook social login** — native Google sheet on device, system-browser OAuth for
  Facebook
- **Session handling** in one zustand store — restore, auto-refresh, sign-out
- **Session stored in the Keychain / Keystore** via `expo-secure-store`, not plaintext AsyncStorage
- **SQL migrations** for `profiles` and `merchants` with RLS, the tenancy seam, and in-app account deletion
- **A systems list and a merchant shell** — create a system (a company: name, abbreviation, country,
  currency), remove it, open it onto a header and a rail (tablet) or drawer (phone) with four
  destinations: Home, Stock, Accounts and Setup
- **Setup, the POS foundation on ERPNext's model** — the Company and its Fiscal Years; Users & Access
  (invite people by email, standard and custom roles, role profiles, an editable Role Permissions
  Manager and User Permissions, all enforced by RLS); Global Defaults, System Settings and the Currency
  (ERPNext's rounding, number formats and amount in words); the Chart of Accounts and Cost Centers as
  folders; the Company's default accounts, Perpetual Inventory and Accounts Settings; Modes of Payment;
  Taxes — Tax Categories, Sales Taxes and Charges Templates (rows on the net total, on an earlier row, fixed
  or per unit, inside or on top of the price, with a live preview) and Item Tax Templates; Stock — Warehouses
  as folders (each showing the stock account its value posts to), UOMs and their conversions, Price Lists,
  Brands with their sales defaults, Item Groups as folders (their defaults and Item Tax rows) and Stock Settings
  (what a new item starts with, FIFO or Moving Average); Tax Rules choosing a sale's template by tax category,
  item group and date, with a check of which template a sample sale gets; Selling Settings' pricing rules;
  Document Naming Settings — the series invoices and items are numbered by, and the number each is at; Print
  Formats with a sample receipt, Letter Heads and Print Settings.
  Each new system is seeded with its year, roles, settings, a POS chart of accounts and Main, its default
  accounts, Cash and Credit Card, its country's tax (Philippines: VAT 12%), All Warehouses → Stores, thirteen
  units with three conversions, Standard Selling, All Item Groups → Products, Services, Stock Settings on
  Products, Nos, Stores and FIFO, the three naming series ERPNext ships, Print Settings, a POS Receipt print
  format and a letter head in its own name
- **Stock, the Item master** — Items (code typed or numbered by the Item series, item group, units and
  conversion factors, valuation method, re-order level, sales defaults, Item Tax rows) and Item Prices (a rate
  per item, price list and unit, with optional dates; a new item's Standard Selling Rate becomes its first
  price), each a searchable list
- **Stock documents and ledgers** — Stock Entries (Material Receipt, Issue, Transfer) and Stock
  Reconciliations (Opening Stock, a count against the books): a draft is saved, **Submit** posts it, **Cancel**
  reverses it. Posting writes the Stock Ledger and the Stock Balance, valued by FIFO or Moving Average, and
  with Perpetual Inventory the General Ledger — three read-only reports with filters, each row opening its
  document. A new item can carry its Opening Stock
- **POS Profiles** — a register's settings under Setup → Point of Sale: its warehouse, price list, taxes and
  print layout, the users who may use it, the payment methods it offers (a default, Allow in Returns), the
  item groups it lists, the accounts that win over an item's, and its switches
- **Sell** — a rail destination: a cashier opens a session on a register with what its drawer holds, sells at
  the Register (search, cart, quantity, unit, taxes, rounded total, one amount per payment method, change),
  and closes the session against a count. A sale posts its stock and its ledger entries at once, shows its
  receipt on screen, and is reopened from Orders
- **React Native Paper** for the whole UI, themed from `src/themes.js`
- **Patched dependency** via `patch-package`, applied automatically on install
- **Lint** — oxlint with a local `anti-slop` plugin in `tools/oxlint/`, wired up in `.oxlintrc.json`

Exact versions are in `package.json`.

> **Expo Go will not work.** The Google sign-in module is native code, and a custom `scheme` has
> no effect in Expo Go at all, so every test needs a development build (`npm run ios` /
> `npm run android`).
>
> **There is no web target.** This is a phone and tablet app and will not become a website. Nothing
> here is built, run or debugged in a browser. The one place a browser appears is Facebook sign-in,
> which opens the *device's* system browser and hands the session back through
> `mobilemerchant://` — see [5. Facebook sign-in](#5-facebook-sign-in).

---

## 1. Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` as you complete the steps below, then restart the dev server — Expo only
reads env vars at startup.

---

## 2. Patched dependencies

`patches/react-native-paper+5.15.3.patch` fixes `Surface`: its flex check ignored `flexGrow`, so
a Surface styled with `flexGrow` alone never got `flex: 1` and collapsed.

```js
// before
flex: flattenedStyles.height || !container && flattenedStyles.flex ? 1 : undefined,
// after
flex: flattenedStyles.height || !container && (flattenedStyles.flex || flattenedStyles.flexGrow) ? 1 : undefined,
```

Both builds carry the change: `lib/module/components/Surface.js` (line 102) and
`lib/commonjs/components/Surface.js` (line 110).

`npm install` applies every patch through the `postinstall` hook, so a fresh clone needs nothing
manual. To change or add one: edit the files under `node_modules/<package>/`, regenerate, and
commit the result.

```bash
npx patch-package react-native-paper   # writes patches/react-native-paper+5.15.3.patch
```

---

## 3. Supabase project

### API keys

**Project Settings → API Keys** — copy the **publishable** key (`sb_publishable_…`) into
`EXPO_PUBLIC_SUPABASE_KEY`, and the project URL into `EXPO_PUBLIC_SUPABASE_URL`.

The legacy `anon` key still works but is being retired at the end of 2026; the publishable key
is the replacement and is safe to ship in a client bundle because RLS still gates every query.
Never put the secret key (`sb_secret_…`) in an `EXPO_PUBLIC_` variable — it bypasses RLS.

### Redirect URLs

**Authentication → URL Configuration → Redirect URLs** — one entry:

```
mobilemerchant://**
```

That is this app's scheme (set in `app.json`), and it is how the Facebook browser flow hands the
session back to the app. There is no web entry: this app has no web target, so nothing ever
redirects to `localhost`.

### Site URL

**Authentication → URL Configuration → Site URL** — Supabase requires a value here even though this
app never opens one. Leave it at whatever the project was created with.

> **Why it still matters.** When Supabase cannot match a `redirect_to` against the allow-list above
> it **silently falls back to Site URL** rather than erroring. So a typo in the scheme, or a missing
> `mobilemerchant://**` entry, does not produce an error — the browser is sent somewhere the app is
> not listening, `openAuthSessionAsync` never sees its prefix, and the sign-in appears to do
> nothing. That silence is the single most likely cause of a Facebook sign-in that hangs, and
> `auth.ts` logs the exact `redirectTo` on a dismiss for that reason.

### Database schema

`supabase/migrations/` holds the person, the tenant and the first business tables. `profiles` is
keyed to `auth.users` and carries its RLS policies, a trigger that creates the profile row on signup,
and `delete_current_user()` — the function behind the **Delete account** button, since the App Store
requires in-app account deletion (Guideline 5.1.1(v)) and no client-side key may write to
`auth.users`. `merchants` is the tenant table — one business per row: its owner, and its Company
fields (name, abbreviation, country, default currency) — with its own policies and
`private.current_merchant_ids()` — the systems a person owns or is an enabled member of — with
`private.permitted_merchant_ids(doctype, permission)` built on it, the function every business
table's policies call. `countries` and `currency_presets` are read-only reference data seeded from
frappe's country list; `fiscal_years` holds each company's accounting years. Users & Access adds
`merchant_members`, `roles`, `role_profiles`, `role_permissions`, `user_permissions` and the global
`doctypes` and `standard_role_permissions`; Defaults & Money adds `system_settings`, `global_defaults`
and `currencies`; Step 3 adds the `accounts` and `cost_centers` trees; Step 4 the Company's default accounts
and Perpetual Inventory (columns of `merchants`) and `accounts_settings`; Step 5 `modes_of_payment`; Step 6
`tax_categories`, `sales_tax_templates`, `item_tax_templates` with their rows, and the read-only
`tax_presets` the country's tax is seeded from; Step 8 `warehouses`, `uoms`, `uom_conversion_factors`,
`price_lists` and `brands`; Step 9 `item_groups` with their `item_group_taxes`, and `selling_settings`; Step 7
`tax_rules`; Step 10 `stock_settings`; Step 12 `naming_series` with its `naming_series_counters`, and
`print_formats`, `letter_heads` and `print_settings`; Step 13 `items` with their `item_uoms` and
`item_taxes`; Step 14 `item_prices`; Step 15 the ledgers `gl_entries`, `stock_ledger_entries` and `bins`;
Step 16 `stock_reconciliations` and `stock_entries` with their rows; Step 17 `pos_profiles` with its
`pos_profile_users`, `pos_profile_payments` and `pos_profile_item_groups`; Step 18 `pos_opening_entries`,
`pos_invoices` and `pos_closing_entries` with their rows. Triggers named
`merchants_seed_NN_<area>` fill each new system. An earlier business schema is in the history and
dropped by a later migration — `ARCHITECTURE.md` describes each.

```bash
supabase link --project-ref <ref>
supabase db push
```

If `supabase db push` (or `supabase migration list`) stops at `Initialising login role…` with
`permission denied to alter role`, give the CLI the database password and it skips that step. The
password is under **Project Settings → Database** — reset it there if you never had one; the app
itself never uses it:

```bash
export SUPABASE_DB_PASSWORD='…'     # PowerShell: $env:SUPABASE_DB_PASSWORD = '…'
                                    # cmd:        set "SUPABASE_DB_PASSWORD=…"
supabase db push
```

Every statement is re-runnable, so pasting `supabase/all-in-one/add.sql` — every migration, in order
— into the dashboard's **SQL Editor** also works. The SQL Editor does not record what it ran,
though: follow it with `supabase migration repair --status applied <version> …` for each file, or
`supabase migration list` shows them as never applied. Its counterpart `supabase/all-in-one/revert.sql` undoes the lot and
destroys the data with it; both are generated, never edited — see
[`.claude/instruction_mds/migrations.md`](./.claude/instruction_mds/migrations.md).

> **You have to enable RLS on every table you add.** Nothing in this scaffold does it for you.
> A new table in `public` is published over HTTP by PostgREST the moment it exists, and the
> publishable key that reaches it is inside your app bundle — so a table without
> `alter table … enable row level security` is world-readable to anyone who opens the binary.
> The migration sets it explicitly for `profiles`; copy that line into yours.

Check the ones you missed under **Advisors → Security** in the dashboard, which reports
`rls_disabled_in_public`. Worth a look before any release. (`supabase db lint` is a different
tool — it type-checks plpgsql and says nothing about policies.)

`supabase/migrations/20260902000003_rls_auto_enable.sql` tries to add a second line of defence: a
DDL event trigger that enables RLS on every table created in `public` from then on.

**On hosted Supabase it does not install.** Creating an event trigger needs superuser, and the
project's `postgres` role is not one, so the `DO` block around it only warns — the SQL Editor still
says *Success*, and `supabase db push` still succeeds. The trigger works on a local `supabase start`
stack and nowhere else. It is also invisible when it does exist: nothing leads a reader from an
unexpectedly empty query result back to it. Keep writing `alter table … enable row level security`
in your own migrations; on a hosted project that line is the only thing that turns RLS on.

---

## 4. Google sign-in

### Client IDs

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create OAuth
2.0 client IDs:

| Client type | Where it goes |
| --- | --- |
| **Web** | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, **and** Supabase → Auth → Providers → Google (Client ID + secret) |
| **iOS** | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — also derives the app's iOS URL scheme in `app.config.ts` |
| **Android** | needs your package name `com.haroised.mobilemerchant` and the signing-certificate SHA-1 |

Android has no separate ID in `.env`: the native module sends an ID token that Google issues
against the **web** client ID, which is what Supabase verifies.

### Authorized Client IDs

In Supabase's Google provider, add the iOS and Android client IDs to **Authorized Client IDs**
so `signInWithIdToken` accepts tokens minted by the native SDKs. Some projects show a single
**Client ID** field instead — there, comma-separate them with the web client ID first. Either
shape, the requirement is the same: every client ID that can mint a token must be registered, or
Supabase rejects a token the native SDK produced correctly.

### Consent screen

**Take the consent screen out of Testing.** While it is in Testing, only explicitly listed test
users can sign in; everyone else is refused on Google's own page inside the auth browser, so the
redirect never fires and it looks exactly like a broken redirect.

---

## 5. Facebook sign-in

### Meta app setup

Create an app on [Meta for Developers](https://developers.facebook.com/apps) with the
**Authenticate and request data from users with Facebook Login** use case, put
`https://YOUR-PROJECT.supabase.co/auth/v1/callback` in its **Valid OAuth Redirect URIs**, confirm
`public_profile` and `email` are **Ready for testing**, then paste the App ID and App secret into
Supabase → Auth → Providers → Facebook.

Nothing goes in `.env` — the client never touches the App ID, Supabase hosts the handshake.
Facebook never sees this app's scheme either; it only ever redirects to Supabase, and Supabase
redirects on to `mobilemerchant://`.

### Development mode

While the Meta app is in **Development mode**, only accounts with an App Role can sign in.
Facebook renders "App not setup" *inside* the auth browser, so the redirect never happens — the
same silent shape as Google's Testing-mode consent screen.

### On "Continue as \<name\>" showing up when you wanted the account picker

Facebook's own cookie outlives your app's sign-out, so the next attempt re-offers the same account.
Two things already address it, and a third is not possible:

- `queryParams: { auth_type: 'reauthenticate' }` (`auth.ts:84`) forces Facebook's login screen
  rather than clearing anything. This is the only portable lever.
- `preferEphemeralSession: true` (`auth.ts:97`) makes the auth browser a throwaway session with no
  shared cookies — **iOS only**, and honored at the browser's discretion.
- Clearing the cookies on Android is not possible. The Custom Tab runs in Chrome's process against
  Chrome's cookie jar; nothing in your app can reach it. Signing the user out of Facebook after a
  successful login would end their Facebook session in their everyday browser, which is worse than
  the problem.

---

## 6. Run it

```bash
npm run ios       # development build (macOS + Xcode), native Google sheet
npm run android   # development build, native Google sheet
```

`npm run ios` / `npm run android` compile a dev build with `expo run:*`. For a device build
without local native tooling, use `eas build --profile development`.

---

## Verify

```bash
npm run typecheck
npm run lint    # oxlint + the anti-slop rules
```

End-to-end, on a development build:

1. Sign in with Google → lands on the account screen with no explicit navigation call anywhere in
   the app.
2. Swipe the app away and reopen it — the session is restored from the Keychain / Keystore, no
   sign-in screen flash.
3. Sign out, then sign in with Facebook → same screen, "Signed in with facebook" on the card.
4. Sign in with Facebook again and press **Cancel** inside Facebook's own dialog → back on the
   sign-in screen with no error message.

Before debugging any redirect:

```bash
npx uri-scheme open mobilemerchant:// --android    # or --ios
```

This opens the app through its scheme with **no OAuth involved**. If the app opens, native
registration is fine and the problem is Supabase-side; if nothing happens, the deep link itself
is broken and no dashboard change will help.
