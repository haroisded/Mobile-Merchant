# Project structure

Which directories exist under `src/`, and what goes in each. What goes *inside* a feature folder:
[`data-layer.md`](./data-layer.md).

## Rules

1. The only directories under `src/` are `app/`, `lib/`, `Store/`, `features/`, `screens/` and
   `components/`. Adding a seventh is a decision — write down what it is for.
2. One folder per **resource** under `src/features/<resource>/`. A resource is a table or a domain
   noun (`products`, `orders`), never a page. `src/features/` is flat.
3. A feature folder holds **data only**: `queries.ts`, `schema.ts`, pure data helpers. No UI, no
   `components/`, `modals/`, `navigations/` or `hooks/` inside it.
4. Screen bodies and their private components go in `src/screens/<screen-name>/`.
5. `src/app/` holds **routes only** — expo-router layouts. A route file reads its params and renders
   a screen from `src/screens/`. Never build a second navigation layer out of components.
6. Infrastructure goes in `src/lib/` — Supabase client, auth, secure storage, query client,
   `database.types.ts`, device wrappers, `columns.ts`, `icons.tsx`, `theme.ts`, `errors.ts`.
7. `src/components/` holds shared UI: one re-export file per Paper primitive (`text.tsx`,
   `button.tsx`), plus any composition a **second** screen needs. No `index.ts` barrels.
8. App code imports Paper primitives from `@/components/<name>`, never from `react-native-paper`.
   Enforced by `.oxlintrc.json`.
9. New files are **kebab-case**. Route files keep expo-router's names (`_layout.tsx`, `[id]`,
   `(tabs)`).
10. Feature toggles are runtime data, not directory structure.

---

## 1. The tree

```
src/
  app/                    routes and layouts only
  lib/                    supabase, auth, secure-storage, query, database.types.ts, columns.ts
  Store/                  zustand — client state only
  features/
    products/             queries.ts  schema.ts
    orders/
  screens/
    product-form/         index.tsx  pricing-section.tsx  sections/  …
    product-list/
  components/             text.tsx  button.tsx  page-header.tsx  adaptive-dialog.tsx  …
```

A directory earns its existence by naming a thing the app has, not a shape code takes. `products` is
a thing; `modals` is a shape.

## 2. Data vs UI

For every new file ask: **is this data or UI?**

- Data → the resource folder it reads.
- UI → the screen that renders it, or `src/components/` once a **second** screen needs it.

Data stays keyed by resource so two screens on one resource share one feature folder, and a screen
reading three resources imports three. UI is keyed by screen because a screen body is route-shaped.

Never create a feature folder named after a page.

| Example | Goes in |
| --- | --- |
| Merchants read/write, create-system schema | `src/features/merchants/` |
| Home's SystemCard, CreateSystemModal, RemoveSystemDialog | `src/screens/home/` |
| Profile read | `src/features/profiles/`; screen in `src/screens/profile/` |
| Products queries and schema | `src/features/products/` |
| Products list, form, detail | `src/screens/product-list/`, `product-form/`, `product-detail/` |
| A dialog that also opens as a sheet route | `src/components/` — the route is its second host |
| Register cart, held sales, payment, receipt | data in `src/features/sales/`; UI in `src/screens/register/` |
| Column-count hook | `src/lib/columns.ts` |

## 3. Screen folder size

Flat until roughly eight files: `index.tsx` for the screen body, one file per private part. Past
eight, group by what the parts are *for* (`sections/`), never by what they *are* (`modals/`).

## 4. Not a feature

Anything with no table, schema or query key behind it.

| Thing | Where |
| --- | --- |
| Auth, Supabase client, secure storage | `src/lib/` |
| Query client and defaults | `src/lib/query.ts` |
| `database.types.ts` | `src/lib/` |
| Camera / cropper wrapper | `src/lib/` — becomes a feature only if it grows a table |
| Session / UI state | `src/Store/` |

## 5. The merchant shell

```
src/app/(app)/systems/[id]/_layout.tsx   the shell — expo-router Drawer, permanent when wide
src/app/(app)/systems/[id]/index.tsx     Home
src/app/(app)/systems/[id]/register.tsx
src/app/(app)/systems/[id]/products/     list, detail, create, edit
src/app/(app)/systems/[id]/discounts/
```

Rail destinations with no design yet (Dashboard, Employees, Features, Audit) stay one-line stub
files. A stub becomes a directory when its screens are built, the way `products.tsx` became
`products/`.

Sheet routes live in `src/app/(app)/sheets/` as leaf screens of the `(app)` Stack.

## 6. Build order for a new feature

1. Decide the ownership model ([`tenancy.md`](./tenancy.md)) — it decides every RLS policy.
2. Migration and RLS in `supabase/migrations/` ([`migrations.md`](./migrations.md)).
3. Regenerate `src/lib/database.types.ts` the same day.
4. Feature folder: `schema.ts`, `queries.ts`.
5. One vertical slice end to end — screens and routes for list, create, edit. Ship it before
   starting a second feature.
6. Toggles last, after two or three features exist.

## 7. Not used here

No `local-features/` or `global-features/`. No page-keyed feature folders, no `-features` suffix. No
`hooks/`, `utils/` or `server/` under `src/`. No barrel files — a screen folder's `index.tsx` is the
screen body, not a re-export. No feature-toggle registry or module manifest.
