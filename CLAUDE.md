@AGENTS.md

# Project guide — Expo SDK 57 + Supabase auth scaffold

**Contents**

1. [What this is](#1-what-this-is)
2. [How to work on this](#2-how-to-work-on-this)
3. [The UI](#3-the-ui)
4. [Verified findings for `@supabase/supabase-js@2.112.3`](#4-verified-findings-for-supabasesupabase-js21123)
5. [Cookie isolation in the auth browser](#5-cookie-isolation-in-the-auth-browser)
6. [The database](#6-the-database)

---

## 1. What this is

A **scaffold**: the starting point for a React Native + Expo **SDK 57** app with Supabase
Authentication, Session handling, Deep Linking and OAuth already wired up. Clone it, fill in `.env`,
build on top.

Supabase's published React Native + Expo guidance does not describe SDK 57 or
`@supabase/supabase-js@2.112.3`, and most of the OAuth behavior that decides whether sign-in works
is undocumented. Treat the comments in `src/lib/` as the reference for this project: they name the
mechanism and cite the file it is enforced in. Keep them that way.

### The order the files explain each other in

```
secure-storage.ts → supabase.ts → auth.ts → Store/StoreUser.ts → src/app/_layout.tsx → the two screens
```

Same order to read them in, same order to change them in. `supabase/` is independent of that chain
and can be read at any point — see [§6](#6-the-database).

### The bar for anything added

Being a scaffold sets the bar: it has to survive being cloned by someone who has not read this file.
Prefer a comment naming the mechanism over a clever line, and keep every claim traceable to
`node_modules` per the rules below.

---

## 2. How to work on this

### Verify against `node_modules`, not against the docs

The published Supabase pages render client-side and are behind the installed version. Read these
instead:

```
node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
node_modules/@supabase/auth-js/dist/module/lib/helpers.js
node_modules/@supabase/auth-js/dist/module/lib/types.d.ts
node_modules/@supabase/supabase-js/dist/index.d.cts
node_modules/expo-secure-store/build/SecureStore.js
node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/
node_modules/expo-secure-store/ios/SecureStoreModule.swift
```

Every claim written into the guide should be traceable to a line in one of those. The native
directories matter as much as the JS: several limits attributed to `expo-secure-store` in tutorials
are enforced nowhere in the version installed here.

### Pin Expo docs to `v57.0.0`

Use `https://docs.expo.dev/versions/v57.0.0/`. `versions/latest` drifts to SDK 58 and stops
describing this project.

### Where the documentation lives

Three files at the root, and a change usually touches more than one:

| File | Holds |
| --- | --- |
| `README.md` | setup and dashboard configuration — the clone-and-run path |
| `ARCHITECTURE.md` | the file map and how the session flows through it |
| `CLAUDE.md` | this file: the rules, and findings that contradict published docs |

`docs/` holds the conventions for the code built on top of the scaffold. **Read the relevant one
before writing in its area** — each opens with its rules, and the rest of the file is the reasoning
behind them. Where a rule is already satisfied by something in the tree, the file names what exists
so you use it rather than build a second one:

| File | Governs |
| --- | --- |
| [`docs/structure.md`](./docs/structure.md) | which directories may exist under `src/`, and what is not a feature |
| [`docs/data-layer.md`](./docs/data-layer.md) | Supabase calls, Zod, TanStack Query keys and cache |
| [`docs/tenancy.md`](./docs/tenancy.md) | merchant scoping and the RLS shape every business table takes |
| [`docs/layout.md`](./docs/layout.md) | phone and tablet, column counts, the one width threshold |
| [`docs/typography.md`](./docs/typography.md) | the nine Paper `Text` variants, no type at a call site |
| [`docs/visual-language.md`](./docs/visual-language.md) | the Merchant mockups → theme colours, the accent, icons, and the Paper piece for each pattern |
| [`docs/migrations.md`](./docs/migrations.md) | revert files, and the generated all-in-one ADD / REVERT SQL |
| [`docs/device-testing.md`](./docs/device-testing.md) | testing a page or feature on the emulator — the human opens it, the agent drives it with `adb` |
| [`docs/testing-workflow.md`](./docs/testing-workflow.md) | running a test Flow: temp-fold tracking, the bug-fix loop, System-Test-History, silent operation |

Record a rejected option alongside the chosen one wherever the reasoning lives. A rule without its
rejected alternative gets re-litigated.

---

## 3. The UI

There is no local UI kit and there should not be one — no `src/styles/`, and no `src/components/`
until rule 4 below calls for it.

### Rules

1. No custom primitives — `Text`, `Button`, `TextInput`, `Menu`, `Switch`, `SegmentedButtons`,
   `Checkbox`, `DataTable`, `Dialog`, `Modal`, `ProgressBar` and `Icon` come from React Native Paper.
   Screen pieces composed from them are fine.
2. No hardcoded or inline colors — every color is a key in `src/themes.js`, read through Paper's
   `useTheme()` — or `useAppTheme()` from `src/lib/theme.ts` for the Merchant keys. A color the design needs and the theme lacks becomes a new key in both themes, never
   a literal — [`docs/visual-language.md`](./docs/visual-language.md) §3.
   `anti-slop/no-design-literals` fails `npm run lint` on color literals under `src/` outside
   `src/themes.js`.
3. No hardcoded or inline type — every string is a Paper `Text` with a `variant`. Never set
   `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`, `fontFamily` or `textTransform` at a
   call site; the same lint rule catches the first five. The scale is
   [`docs/typography.md`](./docs/typography.md) §2, written into `src/themes.js` through one
   `configureFonts` call.
4. Extract a component only when a second screen needs it.
5. Corners are square: `roundness: 0` in both themes, never a `borderRadius` by hand. The one
   exception zeroes react-navigation's own drawer corners, which `roundness` cannot reach —
   `src/app/(app)/systems/[id]/_layout.tsx`.

### Paper, its patch, and icons

- `react-native-paper` is patched by `patches/react-native-paper+5.15.3.patch`, applied by the
  `postinstall` / `patch-package` hook.
- Paper's icons are pointed at `@expo/vector-icons` through `PaperProvider`'s `settings` prop;
  Paper's own default goes through `react-native-vector-icons`, whose fonts nothing loads, so icons
  would otherwise be blank boxes. The renderer draws Feather first and falls back to
  MaterialCommunityIcons for names Feather lacks —
  [`docs/visual-language.md`](./docs/visual-language.md) §6.
- `react-native-vector-icons` stays in `package.json` because Paper imports it internally either way.

---

## 4. Verified findings for `@supabase/supabase-js@2.112.3`

Each of these contradicts the current tutorials, including Supabase's own. Every one is traceable
to a line in `node_modules`; check it there before changing anything below.

### 4.1 Client options to leave off

**Do not set `lock: processLock`.**
It is `@deprecated` in 2.112.3 and the legacy lock path is removed in v3. The client now
single-flights refreshes itself and lets the GoTrue server resolve cross-tab races. Setting it opts
into the legacy path.

**Do not set `detectSessionInUrl: Platform.OS === 'web'`.**
The library gates it on `isBrowser() = typeof window !== 'undefined' && typeof document !== 'undefined'`
(`helpers.js:24`, used at `GoTrueClient.js:389`). React Native has no `document`, so it is already
inert on native; `react-native-web` has both, so it is already on for web. The default is correct on
all three platforms.

**Do not set `skipBrowserRedirect`.**
Same shape as `detectSessionInUrl`: the redirect is gated `if (isBrowser() && !options.skipBrowserRedirect)`
at `GoTrueClient.js:4047`, so it is already unreachable on native, and on web `Platform.OS !== 'web'`
evaluates to `false` — identical to omitting it.

**`persistSession` and `autoRefreshToken` are already the defaults.**
Setting them configures nothing.

**No `react-native-url-polyfill`.**
Every `new URL(...)` in `auth-js` reads `window.location.href` behind an `isBrowser()` guard, so
native never reaches one.

### 4.2 What is load-bearing

**`flowType` still defaults to `'implicit'`.**
`flowType: 'pkce'` is load-bearing — it is what makes Supabase return `?code=` instead of a
`#fragment`.

**`storage` is load-bearing.**
Without it, `GoTrueClient.js:237-251` falls back to an in-memory adapter and the session does not
survive an app restart. It points at `secureStorage` (`src/lib/secure-storage.ts`), not
AsyncStorage — see [§6](#6-the-database) for why, and for the one thing that must not be re-added.

**The `AppState` start/stop auto-refresh listener is still correct and still required** on native —
the library's doc comment still states that refresh runs *continuously* in the background on
non-browser platforms.

### 4.3 PKCE and code exchange

**`signInWithOAuth` writes the PKCE code verifier to storage as an undocumented side effect.**
This is why a returning `?code=` with no verifier is silently treated as *not a callback*:
`_isPKCECallback()` requires both `params.code` and stored verifier content — no exchange, no error,
no log.

**`exchangeCodeForSession` fails locally on a missing verifier**, throwing
`AuthPKCECodeVerifierMissingError` (`GoTrueClient.js:1611`) before any request goes out. Expect that
failure at the call site, not as a server error.

**Pass `exchangeCodeForSession(code, { flowId })`.**
`signInWithOAuth` returns `data.flowId` (`types.d.ts:232-258`); it selects the verifier that flow
stored instead of the most recent one, so a concurrent flow cannot burn the single-use code against
the wrong verifier. Distinct from `appendPkceFlowIdToRedirects`, which is still off.

### 4.4 The Google native module

**It has a web build** (`lib/module/signIn/GoogleSignin.web.js`) whose methods only warn or throw, so
a static import is safe on all three platforms — no dynamic `import()` needed. In 16.1.4 a cancel is
a response type (`SignInResponse = success | cancelled`), not a thrown error, so the
`statusCodes.SIGN_IN_CANCELLED` catch is dead code.

### 4.5 Cancel in the browser flow

**A user cancel in the browser flow arrives as a *successful redirect*, not as a dismiss.**

- The provider redirects back through Supabase to `redirectTo` carrying `error=access_denied`
  (OAuth 2.0; Facebook adds `error_reason=user_denied` and an `error_description` of literally
  `Permissions error`).
- So the prefix matches, `openAuthSessionAsync` resolves `type: 'success'`, and reading
  `error_description` turns a Cancel into an on-screen error. `browserOAuth` checks
  `error === 'access_denied'` before the generic provider-error throw.
- The dismiss path (`result.type !== 'success'`) is a *different* cancel — Android reports a genuine
  user cancel that way too, which is why both exist and neither is redundant.

### 4.6 Two options that exist and stay off

- `experimental.appendPkceFlowIdToRedirects` — appends `sb_flow_id` to `redirectTo`; breaks
  exact-match redirect allow-list entries.
- `detectSessionInUrl` accepting a `(url, params) => boolean` function.

---

## 5. Cookie isolation in the auth browser

**Do not attempt to clear the provider's cookies after sign-in, cancel, or sign-out.** The sections
below give the per-platform reason and name the lever that is already in place. Verified against
`expo-web-browser` 57.0.2.

### iOS — already solved and already on

`preferEphemeralSession: true` (`auth.ts:92`) is exactly that concept —
`WebBrowser.types.d.ts:100-109`, *"the browser doesn't share cookies or other browsing data between
the authentication session and the user's normal browser session"*, `@platform ios`,
`@default false`. Its own caveat: *"Whether the request is honored depends on the user's default web
browser."*

### Android — not possible, and not an API gap

The full `WebBrowserOpenOptions` surface is `browserPackage`, `secondaryToolbarColor`, `showTitle`,
`enableDefaultShareMenuItem`, `showInRecents`, `createTask`, `useProxyActivity` — nothing
cookie-related, and no clear-cookies call exists in the module. `openAuthSessionAsync` opens a Chrome
Custom Tab, which runs in Chrome's process against Chrome's cookie jar; the app never owns it.
Third-party cookie managers clear the app's own WebView store, which the Custom Tab does not use.

### Web — out of reach

The cookies are on the provider's origin.

### The portable substitute is already in place

`queryParams: { auth_type: 'reauthenticate' }` for Facebook (`auth.ts:84`). It does not clear the
cookie; it forces the login screen anyway. `_getUrlForProvider` (`GoTrueClient.js:4787-4790`)
confirms the client appends it to Supabase's `/authorize` URL.

> **Unverified:** whether GoTrue forwards it to Facebook is server-side and not in `node_modules`.
> Check by reading the Facebook URL in the auth browser for `auth_type`.

### Rejected: logging the user out of Facebook after success

`facebook.com/logout.php` ends their Facebook session in their everyday browser and needs a `next`
URL under an app domain this project does not have (`web.output: "single"`).
`DELETE /{user-id}/permissions` de-authorizes the app instead, but needs `session.provider_token`
(`types.d.ts:276`), which Supabase returns only on the initial sign-in response and never persists —
and it re-prompts for permissions every sign-in, which is more friction than the "Continue as X" it
removes.

---

## 6. The database

`supabase/migrations/` holds two tables — `public.profiles` (the person) and `public.merchants` (the
tenant) — with their policies, the signup trigger, `public.delete_current_user()`,
`private.current_merchant_ids()`, and `private.rls_auto_enable()` — the function behind an event
trigger that hosted Supabase will not let this project install (§6.1). Each migration has a revert
in `supabase/reverts/` (§6.6).
`ARCHITECTURE.md` describes what they do; `docs/tenancy.md` covers the tenancy model and what is
still ahead of it. The rules below are what must not be broken when adding to them.

### 6.1 Every new table needs its own RLS line

`alter table … enable row level security` is set explicitly per table, and nothing sets it for you.
PostgREST publishes a new table in `public` over HTTP the moment it exists, and the publishable key
that reaches it ships inside the app bundle — so a table without that line is world-readable to
anyone who opens the binary.

`supabase/migrations/20260902000003_rls_auto_enable.sql` tries to install `ensure_rls`, a DDL event
trigger that would enable RLS on every table created in `public`. **On the hosted project it is not
installed, and cannot be.** Creating an event trigger needs superuser, and the hosted `postgres`
role is not one: `rolsuper` is false, and `create event trigger` fails with `permission denied to
create event trigger` (verified 2026-09-13). The migration's `DO` block catches that and only warns,
so the SQL Editor still reports *Success* while `private.rls_auto_enable()` sits there with nothing
calling it. The trigger exists only on a local `supabase start` stack.

So the explicit line is the mechanism, not a belt-and-braces habit: write `enable row level
security` in every migration.

The dashboard's Security Advisor reports the tables missing RLS as `rls_disabled_in_public`.
`supabase db lint` is a different tool — it type-checks plpgsql and says nothing about policies.

### 6.2 Three things every `security definer` function needs

`security definer` runs the body with the owner's privileges instead of the caller's. All three of
these, every time, or the escalation is reachable:

1. **Out of reach** — put it in `private`, or `revoke execute`, or both. A function in `public` is
   a `/rest/v1/rpc/<name>` URL for anyone holding the publishable key.
2. **`set search_path = ''`, and qualify every name in the body.** An unqualified name resolves
   against the *caller's* `search_path`, so without the pin a caller can point it at their own
   table or function and have that run as the owner. `pg_catalog` is still searched implicitly, so
   builtins resolve; everything else needs a schema.
3. **A `(select auth.uid())` check inside the body**, so the function can only ever act on the
   caller's own rows regardless of who reaches it.

Name `public, anon, authenticated, service_role` in the revoke, not just `PUBLIC`. Supabase's
default privileges grant `EXECUTE` on new functions in `public` to the last three **directly**, so
revoking from `PUBLIC` alone leaves three live grants behind.

Revoking `EXECUTE` does not break a trigger function. Postgres checks that privilege at
`CREATE TRIGGER`, not on each fire.

### 6.3 Policy shape

Scope policies `to authenticated` so they are never evaluated for `anon`. Wrap
`auth.uid()` as `(select auth.uid())` — unwrapped it runs once per row scanned. Give every `update`
policy both `using` and `with check`; without the second, a row can be reassigned to another user.

### 6.4 `profiles` is not `force row level security`

Deliberate, and it must stay that way while the signup trigger exists. Forcing RLS subjects the
table owner to the policies, and the trigger inserts as the owner at a moment when there is no JWT
— `auth.uid()` is null, and `profiles_insert_own` would reject the row signup exists to create.

### 6.5 Do not re-add session chunking

`src/lib/secure-storage.ts` writes the session to SecureStore in one piece. Tutorials and other
scaffolds split it across numbered keys to stay under a 2048-byte limit; that limit belonged to the
RSA hybrid encryptor, which `HybridAESEncryptor.kt` keeps only as a read path for Android API 22
and below — beneath SDK 57's floor. The live write path is AES into SharedPreferences, and
`setItemAsync` validates only that the value is a string. Chunking now buys nothing and reintroduces
a torn-write window across the pieces.

### 6.6 Every migration ships its revert

Whenever you add or change a file in `supabase/migrations/`, in the same change: write its inverse at
`supabase/reverts/<identical filename>` (or give a drop-only migration a `-- no-revert: <reason>`
line), then run `npm run build:migrations` and `npm run check:migrations`. That regenerates
`supabase/all-in-one/add.sql` and `revert.sql` — never edit those two by hand, and never put a revert
inside `migrations/`, where `supabase db push` would apply it. The rules and the reasoning are in
[`docs/migrations.md`](./docs/migrations.md).
