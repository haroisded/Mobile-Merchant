# Migration rules

How a schema change is written so it can be undone, and how the two all-in-one SQL files stay true.
What a migration may contain — RLS, `security definer`, policy shape — is
[CLAUDE.md §6](../CLAUDE.md#6-the-database); this file governs the files around it.

## Rules

1. Every migration that adds or changes something ships its revert in `supabase/reverts/`, under the
   **identical filename**, in the same change.
2. A migration that only drops things carries a `-- no-revert: <reason>` line instead of a revert.
3. Never put a revert or an all-in-one file in `supabase/migrations/`. `supabase db push` applies
   every file there.
4. Never hand-edit `supabase/all-in-one/add.sql` or `revert.sql`. After adding or changing a migration
   or a revert, run `npm run build:migrations`, then `npm run check:migrations`.
5. A revert drops in reverse creation order, uses `if exists` on every statement, never uses
   `cascade`, and says in its header whether it destroys data.
6. Revert newest first. An older revert run on its own fails on purpose while newer objects still
   exist.

The rest of this file is why. Read it before overriding a rule, not before following one.

**Contents**

1. [The layout](#1-the-layout)
2. [Why reverts are not migrations](#2-why-reverts-are-not-migrations)
3. [Why the all-in-one files are generated](#3-why-the-all-in-one-files-are-generated)
4. [Writing a revert](#4-writing-a-revert)
5. [When there is nothing to revert](#5-when-there-is-nothing-to-revert)
6. [Using the all-in-one files](#6-using-the-all-in-one-files)

---

## 1. The layout

```
supabase/migrations/<ts>_<name>.sql   what db push applies — the forward change
supabase/reverts/<ts>_<name>.sql      its inverse, same filename
supabase/all-in-one/add.sql           generated: every migration, oldest first
supabase/all-in-one/revert.sql        generated: every revert, newest first
tools/build-migrations.mjs            writes the two files, and checks the pairing
```

Pairing by filename means there is no index to keep: the revert for a migration is always the file
with its name in the other directory, and the script can check that without reading any SQL.

---

## 2. Why reverts are not migrations

The Supabase CLI treats every `<timestamp>_<name>.sql` in `supabase/migrations/` as a forward
migration and applies what the remote history has not seen. A revert sitting beside its migration
would run straight after it on the next `db push` and undo it. A misnamed one skipped with a
warning is a trap one rename away from firing. A separate directory is the only place the CLI never
looks.

### Rejected: `supabase migration new` for the revert

A revert written as a new forward migration is the right tool for undoing a change **on a project
that already has data you mean to keep** — it goes through history like anything else. It is not what
these files are. These are the inverse you run by hand, on purpose, to take one step back. They exist
alongside the forward migration, not after it.

---

## 3. Why the all-in-one files are generated

Both are copies, and a copy that nothing checks drifts. Add a migration, forget the paste, and the
file someone pastes into the SQL Editor quietly stops describing the schema — worse than no file,
because a reader trusts it. It is the same argument
[`structure.md` §3](./structure.md#where-a-system-context-page-lands) makes for `npm run check:history`.

`tools/build-migrations.mjs` concatenates the individual files with a banner naming each one. It
**refuses to write** while any migration lacks both a revert and a `-- no-revert:` line, so the
all-in-one ADD file can never contain a change the REVERT file cannot undo.
`npm run check:migrations` runs the same validation and also fails when either generated file
differs from what the build would write.

### Rejected: an AI or a person pasting each new file in

It works until the one time it does not, and nothing reports that time. The script makes step 4 of
the rules a command rather than an edit.

---

## 4. Writing a revert

Undo the migration's statements in reverse. The patterns the existing four use:

| The migration did | The revert does |
| --- | --- |
| `create table` | `drop table if exists` — its policies, indexes and constraints go with it |
| `create function` / `create trigger` | drop the trigger first, then the function it calls |
| `create type` | drop it after the table whose column uses it |
| `add column` / `add constraint` | `drop constraint if exists`, then `drop column if exists` |
| `rename column` | a DO block guarded by an `information_schema.columns` lookup, renaming back — `rename` accepts no `if exists` |
| `create schema` | drop it only in the revert of the migration that *first* created it |
| event trigger in a DO block | the same DO block, catching `insufficient_privilege` |

**No `cascade`.** For the same reason `20260908000000_drop_legacy_catalog_functions.sql` gives: if
something unexpected depends on the object, the revert should fail loudly, not take that object with
it. That failure is also what enforces rule 6 — `drop schema if exists private` in the profiles revert
cannot succeed while a newer migration's function is still inside it.

**Say what it destroys.** A revert of a `create table` deletes every row. The header says so in
capitals, and names anything the app still expects, such as generated types to regenerate.

---

## 5. When there is nothing to revert

`20260908000000_drop_legacy_catalog_functions.sql` only drops functions left behind by an unrelated
project. The bodies are not in this repo, and "undoing" it would reopen an unauthenticated
password-testing RPC. So it carries:

```sql
-- no-revert: drop-only; its revert would restore leftover functions from an unrelated project
```

The line must start with `-- no-revert:` and give a reason. It still appears in `add.sql`, since it is
part of building the schema; it has no block in `revert.sql`.

---

## 6. Using the all-in-one files

**`add.sql`** builds the schema on an empty project. Every migration here is re-runnable, so it is
safe to paste into the dashboard's **SQL Editor** — the route [README.md](../README.md#database-schema)
suggests when the CLI stalls at `Initialising login role…`.

**Anything pasted into the SQL Editor runs but is never recorded** in
`supabase_migrations.schema_migrations`. The next `supabase db push` then thinks those files never
ran, and `supabase migration list` shows them as local-only. Record them straight after pasting:
`supabase migration repair --status applied <version> …`. That is how the hosted project's history
fell behind for `20260902000002` and `20260902000003`. It was repaired on 2026-09-13, together with
two remote-only versions that matched no local filename; `supabase db push --dry-run` now reports the
remote database as up to date.

### Verified on the hosted project

On 2026-09-13 both files ran back to back against the hosted database inside one transaction that
was rolled back: `revert.sql`, an assertion that the schema was empty, `add.sql`, and checks on the
rebuilt schema. Every statement executed, including `drop trigger … on auth.users`, which the hosted
`postgres` role is allowed to do. The rebuilt schema passed signup-trigger, check-constraint, RLS,
revoked-function and account-deletion tests. Detail is in
`.claude/context/System-History/version-7.2.md`.

**`revert.sql`** takes the schema back to nothing, and **destroys every row in every table it drops**.
It does not touch `auth.users`. It records nothing in the migration history either, so a later
`supabase db push` has to be squared with `supabase migration repair`.

Neither file is applied by the CLI. Both exist to be read and run by hand.
