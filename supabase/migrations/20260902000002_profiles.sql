-- One row per user, created by a trigger so a profile always exists by the time the app reads
-- one, and deleted by the cascade when the account goes.

-- Holds functions that must never be reachable over HTTP: PostgREST publishes `public` (and
-- `graphql_public`) and nothing else, so a function in here has no /rest/v1/rpc/ URL to attack.
create schema if not exists private;

create table if not exists public.profiles (
  -- Not a key this schema chooses: it is auth.users.id. Random uuids fragment an index, but that
  -- trade was made in auth.users, and matching it is what lets `on delete cascade` do the cleanup.
  id uuid primary key references auth.users (id) on delete cascade,

  -- No `email` column on purpose. auth.users.email is the source of truth and the client already
  -- holds it as session.user.email; a copy here goes stale the moment someone changes their
  -- address, and keeping it in step needs a second trigger that nobody remembers to write.
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Every table you add needs this line of its own. The next migration tries to install an event
-- trigger that would also catch it, but that needs superuser and hosted Supabase's `postgres` role is
-- not one — there it only warns and the trigger never exists (verified 2026-09-13), so it is no
-- substitute for writing the line. Without it PostgREST serves the whole table to anyone holding the
-- publishable key, which ships in the app bundle. The dashboard's Security Advisor flags the tables
-- that are missing it.
alter table public.profiles enable row level security;

-- Deliberately NOT `force row level security`, which is otherwise the stricter default worth
-- reaching for. Forcing it subjects the table owner to the policies too, and handle_new_user below
-- inserts as the owner during signup — a moment when there is no JWT, so auth.uid() is null and
-- profiles_insert_own would reject the row that signup exists to create.

-- Every policy is scoped `to authenticated` so it is never even evaluated for anon, and every
-- auth.uid() is wrapped in a select. Unwrapped, it is called once per row scanned; wrapped, the
-- planner runs it once as an InitPlan and reuses the result.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

-- `using` decides which rows may be updated, `with check` what they may be updated *to*. Without
-- the second one a user could hand their row to somebody else by rewriting its id.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy, so no client can delete a profile directly. The row goes when the account
-- does, through the cascade on auth.users that delete_current_user below triggers.

-- No index on id: the primary key already is one.


-- Creates the profile row for a new signup.
--
-- security definer because the insert has to bypass RLS — see the note above about auth.uid()
-- being null inside the signup transaction — and because the caller here is GoTrue, not the user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- Google and Facebook both land here through signInWithIdToken / the browser flow, and both
    -- populate these two keys. nullif keeps an empty string from masquerading as a set name.
    -- The jsonb ->> operator is in pg_catalog, so it still resolves under the empty search_path.
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

-- Revoking EXECUTE does not stop this. Postgres checks EXECUTE on a trigger function when the
-- trigger is created, not each time it fires, so the trigger keeps working while the function
-- stays uncallable by hand.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- Self-service account deletion, which the App Store requires of any app that can create an
-- account (Guideline 5.1.1(v)). Called from deleteAccount() in src/lib/auth.ts.
--
-- This one is in `public` because it is meant to be reachable — it is the app's own API, and
-- PostgREST only publishes `public`. Which is exactly why the grants below are not optional.
create or replace function public.delete_current_user()
returns void
language sql
security definer
set search_path = ''
as $$
  -- The only row this can ever touch is the caller's own. For an unauthenticated caller auth.uid()
  -- is null and `id = null` matches nothing, so the failure mode is deleting zero rows; the grant
  -- below is what actually keeps anon out. public.profiles goes with it through the cascade.
  delete from auth.users where id = (select auth.uid());
$$;

-- Without this, `create function` in a Supabase project leaves the function callable at
-- POST /rest/v1/rpc/delete_current_user by anyone holding the anon key — which ships inside the
-- app binary. Supabase's default privileges grant EXECUTE to anon, authenticated and service_role
-- directly, so all three have to be named; revoking from PUBLIC alone would not reach them.
revoke execute on function public.delete_current_user() from public, anon, authenticated, service_role;
grant execute on function public.delete_current_user() to authenticated;
