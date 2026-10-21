# Migrations

How a schema change is written so it can be undone. What a migration may *contain* — RLS,
`security definer`, policy shape — is [`tenancy.md`](./tenancy.md).

## Rules

1. Every migration that adds or changes something ships its revert in `supabase/reverts/`, under the
   **identical filename**, in the same change.
2. A migration that only drops things carries a `-- no-revert: <reason>` line instead of a revert.
3. Never put a revert or an all-in-one file in `supabase/migrations/`. `supabase db push` applies
   every file there.
4. Never hand-edit `supabase/all-in-one/add.sql` or `revert.sql`. After adding or changing a
   migration or revert, run `npm run build:migrations`, then `npm run check:migrations`.
5. A revert drops in reverse creation order, uses `if exists` on every statement, never uses
   `cascade`, and says in its header whether it destroys data.
6. Revert newest first. An older revert run on its own fails on purpose while newer objects exist.
7. Write `alter table … enable row level security` by hand in every migration. Do not rely on the
   event trigger — see §5.
8. Regenerate `src/lib/database.types.ts` after every migration that lands.

---

## 1. Layout

```
supabase/migrations/<ts>_<name>.sql   what db push applies — the forward change
supabase/reverts/<ts>_<name>.sql      its inverse, same filename
supabase/all-in-one/add.sql           generated: every migration, oldest first
supabase/all-in-one/revert.sql        generated: every revert, newest first
tools/build-migrations.mjs            writes the two files, and checks the pairing
```

Pairing by filename means there is no index to keep. A revert lives in a separate directory because
the CLI treats every `<timestamp>_<name>.sql` under `supabase/migrations/` as a forward migration and
would run the revert straight after its own migration on the next push.

`tools/build-migrations.mjs` **refuses to write** while any migration lacks both a revert and a
`-- no-revert:` line. `npm run check:migrations` runs the same validation and fails when either
generated file differs from what the build would write.

## 2. Writing a revert

| The migration did | The revert does |
| --- | --- |
| `create table` | `drop table if exists` — policies, indexes and constraints go with it |
| `create function` / `create trigger` | drop the trigger first, then the function it calls |
| `create type` | drop it after the table whose column uses it |
| `add column` / `add constraint` | `drop constraint if exists`, then `drop column if exists` |
| `rename column` | a DO block guarded by an `information_schema.columns` lookup — `rename` accepts no `if exists` |
| `create schema` | drop it only in the revert of the migration that *first* created it |
| event trigger in a DO block | the same DO block, catching `insufficient_privilege` |

**No `cascade`.** If something unexpected depends on the object, the revert should fail loudly. That
failure is also what enforces rule 6.

**Say what it destroys.** A revert of a `create table` deletes every row — the header says so in
capitals and names anything the app still expects, such as types to regenerate.

## 3. When there is nothing to revert

```sql
-- no-revert: drop-only; its revert would restore leftover functions from an unrelated project
```

Must start with `-- no-revert:` and give a reason. It still appears in `add.sql`; it has no block in
`revert.sql`.

## 4. The all-in-one files

Neither is applied by the CLI. Both exist to be read and run by hand.

- **`add.sql`** builds the schema on an empty project. Every migration is re-runnable, so it is safe
  to paste into the dashboard SQL Editor — the route to take when the CLI stalls at
  `Initialising login role…`.
- **`revert.sql`** takes the schema back to nothing and **destroys every row in every table it
  drops**. It does not touch `auth.users`.

**Anything pasted into the SQL Editor runs but is never recorded** in
`supabase_migrations.schema_migrations`. The next `supabase db push` then thinks those files never
ran. Record them straight after pasting:

```bash
supabase migration repair --status applied <version> …
```

## 5. RLS is not automatic

`20260902000003_rls_auto_enable.sql` reports Success while installing nothing: creating an event
trigger needs superuser, the hosted `postgres` role is not one, and the migration's `DO` block
catches `permission denied to create event trigger` and only warns. Treat a green result there as
meaning nothing.

`supabase db lint` type-checks plpgsql and says nothing about policies. The dashboard's Security
Advisor (`rls_disabled_in_public`) is what answers whether a new table is protected.
