# Data layer

Supabase calls, Zod schemas, TanStack Query. Where files go: [`structure.md`](./structure.md).

## Rules

1. One folder per feature: `src/features/<resource>/` holds `schema.ts` and `queries.ts` (keys +
   queries + mutations). Never create `validation/`, `api/`, `services/` or `queries/` as top-level
   directories.
2. The Supabase call goes inside the `queryFn`. No service or repository layer.
3. No component calls `supabase.from(...)` or `supabase.rpc(...)` directly.
4. End every `supabase.from(...)` and `supabase.rpc(...)` with `.throwOnError()`. Never
   `const { data, error } = …; if (error) throw error`.
5. Never validate a Supabase read with Zod. Type the client from generated types instead.
6. Use Zod only for: form input, locally persisted data, provider blobs (`raw_user_meta_data`).
   One schema, shared by the form resolver and the mutation.
7. Query keys come from a factory taking an **object** of args, never positional. Stale times come
   from the exported `STALE` constant; never inline milliseconds.
8. Construct the `QueryClient` inside a component keyed on the user id.
9. Server state lives in TanStack Query, client state in Zustand (`src/Store/`). Never copy a
   fetched row into `useState` or a store.
10. Check `isPaused` **before** `isPending`. Never render a provider's error string.

---

## 1. Feature folder shape

```
src/features/products/
  queries.ts     keys + useProductsQuery + useUpdateProductMutation
  schema.ts      zod schema, shared by form resolver and mutation
```

Infrastructure (client, generated types, query provider) stays in `src/lib/`.

## 2. Supabase calls

`.throwOnError()` is load-bearing. postgrest-js constructs a real `PostgrestError` only when it is
set; without it the returned `error` is a plain object — no stack, and no class to test an error code
against when a screen picks its copy for a case it expects. It also narrows `data` to non-null.

`src/lib/auth.ts` is exempt — auth-js returns its own error classes and keeps explicit checks.

