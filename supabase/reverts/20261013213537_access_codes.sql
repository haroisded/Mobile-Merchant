-- Revert of supabase/migrations/20261013213537_access_codes.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every access code, access request and notification, and the members who joined without an
-- email (a Facebook account may have none). The members left go back to being invited by email.
-- Regenerate src/lib/database.types.ts afterwards — the Access Codes, Notifications and Home screens read
-- these tables.

drop function if exists public.decide_access_request(uuid, boolean);
drop function if exists public.claim_access_code(text);
drop function if exists public.create_access_codes(uuid, text, integer, integer, date, integer);

drop trigger if exists merchant_members_notify_removed on public.merchant_members;
drop function if exists private.notify_member_removed();
drop trigger if exists merchant_members_require_access_request on public.merchant_members;
drop function if exists private.require_access_request();


-- merchant_members as 20261008145056_users_and_access.sql left it.
delete from public.merchant_members where email is null;
alter table public.merchant_members drop column if exists access_code;
alter table public.merchant_members drop column if exists avatar_url;
alter table public.merchant_members alter column email set not null;
alter table public.merchant_members drop constraint if exists merchant_members_email_shape;
alter table public.merchant_members add constraint merchant_members_email_shape
  check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254);
alter table public.merchant_members drop constraint if exists merchant_members_email_unique;
alter table public.merchant_members add constraint merchant_members_email_unique unique (merchant_id, email);
alter table public.merchant_members drop constraint if exists merchant_members_user_unique;
alter table public.merchant_members drop constraint if exists merchant_members_user_id_fkey;
alter table public.merchant_members add constraint merchant_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.merchant_members alter column user_id drop not null;

-- 4. Claiming an invite, as 20261008145056_users_and_access.sql wrote it. A member row attaches to the
-- account whose CONFIRMED email matches — confirmed, so typing someone's address into a sign-up form cannot
-- take their seat. Whichever arrives second does the attaching: the invite (trigger on merchant_members) or
-- the account (trigger on auth.users).
create or replace function private.claim_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_email text;
begin
  new.email := lower(btrim(new.email));

  if tg_op = 'UPDATE' and new.email is distinct from old.email and old.user_id is not null then
    raise exception 'member_email_locked' using errcode = '23514',
      detail = 'An active member''s email is their ID; remove them and invite the new address instead.';
  end if;

  select lower(u.email) into v_owner_email
  from public.merchants m join auth.users u on u.id = m.owner_id
  where m.id = new.merchant_id;

  if new.email = v_owner_email then
    raise exception 'member_is_owner' using errcode = '23514',
      detail = 'The owner already has every permission in their own system.';
  end if;

  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.user_id := (
      select u.id from auth.users u
      where lower(u.email) = new.email and u.email_confirmed_at is not null
      limit 1
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.claim_membership() from public, anon, authenticated, service_role;

drop trigger if exists merchant_members_claim on public.merchant_members;
create trigger merchant_members_claim
  before insert or update of email on public.merchant_members
  for each row execute function private.claim_membership();

create or replace function private.claim_memberships_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.merchant_members
    set user_id = new.id
    where email = lower(new.email) and user_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function private.claim_memberships_for_user() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_claim_memberships on auth.users;
create trigger on_auth_user_claim_memberships
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.claim_memberships_for_user();


-- Policies, indexes and triggers go with their tables, so the functions they call go after them.
drop table if exists private.access_code_failures;
drop table if exists public.notifications;
drop table if exists public.access_requests;
drop table if exists public.access_codes;
drop function if exists private.notify_access_request();
drop function if exists private.owned_merchant_ids();
