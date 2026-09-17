# Project structure rules

Where a directory is allowed to exist under `src/`, and what decides it. Sits above
[`data-layer.md`](./data-layer.md) — that file says what goes *inside* a feature folder, this one says
which folders exist at all, and where a screen's UI lives.

## Rules

1. One folder per **resource** under `src/features/<resource>/`. A resource is a table or a domain
   noun — `products`, `orders`, `loyalty` — never a page.
2. `src/features/` is **flat**. No `local-features/`, no `global-features/`, no `-features` suffix on
   a folder name.
3. A feature folder holds a resource's **data**, not its UI: `queries.ts`, `schema.ts`, and pure
   helpers for that data (a save-payload builder, say). Screen bodies and their private components go
   in `src/screens/<screen-name>/`. §4.
4. Navigation lives in `src/app/` as expo-router layouts, and `src/app/` holds **routes only**. A route
   file reads its params and renders a screen from `src/screens/`. Never build a second navigation
   layer out of components.
5. Infrastructure stays in `src/lib/` — the Supabase client, auth, secure storage, the query client,
   `database.types.ts`, device wrappers. None of these are features.
6. Shared UI lives in `src/components/`, one file per thing: a re-export of each React Native Paper
   primitive the app uses (`text.tsx`, `button.tsx`, …), and any composition a **second screen**
   needs. App code imports primitives from `@/components/<name>`, never straight from
   `react-native-paper`. No `index.ts` barrels. §6.
7. The only directories under `src/` are `app/`, `lib/`, `Store/`, `features/`, `screens/` and
   `components/`. Adding a seventh is a decision — write down what it is for.
8. Feature toggles are runtime data, not directory structure. Nothing about the folder layout
   expresses which modules a merchant has enabled.
9. New files are **kebab-case** — `product-form.tsx`, `system-card.tsx`. Route files keep
   expo-router's own names (`_layout.tsx`, `[id]`, `(tabs)`).