**A record with child rows saves through one RPC.** A role with its permissions and who holds it, an
employee's role and exceptions, a tax template and its rows, an item group and its Item Tax rows, an
item and its UOM and Item Tax rows:
`public.save_role`, `save_member_access`, `save_sales_tax_template`,
`save_item_tax_template`, `save_item_group`, `save_item`, `save_pos_profile`, `save_stock_entry`, `save_stock_reconciliation` write them
in one transaction, so a failure never leaves a half-saved record. A rule that reads the other rows (a tax
row's Reference Row #) is a deferred constraint trigger, checked once the replaced rows are all in.
They are security **invoker** — the caller's own policies decide each row — and take one `payload`
jsonb (`save_member_access` takes `p_member`, `p_role` and `p_overrides`: its "no role" is the argument left
out, as the generated types forbid null). A single row stays a plain `.insert` / `.update`.

A document and its rows save the same way — `public.save_stock_entry`, `save_stock_reconciliation` — and
answer with the document's id, which the mutation returns: a new document's page goes on with it
(`save.data`) and becomes the saved one without leaving. `public.save_item_with_opening_stock` wraps
`save_item`, so an item and its Opening Stock are one transaction too.

A document that is never a draft — a session's opening, a sale, a session's closing — goes through one RPC
that inserts it with its rows and submits it in the same transaction: `public.open_pos_session`,
`pos_checkout`, `close_pos_session`, security invoker over `public.submit_document`. A refusal leaves no row
and uses no number, and the database sets the date. The answer is the document's id; a screen that goes on
with it sends through `sendOnce` (`src/components/adaptive-dialog.tsx`), `saveOnce`'s guard with the answer
passed on. What a sale sends is calculated on the device (`src/features/pos-invoices/cart.ts`) and checked by
the poster — never calculated twice. A return goes through the same `pos_checkout`: `buildReturn` prorates
the **stored** sale by quantity — its lines, and each tax row's `item_wise_tax_detail` — and never runs the
price or tax engines again. Rejected: recalculating a return, wrong once a template changes after the sale.

**Many records from one file are one invoker RPC, and the file is read on the device.**
`public.import_items(p_merchant, p_rows)` (`useImportItemsMutation`, `src/features/items/queries.ts`) is
security **invoker** over the RPCs one item's form uses — `save_item` per row, then **one** Opening Stock
reconciliation for the whole file, saved and submitted — so every row or none is saved, under the importer's
own policies. `src/features/items/csv.ts` parses the file and checks it first: import-free, asserted in
`tools/check-logic.mjs`, handed the records to look names up in, and answering each mistake by the
spreadsheet's row and the column's heading. It checks what the screen can know (a name not in the system,
a number that is not one, what the importer's permissions and the settings allow); the database still decides, and
a refusal comes back as it was raised with `hint = 'row N'` — the Nth row sent — or `'opening stock'`, which
the screen turns into the file's own row number. Not Zod: a file is not a form, and its messages need a row
and a column. Rejected: a `.insert` of all rows — it skips `save_item`'s price; `save_item_with_opening_stock`
in a loop — a reconciliation an item; a definer function with its own permission checks. Ceiling: 500 rows a
file, one statement under the `authenticated` role's 8 s `statement_timeout` (500 rows with a price and
opening stock each took 3.8 s, 2026-10-13).

**A choice among records that prices or taxes a sale is an import-free module beside its `queries.ts`** —
`item-prices/resolve.ts`, `tax-rules/resolve.ts`, `pricing-rules/apply.ts` — handed to `cart.ts` as an
engine and asserted in `tools/check-logic.mjs`. The poster checks the outcome a sale claims (the rule covers
the line and gives that rate), not the choice. Rejected: a second ranking engine in SQL. Typed cart state
that two pages share — the lines, the additional discount — is `src/Store/cart.ts`, never a query. Without
**Apply Discounts** (`SaleSetup.typedPrices`, the owner or the permission) `buildSale` drops whatever rate or
discount the cart holds and the cart shows no field for one, so a cart stored before the permission went is
priced as the price list says and never refused for a field the screen no longer shows.

**A document is submitted, cancelled and deleted through three RPCs, whatever its type.**
`useDocumentActionMutation({ doctype, action, invalidate })` (`src/features/documents/queries.ts`) calls
`public.submit_document`, `public.cancel_document` or `public.delete_document` — security **definer**, because
posting writes ledgers no role may write; they check the caller's Submit, Cancel or Delete permission
themselves. Delete is a cancelled document's, with its ledger rows, while Accounts Settings allow it; a draft
is still deleted through its own feature's mutation. It invalidates the three ledgers
(`invalidateLedgers`) and the document's own queries. A ledger feature (`gl-entries`, `stock-ledger-entries`,
`bins`) has queries and no mutation. Rejected: a submit hook per document type.

**A document's page reads its document by id** (`useStockEntryQuery({ id })`), not out of the list: a ledger
row must open a document however old it is, and the lists stop at `LEDGER_PAGE` rows (`src/lib/query.ts`).
A ledger report sends its filters to the server — they are part of the query key.

**What only the database can work out is read through an RPC.** A naming series is resolved where the
numbers are handed out: `public.naming_series_preview` returns each series' prefix, current value and next
name, and `public.update_series_counter` sets a counter — both invoker, both called from
`src/features/naming-series/queries.ts`. Rejected: a second parser in TypeScript.

**A report that adds rows up is an invoker RPC.** The Dashboard's `public.dashboard_cards`, `sales_by_day`,
`top_selling` and `stock_alerts` (`src/features/dashboard/queries.ts`) are `stable`, security **invoker** and
`returns table`: the caller's own policies decide every row, so a figure is what that person's own lists add
up to, and the generated types carry the row with no cast. The app sends the dates, worked out in the
system's time zone (`periodRange`, `src/features/dashboard/period.ts`, over `todayIn`). Generated types mark
every `returns table` column non-null: a column the function answers null for someone (`gross_profit`) is
shown behind the same permission the function checks, never tested for null. Rejected: summing fetched
invoices on the device — a list stops at `LEDGER_PAGE` rows.

