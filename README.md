# React Native + Expo SDK 57 + Supabase — Auth Scaffold

A starting point for an app that needs Supabase auth on day one: clone it, fill in `.env`, build
your screens on top. Authentication, session handling, deep linking and OAuth are already wired
together and explained inline.

> How the pieces work — the file map, the client options, the session store, the route guard, the
> sign-in paths and the frontend rules — is in [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> The conventions for what you build on top — feature folders, the data layer, tenancy, layout,
> typography and the visual language — are in [`docs/`](./docs/), indexed in
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
- **Google and Facebook social login** — native Google sheet on device, browser OAuth for Facebook
  and on web
- **Session handling** in one zustand store — restore, auto-refresh, sign-out
- **Session stored in the Keychain / Keystore** via `expo-secure-store`, not plaintext AsyncStorage
- **SQL migrations** for `profiles` and `merchants` with RLS, the tenancy seam, and in-app account deletion
- **A merchant shell with its first business screens** — Products: list, stepped create / edit form,
  detail, archive and delete, and Setup for categories, tax classes and suppliers
- **React Native Paper** for the whole UI, themed from `src/themes.js`
- **Patched dependency** via `patch-package`, applied automatically on install
- **Lint** — oxlint with a local `anti-slop` plugin in `tools/oxlint/`, wired up in `.oxlintrc.json`
- **Runs on web** (`npm run web`), so the whole session lifecycle is debuggable in a browser

Exact versions are in `package.json`.

> **Expo Go will not work.** The Google sign-in module is native code, and a custom `scheme` has
> no effect in Expo Go at all, so device testing needs a development build (`npm run ios` /
> `npm run android`). The web target (`npm run web`) needs nothing extra and is the fastest way
> to iterate on session logic.

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

**Authentication → URL Configuration → Redirect URLs** — add both:

```
mobilemerchant://**
http://localhost:8081/**
```

The first is this app's scheme (set in `app.json`), used by the Facebook browser flow to hand the
session back to the app. The second is the Expo web dev server.

### Site URL

**Authentication → URL Configuration → Site URL** — set it to `http://localhost:8081`.

> **Do not skip this one.** It defaults to `http://localhost:3000`, and when Supabase cannot match a
> `redirect_to` against the allow-list above it **silently falls back to Site URL** rather than
> erroring. On web that lands the browser on a different origin, which means a different
> `localStorage`, which means the PKCE code verifier written at the start of the flow is invisible
> on return. `auth-js` then treats the incoming `?code=` as *not a callback* at all — no exchange,
> no error, no log. A wrong Site URL is the single most likely cause of a sign-in that appears to
> do nothing.

### Database schema

`supabase/migrations/` holds the person, the tenant and the first business tables. `profiles` is
keyed to `auth.users` and carries its RLS policies, a trigger that creates the profile row on signup,
and `delete_current_user()` — the function behind the **Delete account** button, since the App Store
requires in-app account deletion (Guideline 5.1.1(v)) and no client-side key may write to
`auth.users`. `merchants` is the tenant table — one business per row, with its currency — with its
own policies and `private.current_merchant_ids()`, the function every business table's policies call.
The product catalogue is the first set of them: categories, tax classes, suppliers, products and
their child rows, saved through `save_product()` — `ARCHITECTURE.md` describes each.

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
[`docs/migrations.md`](./docs/migrations.md).

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
- `preferEphemeralSession: true` (`auth.ts:92`) makes the auth browser a throwaway session with no
  shared cookies — **iOS only**, and honored at the browser's discretion.
- Clearing the cookies on Android is not possible. The Custom Tab runs in Chrome's process against
  Chrome's cookie jar; nothing in your app can reach it. Signing the user out of Facebook after a
  successful login would end their Facebook session in their everyday browser, which is worse than
  the problem.

---

## 6. Run it

```bash
npm run web       # browser — full session flow, both providers via redirect OAuth
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

End-to-end, on web:

1. `npm run web` → sign in with Google → lands on the account screen with no explicit navigation
   call anywhere in the app.
2. Reload the page — the session is restored from storage, no sign-in screen flash.
3. Sign out, then sign in with Facebook → same screen, "Signed in with facebook" on the card.

On a dev build, before debugging any redirect:

```bash
npx uri-scheme open mobilemerchant:// --android    # or --ios
```

This opens the app through its scheme with **no OAuth involved**. If the app opens, native
registration is fine and the problem is Supabase-side; if nothing happens, the deep link itself
is broken and no dashboard change will help.
