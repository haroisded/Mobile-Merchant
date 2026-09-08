# Project structure rules

Where a directory is allowed to exist under `src/`, and what decides it. Sits above
[`data-layer.md`](./data-layer.md) — that file says what goes *inside* a feature folder, this one says
which feature folders exist at all and what is not a feature.

## Rules

1. One folder per **resource** under `src/features/<resource>/`. A resource is a table or a domain
   noun — `products`, `orders`, `loyalty` — never a page.
2. `src/features/` is **flat**. No `local-features/`, no `global-features/`, no `-features` suffix on
   a folder name.
3. A feature folder is flat files — `queries.ts`, `schema.ts`, `ProductForm.tsx`. No `components/`,
   `modals/`, `navigations/` or `hooks/` inside one until that folder passes roughly eight files.
4. Navigation lives in `src/app/` as expo-router layouts. Never build a second navigation layer out
   of components.
5. Infrastructure stays in `src/lib/` — the Supabase client, auth, secure storage, the query client,
   `database.types.ts`, device wrappers. None of these are features.
6. Shared UI is React Native Paper. `src/components/` is created only when a **second screen** needs
   the same component, per [CLAUDE.md §3](../CLAUDE.md#3-the-ui) rule 4.
7. The only directories under `src/` are `app/`, `lib/`, `Store/`, `features/`, and eventually
   `components/`. Adding a sixth is a decision — write down what it is for.
8. Feature toggles are runtime data, not directory structure. Nothing about the folder layout
   expresses which modules a merchant has enabled.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The one rule](#1-the-one-rule)
2. [Never split features into local and global](#2-never-split-features-into-local-and-global)
3. [A feature is a resource, not a page](#3-a-feature-is-a-resource-not-a-page)
4. [No layers inside a feature either](#4-no-layers-inside-a-feature-either)
5. [What is not a feature](#5-what-is-not-a-feature)
6. [A flat tree still has shared components](#6-a-flat-tree-still-has-shared-components)
7. [Toggles are data](#7-toggles-are-data)
8. [Build order](#8-build-order)
9. [What is deliberately not here](#9-what-is-deliberately-not-here)

---

## 1. The one rule

**A directory earns its existence by naming a thing the app has, not by naming a shape code takes.**

`products` is a thing the app has. `modals` is a shape code takes. `local-features` is neither — it
is a fact about how many places currently import something, which is not a property of the code and
changes without warning.

```
src/
  app/                    routes and layouts — the navigation layer, full stop
  lib/                    supabase, auth, secure-storage, queryClient, database.types.ts
  Store/                  zustand — client state only
  features/
    products/             queries.ts  schema.ts  ProductForm.tsx
    orders/
    loyalty/
  components/             created only when a second screen needs one
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

Locality is already expressed by which files import a folder. The directory tree does not need to
restate it, and cannot enforce it.

---

## 3. A feature is a resource, not a page

The other half of the shape §2 refuses is one folder per page, named `<page>-features`. One-to-one
with pages breaks in three ordinary cases:

| Case | What happens |
| --- | --- |
| A page with no data layer — settings, about | An empty folder that exists to satisfy the rule |
| A page reading products, categories and stock | Three resources crammed into one folder |
| Two pages on one resource — list and detail | Duplicate the folder, or break the rule |

Keying on the resource fixes all three, matches
[`data-layer.md §1`](./data-layer.md#1-the-one-rule-by-feature-not-by-layer) — *everything about one
resource lives in one folder* — and makes a toggle map cleanly onto exactly one directory (§7).

Pages stay in `src/app/`, where expo-router already defines them. A page is a route, not a unit of
code ownership.

### Where a System-Context page lands

`.claude/context/System-Context/<Name>-Page/` is organised by page, and this directory is not. That
mismatch is deliberate, and it is the first thing an agent building a page trips on, so:

**Put a page's code in as many resource folders as it touches, plus route files in `src/app/`.**
Never create a folder named after the page. Home-Page is the worked example — read it as the pattern
to copy, not as a record:

| The spec calls it | Put it in |
| --- | --- |
| SystemCard, CreateSystemModal | `src/features/merchants/` — both are merchant-shaped |
| ProfileDialog's name and email | `src/features/profiles/` |
| Home, Account, Notifications, Settings screens | `src/app/(app)/(tabs)/` |
| the column-count hook | `src/lib/columns.ts` — infrastructure, per rule 5 |

For each new file ask the same question: **what resource does it own?** Not which page asked for it.
`SystemCard` is a merchant rendered as a card, so it belongs to merchants even though Home-Page is
its only caller — which is what lets the Systems Page render one without moving anything.

The traceability that a page folder would have given you lives in that page's own `history.md`
instead, under **Where the code lives**. An index costs one section in a file the page already has;
a directory costs a migration every time a second page reuses something.

An index nothing checks is an index that rots, and a table that has quietly started lying is worse
than no table because a reader trusts it. `npm run check:history`
(`tools/check-history-paths.mjs`) fails if any path named in a `history.md` no longer exists — run
it after moving a file a page index mentions. It only checks that listed paths exist; it does not
check that every file is listed, because "belongs to this page" is exactly the definition this
section refuses to make.

### Rejected: `local-features/` + `global-features/`

Do not add a shared bucket alongside page folders. §2 gives the reasons; the tree gives the
evidence, and it is worth checking before re-proposing this:

- `features/profiles/queries` has three importers, one of them inside `features/merchants/`.
- `features/merchants` is imported by `src/app/(app)/systems/[id].tsx`, which belongs to a different
  page.

Both would therefore be "global" already, leaving a `home/` folder holding two files — one of which
(`SystemCard`) the Systems Page wants. That is §2's third argument made concrete: almost everything
ends up global, and the local tree is a near-empty directory with a rename ceremony attached.

---

## 4. No layers inside a feature either

`components/modals/` and `components/navigations/` inside a feature folder is the same layer-split
[`data-layer.md §2`](./data-layer.md#2-why-the-mvc-instinct-does-not-transfer) rejects at the top
level, moved down one directory. `modals` describes how something renders, not what it does, and
nothing at runtime cares. The example in that file is the shape to copy:

```
src/features/products/
  queries.ts     keys + useProductsQuery + useUpdateProductMutation
  schema.ts      the zod schema, shared by the form resolver and the mutation
  ProductForm.tsx
```

A feature folder that genuinely passes eight files can grow a `components/` subfolder then, named
after what the components are for and not after what they are.

`navigations/` is worse than premature — it is a duplicate. `src/app/(app)/_layout.tsx` already is
the navigation layer, and [`layout.md §2`](./layout.md#2-two-kinds-of-card-opposite-answers) already
describes the one navigation decision that matters here: render both panes on a wide container, push
a route on a narrow one, same route table either way.

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

## 6. A flat tree still has shared components

Nothing above forbids a component two screens share. The natural worry — *if every component belongs
to a feature, where do the reusable ones live?* — is already answered in
[CLAUDE.md §3](../CLAUDE.md#3-the-ui):

1. React Native Paper is the component library. There is no local UI kit and there should not be one.
2. Extract a component only when a second screen needs it.

So a shared component's home is `src/components/`, created on the day the second screen needs it and
not before. Two lines of policy, no taxonomy — which is the whole answer, and the reason no directory
structure has to encode it.

---

## 7. Toggles are data

The hard part of an admin-customizable POS is not where files sit. It is which modules a merchant has
enabled, stored in a table, gated by RLS per merchant, read through one query hook, and checked at
route level. No directory layout can express that, so no directory layout should be designed around
it.

What the flat tree does give: a toggle maps onto exactly one folder — `features/loyalty/` off means
its routes do not render. The split tree loses even that, because a toggleable module's pieces would
have lived in both halves.

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
5. **One vertical slice, end to end** — `src/features/products/` plus its route, covering list,
   create and edit. Ship it before starting a second feature. The first slice is what proves the
   conventions in `data-layer.md` survive contact.
6. **Toggles last**, after two or three features exist. §7.

---

## 9. What is deliberately not here

**No `local-features/` or `global-features/`.** §2 for the reasoning, §3 for the evidence already
in the tree.

**No page-keyed feature folders and no `-features` suffix.** §3. A System-Context page maps onto
however many resource folders it touches; the page → code index lives in that page's `history.md`.

**No `components/`, `modals/`, `navigations/` or `hooks/` inside a feature folder** until it passes
roughly eight files. §4.

**No `src/components/` yet.** It appears the day a second screen needs the same component. §6.

**No feature-toggle registry, config file, or module manifest.** §7.

**No barrel files (`index.ts` re-exports).** They cost a file per folder, hide where a symbol comes
from, and defeat the tooling that finds unused exports. Import the file.