The shell's drawer keeps the Dashboard mounted, so it never remounts to ask again. A posting or a session
of this device invalidates it (`invalidateDashboard`, from `invalidateLedgers` and
`invalidatePosOpeningEntries`); another register's sales arrive when the screen is focused
(`refetchStaleDashboard` in a `useFocusEffect`) or the app resumes (`refetchOnWindowFocus`, opted in) — its
queries are `STALE.MINUTES.ONE`.

**Permissions are read once per system, and asked again every minute.** `usePermissions({ merchantId })`
(`src/features/role-permissions/queries.ts`) answers `public.my_permissions`; `can(permissions, doctype,
ptype)` and `has(permissions, key)` — import-free in `src/features/permissions/access.ts`, asserted in
`tools/check-logic.mjs`, re-exported from `role-permissions/queries.ts` — gate what a screen shows. A mutation
that changes roles or employees calls `invalidatePermissions(queryClient)`. The query also polls
(`refetchInterval` `STALE.MINUTES.ONE`): an owner's change on another phone must reach this one within a
minute, and the "Access changed" notification cannot carry it while an earlier one is unread
(`private.notify_access_changed()` keeps one). The permission catalog (`usePermissionCatalogQuery`,
`src/features/permissions/queries.ts`) is `STALE.STATIC`. RLS still decides (tenancy.md rule 11).

**Generated types.** Run after every migration:

