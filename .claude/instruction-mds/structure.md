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
  lib/                    supabase, auth, secure-storage, query, database.types.ts, columns.ts, errors.ts, dates.ts, money.ts, tree.ts, files.ts (the device's file pickers), barcode.ts (which camera reads count)  …
  Store/                  zustand — client state only (StoreUser.ts, picker.ts, confirm.ts, ledger-filters.ts, cart.ts, scan.ts)
  features/
    merchants/            queries.ts  schema.ts — merchants is the Company
    countries/            queries.ts — read-only reference data
    currency-presets/     queries.ts — read-only reference data
    fiscal-years/         queries.ts  schema.ts
    access-codes/         queries.ts  schema.ts  code.ts — a code's shape, status and expiry, the claim's answers, import-free
    access-requests/      queries.ts — the owner's requests, the caller's own waiting ones, claim, decide
    notifications/        queries.ts — the list, the unread count, mark read
    members/              queries.ts — a system's employees with their role and exceptions, the owner's cross-system list
    roles/                queries.ts  schema.ts — roles with their permissions, save_role, the colour palette's keys
    permissions/          queries.ts  access.ts — the catalog; can / has, requirements and exceptions, import-free
    role-permissions/     queries.ts — usePermissions for every screen (re-exports can / has)
    system-settings/  currencies/                         queries.ts  schema.ts
    global-defaults/      queries.ts
    accounts/                                             queries.ts  schema.ts
    accounts-settings/  modes-of-payment/                 queries.ts  schema.ts
    tax-categories/  item-tax-templates/                  queries.ts  schema.ts
    sales-tax-templates/  queries.ts  schema.ts  calculate.ts — ERPNext's taxes_and_totals, import-free
    warehouses/  uoms/  uom-conversion-factors/  price-lists/  brands/    queries.ts  schema.ts
    item-groups/  selling-settings/  stock-settings/      queries.ts  schema.ts
    tax-rules/            queries.ts  schema.ts  resolve.ts — the rule a sale takes, import-free
    naming-series/        queries.ts  schema.ts — the series and Update Series; the parser is the database's
    print-formats/        queries.ts  schema.ts  receipt.ts — what a receipt prints, import-free
    letter-heads/         queries.ts  schema.ts
    print-settings/       queries.ts
    items/                queries.ts  schema.ts  csv.ts — what a CSV file of items holds and what is wrong with it, import-free;
                          label.ts — a product label's lines read into an item's fields, import-free
    item-prices/          queries.ts  schema.ts  resolve.ts — the rate a sale line takes, import-free
    gl-entries/  stock-ledger-entries/  bins/             queries.ts — read-only: only a posting writes a ledger
    documents/            queries.ts — submit / cancel for every document, and what a posting invalidates
    dashboard/            queries.ts  period.ts — the Dashboard's four reports (invoker RPCs), and its periods, import-free
    stock-entries/  stock-reconciliations/                queries.ts  schema.ts — list, one by id, save, delete
    pos-profiles/         queries.ts  schema.ts — a register's settings and its three child tables
    pricing-rules/        queries.ts  schema.ts  apply.ts — the rule a cart line takes and its rate, import-free
    pos-opening-entries/  queries.ts  schema.ts — a session: the list, the open one, open_pos_session
    pos-invoices/         queries.ts  cart.ts (the sale a cart becomes, import-free)  setup.ts (the records it reads)
    pos-closing-entries/  queries.ts — the list, one by id, close_pos_session
    feature-preferences/  queries.ts  visibility.ts — what a person hid in a store's menu, and the core rules, import-free
    profiles/
  screens/
    home/                 index.tsx  create-system.tsx  system-card.tsx  slot-card.tsx  pending-requests.tsx  …
    access-codes/         index.tsx (the pane switch)  codes.tsx  requests.tsx  members.tsx  and the four small forms
    notifications/        index.tsx
    setup/                index.tsx — the Setup destination's index
    stock/                index.tsx — the Stock destination's index
    items/                index.tsx  item-form.tsx (a Stock-stack page)
    item-prices/          index.tsx  item-price-form.tsx
    import-items/         index.tsx — a Stock-stack page: the template, a file's mistakes, the import and its log
    accounts/             index.tsx — the Accounts destination's index
    general-ledger/  stock-ledger/  stock-balance/        index.tsx — the ledger reports
    stock-entries/        index.tsx  stock-entry-form.tsx (a document's page)
    stock-reconciliations/  index.tsx  stock-reconciliation-form.tsx
    company/              index.tsx
    fiscal-years/         index.tsx  fiscal-year-form.tsx
    employees/            index.tsx  employee.tsx  roles.tsx  role.tsx  permissions.tsx  role-chip.tsx  use-employees.ts
                          use-discard.ts — the Employees destination's pages; editor/ holds the two editors they
                          share (role-editor.tsx, access-editor.tsx, permission-switches.tsx, editor-footer.tsx)
    system-home/          index.tsx — the first screen inside a system; tells someone with no role why
    global-defaults/  system-settings/  currency/         index.tsx
    chart-of-accounts/    index.tsx  account-form.tsx
    accounts-settings/    index.tsx
    modes-of-payment/     index.tsx  mode-of-payment-form.tsx
    tax-categories/  item-tax-templates/                  index.tsx  <name>-form.tsx
    sales-tax-templates/  index.tsx  template-form.tsx (a Setup-stack page)  test-template.tsx (a forms/ check)
    warehouses/  uoms/  uom-conversion-factors/  price-lists/  brands/    index.tsx  <name>-form.tsx
    item-groups/          index.tsx  item-group-form.tsx (a Setup-stack page)
    tax-rules/            index.tsx  tax-rule-form.tsx  tax-rule-check.tsx  records.ts
    selling-settings/  stock-settings/                    index.tsx
    document-naming-settings/   index.tsx  naming-series-form.tsx  series-counter-form.tsx
    print-formats/        index.tsx  print-format-form.tsx (a Setup-stack page)  receipt-sample.tsx
    letter-heads/         index.tsx  letter-head-form.tsx
    print-settings/       index.tsx
    pos-profiles/         index.tsx  pos-profile-form.tsx (a Setup-stack page)
    pricing-rules/        index.tsx  pricing-rule-form.tsx (a Setup-stack page)
    dashboard/            index.tsx  sales-chart.tsx — the Dashboard destination: one screen, no index
    sell/                 index.tsx — the Sell destination's index, with the session box
    register/             index.tsx  cart.tsx  cart-line.tsx — the items, then the cart and its payment
    pos-orders/           index.tsx  pos-invoice.tsx  pos-return.tsx — the sales, one sale's receipt, its return
    pos-opening-entries/  index.tsx  open-session.tsx
    pos-closing-entries/  index.tsx  close-session.tsx  pos-closing-entry.tsx
    scan/                 index.tsx — the product scan: the camera, its barcodes, Read Label (the full-screen route scan.tsx)
    features/             index.tsx — the Features page: hide screens and pages, with what each is for (forms/features)
    profile/
    sign-in/
  components/             text.tsx  button.tsx  adaptive-dialog.tsx  page-header.tsx  form-fields.tsx  search-select.tsx  record-list.tsx  folder-nav.tsx  destinations.ts (the side menu's destinations: the shell and Features)  repeatable-rows.tsx  section-heading.tsx  sample-box.tsx  record-index.tsx  sales-defaults-fields.tsx  item-tax-fields.tsx  document-page.tsx  stock-document.tsx  ledger-filters.tsx  chip.tsx  record-page-header.tsx  receipt.tsx  pos-session.tsx  session-amounts-form.tsx  segmented-buttons.tsx  row-box.tsx  filter-chips.tsx  bell-action.tsx  badge.tsx  …
```

That is the whole tree as of Steps 1, 11, 2, 3, 4, 5, 6, 8, 9, 7, 10 and 12 of the POS foundation (2026-10-10). A new resource of
the rebuild (an ERPNext doctype such as `items/`) is a sibling of `fiscal-years/`; its screens are
siblings of `company/`.

A directory earns its existence by naming a thing the app has, not a shape code takes. `products` is
a thing; `modals` is a shape.

## 2. Data vs UI

For every new file ask: **is this data or UI?**

- Data → the resource folder it reads.
- UI → the screen that renders it, or `src/components/` once a **second** screen needs it. One
  exception: a file [`frontend.md`](./frontend.md) marks † is restored at its own path in
  `src/components/` when the first screen needs it (frontend.md's teardown note), not rewritten in the
  screen.

Data stays keyed by resource so two screens on one resource share one feature folder, and a screen
reading three resources imports three. UI is keyed by screen because a screen body is route-shaped.

Never create a feature folder named after a page.

| Example | Goes in |
| --- | --- |
| Merchants read/write, the Company schema | `src/features/merchants/` |
| Fiscal years read/write and schema; their list and form | `src/features/fiscal-years/`; `src/screens/fiscal-years/` |
| Country + Default Currency pair, used by Create System and Company | `src/components/country-currency-fields.tsx` — two screens |
| Home's SystemCard, CreateSystem form | `src/screens/home/` |
| Profile read | `src/features/profiles/`; screen in `src/screens/profile/` |
| A dialog that also opens as a sheet route (RemoveSystemDialog, DeleteAccountDialog) | `src/components/` — the route is its second host |
| Column-count hook | `src/lib/columns.ts` |
| Reading a CSV file of items; picking the file | `src/features/items/csv.ts` — data, and import-free so `tools/check-logic.mjs` runs it; `src/lib/files.ts` — the device wrapper (rule 6). Rejected: a `features/import/` folder — a page, not a resource (rule 2) |
| The product scan: the camera page, what a label says, the request between them | `src/screens/scan/` — one page, opened by the Item form and the Register (rule 4: a second screen uses it, so it is a screen of its own, not a component of either); `src/features/items/label.ts` — what a label's lines mean for an item, and `src/lib/barcode.ts` — which camera reports count, both import-free so `tools/check-logic.mjs` runs them; `src/Store/scan.ts` — the request, as `picker.ts` carries the picker's. Rejected: a `features/scan/` folder — a device feature, not a resource (rule 2) |
| The Dashboard's reports — four functions that each add up several resources | `src/features/dashboard/` — the one folder named as its page is, because the reports are: `public.dashboard_cards` belongs to no single table. Rejected: a hook in each of `pos-invoices/`, `bins/` and `pos-opening-entries/` — one card reads all three |
| Access codes, the requests they bring, the inbox | three resources, three folders — `access-codes/`, `access-requests/`, `notifications/` — and one screen, `src/screens/access-codes/`, reading the first two and `members/`. Rejected: a `features/invites/` folder — a page's name, not a table's |
| The bell with its unread count | `src/components/bell-action.tsx` — the systems list and a system's header both draw it |
| Roles, employees, the permission catalog | three resources — `roles/`, `members/`, `permissions/` — and one screen folder, `src/screens/employees/`. `usePermissions` stays in `role-permissions/` because seventy-odd screens import it from there; the checks themselves moved to `permissions/access.ts` so `tools/check-logic.mjs` can run them. Rejected: a `features/employees/` folder — a page's name (rule 2) |

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
src/app/(app)/systems/[id]/dashboard.tsx Dashboard — one screen, so a file and no Stack
src/app/(app)/systems/[id]/sell/         Sell — its own Stack: index.tsx, open-session.tsx, register.tsx, cart.tsx,
                                         pos-invoices.tsx, pos-invoice.tsx, pos-return.tsx, pos-opening-entries.tsx,
                                         pos-closing-entries.tsx, close-session.tsx, pos-closing-entry.tsx
src/app/(app)/systems/[id]/stock/        Stock — its own Stack: index.tsx, items.tsx, item.tsx, item-prices.tsx,
                                         import-items.tsx, stock-entries.tsx, stock-entry.tsx, stock-reconciliations.tsx,
                                         stock-reconciliation.tsx, stock-balance.tsx, stock-ledger.tsx
src/app/(app)/systems/[id]/accounts/     Accounts — its own Stack: index.tsx, general-ledger.tsx
src/app/(app)/systems/[id]/employees/    Employees, the owner's alone — its own Stack: index.tsx, employee.tsx, roles.tsx,
                                         role.tsx, permissions.tsx (a tablet's two panes)

A ledger row opens its document, and a document its entries, **inside the stack the reader is in**, so Back
returns there. So a page reached from another destination is re-exported into it, one line a file:
`accounts/stock-entry.tsx`, `accounts/stock-reconciliation.tsx`, `accounts/stock-ledger.tsx` and
`stock/general-ledger.tsx`; a sale's page lives in `sell/pos-invoice.tsx` and is re-exported as
`stock/pos-invoice.tsx` and `accounts/pos-invoice.tsx` — and its return, `sell/pos-return.tsx`, the same way,
so Return works wherever the sale was opened — while `sell/` re-exports both reports and the two stock
documents (`useVoucherRoutes`, `src/components/ledger-filters.tsx`). A document's page takes
`docId`, whatever its type. Rejected: pushing into the other destination's stack — Back pops that stack.
src/app/(app)/systems/[id]/setup/        Setup — its own Stack: index.tsx, then one route per record (company.tsx, fiscal-years.tsx)
```

A new destination is a route file beside `index.tsx` and a row in the shell's `DESTINATIONS`. It
becomes a directory when it grows more than one screen (list, detail, create, edit), with a `Stack`
`_layout.tsx` and `stack: true` on its row, so a tap on it lands on its index. The shell hands every
destination the system's `id` as a param — a drawer screen reads only the params it is navigated with — and
lists it by `showsDestination` (`src/features/permissions/access.ts`): for whoever may open a row of its index
(`sections`: Read on the row's doctype, or the permission an action row names — Import Items, Item create), or
holds one of the permissions it names (`permissions`: the Dashboard's four, Sell's Open/Close Register), or for
the owner alone (`ownerOnly`: Employees). Home always shows.

Sheet routes (confirms, pickers) live in `src/app/(app)/sheets/`, and small-form routes (a page narrow,
a Dialog wide) in `src/app/(app)/forms/` — both leaf screens of the `(app)` Stack.

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
