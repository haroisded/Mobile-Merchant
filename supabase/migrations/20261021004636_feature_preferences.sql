-- Features: what one person has hidden in one store (the store header's Features page).
--
-- 1. public.feature_preferences — one row per person and store: `hidden`, the screens and pages they took out of
--    their own side menu and indexes (`screen:stock`, `stock/import-items` …, src/features/feature-preferences/
--    visibility.ts). Hidden is not disabled: it grants and refuses nothing, every screen stays reachable, and RLS
--    and the posters still decide what a person may do. So a row matters to its owner alone.
-- 2. Own-row policies, written by hand like notifications': the person's own preference, not a business record,
--    so it is no doctype and no permission reaches it (.claude/instruction-mds/tenancy.md rule 13). A row may be
--    written only for a store the person is in; it goes with the account (Delete account) and with the store.
--
-- Rejected: a column of merchant_members — the owner has no member row; the phone's SecureStore — lost on a
-- reinstall and different on each phone (the human, 2026-10-21); one row per person across stores — every
-- store has its own screens and the person's own use of them.

create table if not exists public.feature_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  hidden text[] not null default '{}',
  updated_at timestamptz not null default now(),

  primary key (user_id, merchant_id),
  -- The app knows about fifty keys; this only stops a client from filling the row without limit.
  constraint feature_preferences_hidden_size check (cardinality(hidden) <= 200)
);

alter table public.feature_preferences enable row level security;
create index if not exists feature_preferences_merchant_id_idx on public.feature_preferences (merchant_id);

drop policy if exists feature_preferences_select on public.feature_preferences;
create policy feature_preferences_select on public.feature_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists feature_preferences_insert on public.feature_preferences;
create policy feature_preferences_insert on public.feature_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and merchant_id in (select private.current_merchant_ids()));

drop policy if exists feature_preferences_update on public.feature_preferences;
create policy feature_preferences_update on public.feature_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and merchant_id in (select private.current_merchant_ids()));

drop policy if exists feature_preferences_delete on public.feature_preferences;
create policy feature_preferences_delete on public.feature_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));