```bash
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

Then `createClient<Database>(...)`. Use `--linked`, not `--local` (no local Docker stack here), and
`--schema public`: without it CLI 2.116 also writes a `graphql_public` block the committed file has never
had (seen 2026-10-12), and the diff stops being the migration's own. If
the CLI stalls at `Initialising login role…`, set `SUPABASE_DB_PASSWORD`, or use the Supabase MCP
server's `generate_typescript_types`.

A stale `database.types.ts` type-checks against a schema that no longer exists. Regenerate on every
migration.

## 3. Validation

| Situation | Use Zod |
| --- | --- |
| Form input | Yes — untrusted, needs per-field messages |
| Anything persisted locally | Yes — shape on disk written by a past app version |
| Shapes you do not control (`raw_user_meta_data`) | Yes |
| Supabase reads | No — generated types cover it |

Three traps:

- **`TextInput` returns strings.** Use `z.coerce.number()` for price and quantity fields.
- **Parsing is all or nothing.** One failing field fails the whole schema. Fine for a form; for
  anything persisted, make fields `.optional()` and keep deprecated ones.
- **`zodResolver` can fail type-check after a Zod minor bump** (`Type '3' is not assignable to type
  '0'` while the form works at runtime). Switch to `standardSchemaResolver` from
  `@hookform/resolvers/standard-schema`. Do not cast, do not pin Zod.

## 4. TanStack Query

**Keys** — fixed tuple, object in the middle, key root string matches the hook name:

```ts
createQueryKey('products', { categoryId })   // ['products', { categoryId }, {}]
```

**Naming** — `use[Name]Query`, `use[Name]Mutation`, `use[Name]CacheMutation`.

**Client defaults** (`src/lib/query.ts`):

| Option | Set to |
| --- | --- |
| `retry` | `false` — fail fast, show a retry control. Opt in per query |
| `refetchOnWindowFocus` | `false` — fires on every app resume on mobile. Opt in per query |
| `structuralSharing` | leave on |
| `networkMode` | leave default (`'online'`) |

Stale times come from `STALE` (`STALE.MINUTES.FIVE`), never `5 * 60 * 1000`. Reference data a
migration seeds and no client can write (countries, currency presets) is `STALE.STATIC` — TanStack's
`'static'`: fetched once, never refetched, invalidation included. A query that must ask again on every visit
(the naming series preview: it follows the date and the fiscal years, and neither invalidates it) names
`STALE.ALWAYS` — leaving `staleTime` off takes the five-minute default above, not zero.

**What another person changes** reaches this phone only by asking again — there is no Realtime. Two
queries poll, each `refetchInterval` `STALE.MINUTES.ONE` with `refetchOnWindowFocus: true`: the caller's
permissions inside a system (above), and the unread notifications (`src/features/notifications/queries.ts`),
mounted by the tab bar so it runs on every tab and inside a system. The notifications' `queryFn` compares the
answer with the cached one, and an unread id it has not seen invalidates what notifications are about —
merchants, permissions, access requests and codes, members — once per new row, however many components
read the count. Rejected: a `useEffect` on the newest id — it ran on every observer's mount (the tab bar,
each bell), refetching them all on every entry into a system.

**Wire `onlineManager` and `focusManager`** per the TanStack React Native guide, or queries never
learn they are offline and never refetch on resume. This is separate from the `AppState` listener in
`src/lib/supabase.ts`, which starts and stops token refresh. Both exist.

**Invalidating an infinite query:** truncate `pages` and `pageParams` to the first entry, *then*
invalidate. Otherwise the refetch pulls every page the user scrolled.

**Mutation errors:** handle typed errors specifically, send only the unexpected to the logger. Never
log plain network errors — the user is already being told.

**Error copy:** render `failureMessage` (`src/lib/errors.ts`), which swaps in the offline message
when `onlineManager` says so. A PostgREST or GoTrue string names columns and policies, tells the
user nothing, and leaks the schema. Zod messages are the exception — they already read for the user.
A case the screen expects gets its own copy from the SQLSTATE: `postgrestError(mutation.error)?.code`
(`src/lib/errors.ts`) — `23505` a duplicate name, `23P01` an exclusion constraint (overlapping fiscal
years).

**A form's or confirm's line under its buttons** is `mutationNotice(mutation, errorText, fallback)`
(`src/lib/errors.ts`): the paused copy first (§5), then `errorText` on a failed write, then the
screen's own `fallback` error (a failed validation). Do not re-wrap its result. Copy two screens
share lives in that file too.

## 5. Paused vs pending

With `onlineManager` wired and `networkMode: 'online'`, an offline request is **queued, not failed**.
It never errors and `isPending` stays true for as long as the device is offline.

- **Every loading branch tests `isPaused` before `isPending`**, or an offline screen shows a spinner
  that never ends. The error branch is no substitute — a paused query never reaches it.
- **"In flight" for a mutation is `isPending && !isPaused`.** Anything gated on a request being out
  — a spinner, a disabled exit (Back, Cancel), a non-dismissable dialog — must exclude the paused case.
- **The control that fires the write stays disabled on `isPending`, paused included**, and its
  handler refuses while `isPending` (a keyboard's Done submits too). A second tap while paused queues
  a second write, and reconnecting runs both — two systems from one form (found on the device,
  2026-10-08). Worked examples: `src/screens/home/create-system.tsx` (`submit`), the Delete button in
  `src/components/remove-system-dialog.tsx`. A form gets both for free from
  `handleSubmit(saveOnce(mutation, onDone))` (`src/components/adaptive-dialog.tsx`) and `FormActions`
  or `PageForm`; a confirm from `useConfirm()` (`src/components/confirm-dialog.tsx`).
- **A paused state gets a line of copy and no retry control.** It resumes on its own.

Worked examples: `src/app/(app)/(tabs)/index.tsx`, `src/components/remove-system-dialog.tsx`
(`inFlight`).

## 6. Cache keyed on the user

```tsx
<QueryProviderInner
  // These two props MUST stay in sync.
  key={session?.user.id}
  currentUserId={session?.user.id}>
```

RLS does not cover this: cached rows are already on the device and render before any request goes
out. Keying the provider discards the whole cache on user switch. A `queryClient.clear()` inside
`signOut` is the version that gets forgotten.

## 7. Not used here

No service/repository layer. No `validation/`, `api/` or `queries/` directories. No Supabase Cache
Helpers. No Realtime — a mutation plus an invalidation covers a single-admin app. No client-side Zod
on reads. No `networkMode: 'always'`.
