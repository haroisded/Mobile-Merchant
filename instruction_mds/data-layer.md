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
set; without it the returned `error` is a plain object, fails the `instanceof` check in
`postgrestError()` (`src/lib/errors.ts`), and every code-specific message falls back to the generic
one. It also narrows `data` to non-null.

`src/lib/auth.ts` is exempt — auth-js returns its own error classes and keeps explicit checks.

**Generated types.** Run after every migration:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

Then `createClient<Database>(...)`. Use `--linked`, not `--local` (no local Docker stack here). If
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

Stale times come from `STALE` (`STALE.MINUTES.FIVE`), never `5 * 60 * 1000`.

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

## 5. Paused vs pending

With `onlineManager` wired and `networkMode: 'online'`, an offline request is **queued, not failed**.
It never errors and `isPending` stays true for as long as the device is offline.

- **Every loading branch tests `isPaused` before `isPending`**, or an offline screen shows a spinner
  that never ends. The error branch is no substitute — a paused query never reaches it.
- **"In flight" for a mutation is `isPending && !isPaused`.** Anything gated on a request being out
  — a disabled control, a non-dismissable dialog — must exclude the paused case.
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
