# Data layer rules

Where a Supabase call lives, where a Zod schema lives, and how TanStack Query is keyed. Read it
before adding the first query, so the first feature sets the convention rather than inheriting one by
accident. Which directories these files may live in is [`structure.md`](./structure.md).

## Rules

1. One folder per feature, holding its schema, keys, queries and mutations together. Never create
   `validation/`, `api/`, `services/` or `queries/` as top-level directories.
2. Put the Supabase call inside the `queryFn`. Never add a service or repository layer.
3. No component calls `supabase.from(...)` or `supabase.rpc(...)` directly.
4. Never validate a Supabase read with Zod. Generate `database.types.ts` and type the client
   instead, and regenerate it whenever a migration lands.
5. Use Zod only for form input, locally persisted data, and provider-shaped blobs such as
   `raw_user_meta_data`. One schema, shared by the form resolver and the mutation.
6. Build query keys with a factory taking an **object** of args, never positional ones. Take stale
   times from one exported constant; never inline milliseconds.
7. Construct the `QueryClient` inside a component keyed on the user id, so switching accounts
   discards the cache.
8. Server state lives in TanStack Query and client state in Zustand. Never copy a fetched row into
   `useState` or a store.
9. Check `isPaused` **before** `isPending`, and never show a provider's error string. Offline
   requests are queued, not failed, so `isPending` alone renders a spinner that never ends; and a
   failed one renders copy written for the user through `failureMessage` (`src/lib/errors.ts`). §5.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The one rule: by feature, not by layer](#1-the-one-rule-by-feature-not-by-layer)
2. [Why the MVC instinct does not transfer](#2-why-the-mvc-instinct-does-not-transfer)
3. [Where the Supabase call goes](#3-where-the-supabase-call-goes)
4. [Where validation goes](#4-where-validation-goes)
5. [TanStack Query conventions](#5-tanstack-query-conventions)
6. [The cache must be keyed on the user](#6-the-cache-must-be-keyed-on-the-user)
7. [What is deliberately not here](#7-what-is-deliberately-not-here)

---

## 1. The one rule: by feature, not by layer

**Everything about one resource lives in one folder.** Its schema, its query keys, its queries, its
mutations, and the screens that use them.

```
src/features/products/
  queries.ts     keys + useProductsQuery + useUpdateProductMutation
  schema.ts      the zod schema, shared by the form resolver and the mutation
  ProductForm.tsx
```

Not this:

```
src/validation/products.ts    three directories, one table
src/api/products.ts
src/queries/products.ts
```

Infrastructure stays in `src/lib/` — the client, the generated database types, the query client
provider. Those are not features and do not belong to one.

The discipline being protected is real: **no component calls `supabase.from(...)` directly.** That is
worth enforcing. Splitting by layer is not how to enforce it.

---

## 2. Why the MVC instinct does not transfer

Laravel's layers are *runtime* boundaries. A request physically passes through middleware, then a
FormRequest, then a controller, then a model, in that order, once, and then dies. The directories
mirror an execution pipeline that actually exists.

React has no request cycle. Components subscribe to state that changes over time, and TanStack Query
is already the model layer plus its cache plus its lifecycle. There is no controller, because nothing
dispatches. A `queries/` folder beside a `services/` folder is not a boundary — it is two folders,
and nothing at runtime stops a component importing straight past either.

So layer-splitting buys zero enforcement and costs this: every feature change touches three
directories, and no directory ever tells you what the app does.

The model that does transfer:

| Laravel | Here |
| --- | --- |
| Model / Eloquent | TanStack Query — server state, cached, invalidated |
| FormRequest validation | Zod, at the form |
| Controller | Nothing. The hook is it |
| Session / UI state | Zustand — `src/Store/StoreUser.ts` |

Keep the last two apart. Server state belongs in the query cache and nowhere else; copying a fetched
row into Zustand or `useState` freezes it and defeats background updates.

### The evidence, since this argument came out of reading Bluesky

Bluesky built the by-layer version at scale — `src/state/queries/` holds roughly 125 files, 42 of
them defining mutations. Their own contributor guide now says not to do it again:

> The `/state` directory is where we've historically put all our data fetching and state management
> logic. This is perfectly fine, but for new features, consider organizing state logic closer to the
> components that use it, either within a feature directory or co-located with a screen. The key is
> to keep related code together and avoid having "god files" with too much unrelated logic.

> Avoid writing new top-level subdirectories within `/src`. We've done this for a few things in the
> past, but we have stronger patterns now. Examples: `/logger` should probably have been written into
> `/lib`. And `ageAssurance` is better classified within `/features`.

A team with 125 query files saying *organize by feature instead*. Adopting the pattern its authors
regret, on a codebase a fraction of the size, is the mistake this rule exists to prevent.

---

## 3. Where the Supabase call goes

**Inside the `queryFn`. There is no service or repository layer.**

Bluesky has none either — the network call sits in the query hook, and the query key, the fetcher,
the mutation, and any cache helpers share one file per resource. An indirection whose only job is to
wrap one call is the abstraction to delete, not to add.

So `queries.ts` holds the key factory, the hooks, and the `supabase.from(...)` / `supabase.rpc(...)`
calls, and nothing outside that file knows a table name.

**Do generate the client types.** `supabase gen types typescript --linked > src/lib/database.types.ts`,
then `createClient<Database>(...)`. Every `.from('products').select()` becomes typed end to end from
the real schema. That is the codegen half of the split described next, and it is what makes runtime
validation of reads unnecessary.

Regenerate whenever a migration lands. A stale `database.types.ts` is worse than none — it type-checks
against a schema that no longer exists.

`--linked`, not `--local`: `supabase/config.toml` here is the five-line file that only names the
project, with no local Docker stack behind it, so `--local` has nothing to read. If the CLI stalls at
`Initialising login role…` — the failure [README.md](../README.md#database-schema) warns about — set
`SUPABASE_DB_PASSWORD` as the README describes (verified for `migration list` and `db push`, not yet
for `gen types`), or use the Supabase MCP server's `generate_typescript_types`, which returns the same
output and which `.mcp.json` already points at this project.

---

## 4. Where validation goes

**Not on Supabase reads.** The database already has a schema and the generated types already express
it. A Zod schema mirroring your migration is the migration written twice, in two languages, drifting
apart from the day it is committed.

Bluesky reaches the same split from the other side: Zod appears in exactly three files there, all for
data the app itself owns. Everything arriving over the wire is typed by generated code instead.

Zod earns its place in three situations:

| Situation | Why |
| --- | --- |
| **Form input** | User-typed, untrusted, and needs per-field error messages. This is the main use |
| **Anything persisted locally** | The shape on disk is written by a past version of the app, not by Postgres |
| **Shapes you do not control** | `raw_user_meta_data` is whatever Google or Facebook chose to send — the signup trigger already reads `full_name` and `avatar_url` out of it, and Facebook withholds email on unconfirmed accounts |

The schema lives in the feature folder as `schema.ts` and is **shared by the form resolver and the
mutation**, so the thing validated and the thing written cannot disagree.

No `validation/` directory.

### Two things that will bite

**`TextInput` returns strings.** A price or quantity validated with `z.number()` fails on `"49.99"`.
Use `z.coerce.number()`. This is the first thing that breaks in any form with a numeric field.

**Root-level parsing is all or nothing.** One failing field fails the whole schema — there is no
partial parse and no per-field recovery. Bluesky documents this in blood: their persisted-state
schema discards *every* account and preference when one field is too strict, booting the app logged
out on upgrade. It is why nearly every field there is `.optional()` and why deprecated fields are
kept rather than removed. Fine for a form, where you want the errors. Lethal for anything persisted.

---

## 5. TanStack Query conventions

Worth taking verbatim; each of these solves a problem you would otherwise find later.

**Keys are a fixed tuple with an object in the middle.**

```ts
createQueryKey('products', { categoryId })   // ['products', { categoryId }, {}]
```

Args as an **object**, never positional, so key ordering cannot drift between call sites. Convention:
the key root string matches the hook name.

**Naming.** `use[Name]Query`, `use[Name]Mutation`, `use[Name]CacheMutation` for helpers that write
cached data directly.

**No magic milliseconds.** Stale times come from one exported constant — `STALE.MINUTES.FIVE`, not
`5 * 60 * 1000` scattered across files.

**Defaults worth overriding**, and the reasoning for each:

| Option | Set to | Why |
| --- | --- | --- |
| `retry` | `false` | Fail fast and show the user a result with a retry control, rather than three silent attempts. Opt back in per query |
| `refetchOnWindowFocus` | `false` | On mobile this fires on every app resume. Enable per query where it earns it |
| `structuralSharing` | leave on | Bluesky disables it to make object identity meaningful for "first seen" timestamps. That is specific to them |

**Invalidating an infinite query needs truncating first.** Slice `pages` and `pageParams` to the
first entry, *then* invalidate — otherwise the refetch pulls every page the user ever scrolled.

**Mutation error handling.** Do not log network errors, the user is already being told. Handle typed
errors specifically. Send only the unexpected to the logger.

**A provider's own error string never reaches the UI.** A PostgREST or GoTrue message names columns,
policies and constraints — it is written for whoever reads the logs, tells the user nothing they can
act on, and leaks the shape of the schema. A failed mutation renders copy written for the user
through `failureMessage` (`src/lib/errors.ts`), which swaps in the offline message when
`onlineManager` says that is the better explanation. Zod messages are the exception and stay as they
are: those already *are* written for the user (§4).

**React Native setup is not optional.** `onlineManager` and `focusManager` must be wired per the
TanStack React Native guide, or queries never learn they are offline and never refetch on resume.
That is separate from, and additional to, the `AppState` listener in `src/lib/supabase.ts`, which
exists to start and stop token refresh.

**A paused request is not a pending one — check `isPaused` first.** With `onlineManager` wired and
the default `networkMode: 'online'`, a request made with no connection is **queued, not failed**. It
never errors, and `isPending` stays true for as long as the device is offline, so:

- **Every loading branch must test `isPaused` before `isPending`**, or an offline screen renders a
  spinner that animates forever with nothing to read and nothing to press. The error branch is no
  substitute — a paused query never reaches it. `src/app/(app)/(tabs)/index.tsx` is the worked
  example, and it shipped with exactly that bug until a device run caught it.
- **"In flight" for a mutation is `isPending && !isPaused`.** Anything gated on a request being
  genuinely out — a disabled control, a dialog that refuses to be dismissed — has to exclude the
  paused case, or going offline locks the user in with no exit.
  `src/features/merchants/RemoveSystemDialog.tsx` names that value `inFlight`.
- **Say so, and leave the way out.** A paused state resumes on its own when the connection returns,
  so it wants a line of copy and no retry control — the retry is already going to happen.

Both halves of this are verified on a device
([System-History 5.2](../.claude/context/System-History/version-5.2.md),
[5.3](../.claude/context/System-History/version-5.3.md)), including that the queued write lands on
reconnect with no further input.

---

## 6. The cache must be keyed on the user

The single most valuable pattern to take, because this is an auth scaffold and *sign out, sign in as
someone else* is the scenario it exists to get right.

Construct the `QueryClient` **inside a component keyed on the user id**:

```tsx
<QueryProviderInner
  // Enforce we never reuse cache between users.
  // These two props MUST stay in sync.
  key={session?.user.id}
  currentUserId={session?.user.id}>
```

Bluesky keys theirs on the account DID and the inner component throws if the id changes without the
remount — a deliberate crash in preference to a cross-account data leak.

RLS does not save you here. Cached rows are already on the device and render before any request goes
out. Keying the provider makes the guarantee structural: switching users throws the whole cache away
and there is nothing to forget. A `queryClient.clear()` inside `signOut` is the version that gets
forgotten.

---

## 7. What is deliberately not here

**No service / repository layer.** §3.

**No `validation/`, `api/`, or `queries/` top-level directories.** §1.

**No Supabase Cache Helpers.** It auto-generates query keys from supabase-js calls, which is clever
and hides exactly the mechanic — keys and invalidation — that has to be understood before it can be
abstracted. Revisit when the manual version feels tedious, not before.

**No Realtime.** Tempting for anything resembling live stock or presence, but it is a second sync
system with its own failure modes and reconnection semantics. A mutation followed by an invalidation
covers a single-admin app completely. Add it for genuinely collaborative editing and nothing less.

**No client-side Zod on reads.** §4.

**No `networkMode: 'always'`.** It would make an offline request fail fast and fall into the error
branch, which looks like a simpler story than §5's paused handling. It also throws away the two
things that make offline behave well here: the request no longer waits and resumes on reconnect, and
`refetchOnReconnect` stops meaning anything. Wiring `onlineManager` and then opting out of what it
buys is the contradiction to avoid.
