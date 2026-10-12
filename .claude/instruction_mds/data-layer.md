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

**A record with child rows saves through one RPC.** A member and its roles, a role profile and its
roles, a doctype's whole set of rules, a tax template and its rows, an item group and its Item Tax rows, an
item and its UOM and Item Tax rows:
`public.save_member`, `save_role_profile`, `save_role_permissions`, `save_sales_tax_template`,
`save_item_tax_template`, `save_item_group`, `save_item`, `save_pos_profile`, `save_stock_entry`, `save_stock_reconciliation` write them
in one transaction, so a failure never leaves a half-saved record. A rule that reads the other rows (a tax
row's Reference Row #) is a deferred constraint trigger, checked once the replaced rows are all in.
They are security **invoker** — the caller's own policies decide each row — and take one `payload`
jsonb. A single row stays a plain `.insert` / `.update`.

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
the poster — never calculated twice.

**A document is submitted and cancelled through two RPCs, whatever its type.** `useDocumentActionMutation({
doctype, action, invalidate })` (`src/features/documents/queries.ts`) calls `public.submit_document` or
`public.cancel_document` — security **definer**, because posting writes ledgers no role may write; they check
the caller's Submit or Cancel permission themselves. It invalidates the three ledgers
(`invalidateLedgers`) and the document's own queries. A ledger feature (`gl-entries`, `stock-ledger-entries`,
`bins`) has queries and no mutation. Rejected: a submit hook per document type.

**A document's page reads its document by id** (`useStockEntryQuery({ id })`), not out of the list: a ledger
row must open a document however old it is, and the lists stop at `LEDGER_PAGE` rows (`src/lib/query.ts`).
A ledger report sends its filters to the server — they are part of the query key.

**What only the database can work out is read through an RPC.** A naming series is resolved where the
numbers are handed out: `public.naming_series_preview` returns each series' prefix, current value and next
name, and `public.update_series_counter` sets a counter — both invoker, both called from
`src/features/naming-series/queries.ts`. Rejected: a second parser in TypeScript.

**Permissions are read once per system.** `usePermissions({ merchantId })` and `can(permissions,
doctype, ptype)` (`src/features/role-permissions/queries.ts`) gate what a screen shows; a mutation that
changes roles, members or rules calls `invalidatePermissions(queryClient)`. RLS still decides
(tenancy.md rule 11).

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