**Not yet in code.** Rules 3, 6 and 9 were adopted on 2026-09-17 (System-History 12.1). Today's
screens still keep their UI in `src/features/*` with PascalCase names, and app code still imports
Paper directly. Those move in one coding pass, not file by file, and that pass updates every
`history.md` "Where the code lives" table (`npm run check:history`). Until then, **new** code follows
these rules. An old file breaking them is backlog, not a review finding
([`testing-workflow.md` §2.4](./testing-workflow.md)).

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The one rule](#1-the-one-rule)
2. [Never split features into local and global](#2-never-split-features-into-local-and-global)
3. [Data is keyed by resource, UI by screen](#3-data-is-keyed-by-resource-ui-by-screen)
4. [Inside a feature folder and a screen folder](#4-inside-a-feature-folder-and-a-screen-folder)
5. [What is not a feature](#5-what-is-not-a-feature)
6. [Shared components](#6-shared-components)
7. [Toggles are data](#7-toggles-are-data)
8. [Build order](#8-build-order)
9. [What is deliberately not here](#9-what-is-deliberately-not-here)

---

## 1. The one rule

**A directory earns its existence by naming a thing the app has, not by naming a shape code takes.**

`products` is a thing the app has. `product-form` is a screen the app has. `modals` is a shape code
takes. `local-features` is neither — it is a fact about how many places currently import something,
which is not a property of the code and changes without warning.

```
src/
  app/                    routes and layouts only — the navigation layer, full stop
  lib/                    supabase, auth, secure-storage, queryClient, database.types.ts
  Store/                  zustand — client state only
  features/
    products/             queries.ts  schema.ts
    orders/
  screens/
    product-form/         index.tsx  pricing-section.tsx  …   rendered by app/…/products/new.tsx
    product-list/
  components/             text.tsx  button.tsx  page-header.tsx  adaptive-dialog.tsx  …
```

---

## 2. Never split features into local and global

The tempting shape, and the one to refuse: features used by exactly one page kept apart from features
used everywhere.

```
src/features/
  local-features/<page>-features/components/{modals,navigations}/
  global-features/<name>/components/{modals,navigations}/
```

Three things are wrong with it, and the third is specific to this app.

**"Local" is a headcount, not a property.** It means *one page imports this today*. The moment a
second page needs that modal, the code has not changed but its directory has to — move the folder,
rename it, rewrite every import. The split charges a migration for the most ordinary event in app
development.

**It enforces nothing.** Nothing at runtime or in the type system stops a page importing out of
another page's local folder. It is a naming convention that costs two path segments on every import
and buys no boundary — the same objection [`data-layer.md §2`](./data-layer.md#2-why-the-mvc-instinct-does-not-transfer)
raises against `services/` beside `queries/`.

**A toggleable POS inverts it.** The modules an admin can switch on are exactly the ones that reach
across pages — loyalty touches checkout, customers and reports; discounts touch checkout and
products. Almost everything ends up under `global-features/`, leaving `local-features/` as a
near-empty tree with a rename ceremony attached to it.

`screens/` → `components/` (§6) looks like the same split, and it partly is: a screen's private part
moves once a second screen needs it. The difference is that it applies to **UI only**, and only one
step, one file at a time. Data never moves, because data was never keyed by screen (§3).

---

## 3. Data is keyed by resource, UI by screen

One folder per page, holding everything the page uses, breaks in three ordinary cases:

| Case | Page-keyed everything | Here |
| --- | --- | --- |
| A page with no data layer — settings, about | An empty data folder that exists to satisfy the rule | A screen folder, no feature folder |
| A page reading products, categories and stock | Three resources crammed into one folder | One screen importing three feature folders |
| Two pages on one resource — list and detail | Duplicate the queries, or break the rule | Two screen folders, one `features/products/` |

So **data** stays keyed by resource, which matches
[`data-layer.md §1`](./data-layer.md#1-the-one-rule-by-feature-not-by-layer) and makes a toggle map
cleanly onto one feature folder (§7). **UI** is keyed by screen, because a screen body is
route-shaped and `src/app/` may hold routes only. The same screen can then render under more than one
route: Profile under the Account tab and under `profile.tsx`.

### Rejected: UI inside the feature folder

The previous version of this rule kept `ProductForm.tsx` beside `queries.ts`. It lost for two reasons.
Expo's `expo-project-structure` and `expo-native-ui` skills put screen bodies in `screens/` and name
files in kebab-case, and an agent follows those skills by default. Fighting them on every pass cost
more than the move. A feature folder holding list, form, detail, setup and eleven form sections had
also passed the eight-file limit in §4 anyway (`features/products/form/`).

### Where a System-Context page lands

`.claude/context/System-Context/<Name>-Page/` — or `<Name>-Screen/`, both suffixes are in use — is
organised by page. **Put a page's screens in `src/screens/`, its data in as many resource folders as
it touches, and its route files in `src/app/`.** Never create a feature folder named after the page.

For each new file ask the same question: **is this data or UI?** Data goes to the resource it reads.
UI goes to the screen that renders it, or to `components/` once a second screen does.

| The spec calls it | Put it in |
| --- | --- |
| Merchants read/write, the create-system schema | `src/features/merchants/` |
| Home's SystemCard, CreateSystemModal, RemoveSystemDialog | `src/screens/home/` — Home is their only screen |
| ProfileDialog's name and email, the profile read | `src/features/profiles/`; the screen in `src/screens/profile/` |
| Home, Account, Notifications, Settings routes | `src/app/(app)/(tabs)/` |
| the column-count hook | `src/lib/columns.ts` — infrastructure, per rule 5 |

The traceability a page folder would have given you lives in that page's own `history.md`, under
**Where the code lives**. An index nothing checks is an index that rots, and a table that has quietly
started lying is worse than no table because a reader trusts it. `npm run check:history`
(`tools/check-history-paths.mjs`) fails if any path named in a `history.md` no longer exists. Run it
after moving a file a page index mentions. It checks only that listed paths exist. It does not check
that every file is listed, because "belongs to this page" is exactly the definition this section
refuses to make.

### The merchant shell

The Revamped Merchant UI screens (`.claude/context/Revamped Merchant UI/`) all render inside one
shell: a header, plus a rail on a wide container or a drawer on a narrow one
([`layout.md` §9](./layout.md#9-one-threshold-five-pairs)). The shell is navigation, so it is a
layout, not a component (rule 4):

```
src/app/(app)/systems/[id]/_layout.tsx   the shell — an expo-router Drawer, permanent when wide
src/app/(app)/systems/[id]/index.tsx     Home
src/app/(app)/systems/[id]/register.tsx
src/app/(app)/systems/[id]/products/     list, detail, create and edit routes
src/app/(app)/systems/[id]/discounts/
```

The shell, Home and Products exist. Register, Dashboard, Discounts, Employees, Features and Audit are
one-line stub files (`register.tsx`, `discounts.tsx`, …) until their screens are built;
`discounts.tsx` then becomes the directory above, as `products.tsx` became `products/`. The code
behind those routes:

| The mockup calls it | Put it in |
| --- | --- |
| Products queries and schema | `src/features/products/` |
| Products list, form (sections and fields), detail | `src/screens/product-list/`, `product-form/`, `product-detail/` |
| The archive dialog — list and detail both open it | `src/components/` |
| Category, tax class and supplier queries | `src/features/categories/`, `tax-classes/`, `suppliers/` |
| Their pickers (form only) and Setup sections | pickers in `src/screens/product-form/`; the Setup screen in `src/screens/product-setup/` |
| Discounts | `src/features/discounts/` + `src/screens/discount-*/` |
| Register's cart, held sales, payment, receipt | data in `src/features/sales/` — a sale is the resource; UI in `src/screens/register/` |
| The rail and header | `src/app/(app)/systems/[id]/_layout.tsx` |

Dashboard, Employees, Features and Audit are rail destinations with no mockup yet. They get folders
when they get a design, not before.

### Rejected: `local-features/` + `global-features/`

Do not add a shared bucket alongside page folders. §2 gives the reasons.

---

## 4. Inside a feature folder and a screen folder

A **feature folder** is flat data files. No `components/`, `modals/`, `navigations/` or `hooks/` —
UI does not belong there at all (rule 3).

A **screen folder** is flat until it passes roughly eight files: `index.tsx` for the screen body,
then one file per private part. Past eight, group by what the parts are *for* — the product form's
sections in `sections/` — never by what they *are* (`modals/`). `modals` describes how something
renders, not what it does, and nothing at runtime cares.

`navigations/` anywhere is worse than premature — it is a duplicate. `src/app/(app)/_layout.tsx`
already is the navigation layer, and [`layout.md §2`](./layout.md#2-two-kinds-of-card-opposite-answers)
already describes the one navigation decision that matters here: render both panes on a wide
container, push a route on a narrow one, same route table either way.

---

## 5. What is not a feature

Anything with no resource behind it — no table, no schema, no query key.

| Thing | Where it goes | Why |
| --- | --- | --- |
| Auth | `src/lib/auth.ts` — already there | A session, not a resource. Moving it also breaks the reading order in [CLAUDE.md §1](../CLAUDE.md#1-what-this-is): `secure-storage.ts → supabase.ts → auth.ts → StoreUser.ts` |
| The Supabase client, secure storage | `src/lib/` | Infrastructure, per `data-layer.md §1` |
| The query client and its defaults | `src/lib/` | Same |
| `database.types.ts` | `src/lib/` | Generated, belongs to no feature |
| A camera or cropper wrapper | `src/lib/` | A device wrapper. It becomes a feature only if it grows a table |
| Session / UI state | `src/Store/` | Client state. Server state never goes here — `data-layer.md §5` |

A device wrapper is the borderline case worth naming: it stays in `lib/` while it is only a
capability. Once it owns rows — saved captures, upload records — it becomes a feature folder with the
capability still in `lib/` underneath it.

---

## 6. Shared components

React Native Paper is still the component library, and there is still no local UI kit: nothing in
`src/components/` re-implements a primitive ([CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 1).
`src/components/` holds two kinds of file:

1. **A re-export per Paper primitive** — `export { Text } from 'react-native-paper'`, plus `AppText`
   from `src/lib/theme.ts` in `text.tsx`. One file each. It adds nothing today, and that is the
   point: when Paper needs a project-wide adjustment, it lands in one file instead of every import.
   This is the `imports-design-system-folder` rule from `vercel-react-native-skills`.
2. **A composition a second screen needs** — `page-header.tsx`, `adaptive-dialog.tsx`,
   `menu-select.tsx`. Created on the day the second screen needs it and not before
   ([CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 4). A first-use part stays in its screen folder.

**No `index.ts` barrels.** A re-export file per primitive is not a barrel: each import names exactly
the file it reads, so bundling and unused-export tooling still see through it. An `index.ts`
gathering them all would load every primitive on every import
(`vercel-react-best-practices` `bundle-barrel-imports`, Callstack `bundle-barrel-exports`).

### Rejected: importing Paper directly everywhere

It is what the code does today and it works. It lost because a Paper-wide change — the icon renderer,
a default prop, a patch — would mean editing every call site. The re-export costs one line per
primitive.

---

## 7. Toggles are data

The hard part of an admin-customizable POS is not where files sit. It is which modules a merchant has
enabled, stored in a table, gated by RLS per merchant, read through one query hook, and checked at
route level. No directory layout can express that, so no directory layout should be designed around
it.

What the resource-keyed data tree does give: a toggle maps onto exactly one feature folder —
`features/loyalty/` off means its routes do not render.

**Do not build the toggle system first.** Its granularity — whole module, single screen, or
individual action — is not knowable until two or three features exist. Building it early locks in a
guess and every later feature inherits it. Ship features switched on, add the table when the
granularity is a fact rather than a prediction.

---

## 8. Build order

The order the first feature should arrive in, because several of these are painful to reorder.

1. **Decide the ownership model.** Whether rows are scoped by `auth.uid()` or by a `merchant_id`
   with a membership table decides every RLS policy in the project. It is the single hardest thing to
   change later. Write it down before the first migration.
2. **First real table and its RLS**, in `supabase/migrations/`. Copy the `profiles` pattern exactly —
   explicit `enable row level security`, policies scoped `to authenticated`, `(select auth.uid())`
   wrapped, both `using` and `with check` on every update policy. See
   [CLAUDE.md §6](../CLAUDE.md#6-the-database).
3. **Generate `src/lib/database.types.ts`** the same day, and type the client
   `createClient<Database>(...)`. Doing it immediately makes regeneration reflex; a stale file
   type-checks against a schema that no longer exists.
4. **Query infrastructure, one file** — `src/lib/query.ts`: the `QueryClient` with `retry: false` and
   `refetchOnWindowFocus: false`, the exported `STALE` constants, and the `onlineManager` /
   `focusManager` wiring the TanStack React Native guide requires. Mount the provider in
   `src/app/_layout.tsx` keyed on the user id, per
   [`data-layer.md §6`](./data-layer.md#6-the-cache-must-be-keyed-on-the-user). That `AppState` usage
   is separate from the token-refresh listener in `src/lib/supabase.ts`; both exist.
5. **One vertical slice, end to end** — `src/features/products/`, its screens and its routes,
   covering list, create and edit. Ship it before starting a second feature. The first slice is what
   proves the conventions in `data-layer.md` survive contact.
6. **Toggles last**, after two or three features exist. §7.

---

## 9. What is deliberately not here

**No `local-features/` or `global-features/`.** §2.

**No page-keyed feature folders and no `-features` suffix.** §3. Data is resource-keyed; only UI is
screen-keyed, in `src/screens/`.

**No UI in a feature folder, and no `components/`, `modals/`, `navigations/` or `hooks/` inside one.**
§4.

**No `hooks/`, `utils/` or `server/` directories under `src/`.** `expo-project-structure` draws them.
That skill says itself it is for new apps only and must never restructure an existing one. Hooks and
helpers live beside the data or screen they serve, and infrastructure lives in `src/lib/`.

**No feature-toggle registry, config file, or module manifest.** §7.

**No barrel files (`index.ts` re-exports).** They cost a file per folder, hide where a symbol comes
from, and defeat the tooling that finds unused exports. Import the file. A screen folder's
`index.tsx` is the screen body itself, not a re-export.
