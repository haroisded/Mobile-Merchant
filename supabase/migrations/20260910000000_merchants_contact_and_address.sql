-- CreateSystemModal revamp (revamps/Thu_09-10-2026_13.59.58.10): the wizard now collects seven
-- fields instead of four. Three of them land on public.merchants.
--
-- Every statement here is re-runnable, like the rest of supabase/migrations — `rename column` is
-- the one that is not idempotent on its own, so each is guarded by a catalog lookup rather than
-- `if not exists`, which ALTER ... RENAME does not accept.

-- 1. Store Description became Store Address.
--
-- A rename, not "add address, leave description behind". The field did not gain a sibling, it
-- changed meaning: the same one free-text box under the same 255 counter, now asking for where the
-- store is. Adding a column would leave `description` in the row shape forever, readable by
-- PostgREST, generated into database.types.ts, and answering "which one is live?" wrong for every
-- reader after today. A rename keeps the data and leaves nothing dead.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'merchants' and column_name = 'description'
  ) then
    alter table public.merchants rename column description to address;
    -- The constraint name is part of the error message a violation prints. Left as
    -- merchants_description_length it would name a column that no longer exists.
    alter table public.merchants rename constraint merchants_description_length to merchants_address_length;
  end if;
end
$$;

-- 2. The business contact email.
--
-- NOT a mirror of auth.users.email, and deliberately not on public.profiles. The reasoning that
-- keeps an email column off profiles (ARCHITECTURE.md — auth.users.email is the source of truth,
-- the client already holds it as session.user.email, a copy goes stale on the first address change)
-- is untouched by this: that is the *person's* sign-in address, this is the *business's* published
-- contact. They can differ, and one owner with two merchants can publish two of them, which is only
-- expressible on this table.
--
-- ponytail: nullable, because every merchant row that already exists was created before this field
-- did and there is nothing true to backfill them with. The form requires it for new rows
-- (src/features/merchants/schema.ts). Tighten to `not null` once the existing rows have one.
alter table public.merchants add column if not exists contact_email text;

-- 3. The phone number, stored as one E.164 string rather than a (dial code, national number) pair.
--
-- The wizard composes it from a country picker and one editable input, but what is worth keeping is
-- the number a person would dial. Splitting it across two columns would need both to be read and
-- rejoined at every call site, and the split is recoverable from the string anyway.
alter table public.merchants add column if not exists phone text;

-- Client-side Zod reports these before a round trip; these are what actually enforce them. Both
-- allow null, so they constrain the shape of a value without making the column required.
--
-- The email check is a length bound plus "has an @ with something before it" — deliberately not an
-- RFC 5322 regex. A regex strict enough to be worth writing rejects addresses that deliver, and one
-- loose enough not to is this check with more characters.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'merchants_contact_email_shape'
  ) then
    alter table public.merchants add constraint merchants_contact_email_shape
      check (
        contact_email is null
        or (length(contact_email) between 3 and 254 and position('@' in contact_email) > 1)
      );
  end if;

  -- E.164: a leading +, then 7 to 15 digits. Anything the user typed as spacing or punctuation is
  -- stripped on the client before it gets here, so this rejects a malformed number rather than a
  -- differently formatted one.
  if not exists (
    select 1 from pg_constraint where conname = 'merchants_phone_shape'
  ) then
    alter table public.merchants add constraint merchants_phone_shape
      check (phone is null or phone ~ '^\+[0-9]{7,15}$');
  end if;
end
$$;

-- No RLS line and no policies. This migration adds columns to a table that already has both, and
-- the four merchants_*_own policies key on owner_id — which is row-level, so a new column is
-- covered by them the moment it exists. A new *table* would need its own
-- `alter table … enable row level security` (CLAUDE.md §6.1); an altered one does not.
