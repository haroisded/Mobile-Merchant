-- Access Codes: the one way into someone else's system (.claude/updates-and-revamps/access-codes-references/
-- access-codes.txt). The owner makes codes and sends them outside the app; whoever uses one waits for the
-- owner to approve them.
--
-- 1. private.owned_merchant_ids(): the systems the caller owns, for the owner-only policies below.
-- 2. access_codes, access_requests and notifications. The first two are owner-only tenancy tables like
--    merchants, not doctypes: no role may make a code or let someone in (tenancy.md).
-- 3. merchant_members: the email invite is gone. A member row is made by decide_access_request alone.
-- 4. Notifications, written by triggers so no client can write one to someone else.
-- 5. The RPCs: create_access_codes, claim_access_code and decide_access_request.
--
-- Deletes the member rows no account claimed (none on the hosted project, 2026-10-14). Re-runnable, like
-- the rest of supabase/migrations.

create schema if not exists private;


-- 1. Security definer for the same reason as current_merchant_ids(): a policy calling it reads merchants
-- without going through merchants' own policy.
create or replace function private.owned_merchant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id from public.merchants m where m.owner_id = (select auth.uid());
$$;

revoke execute on function private.owned_merchant_ids() from public, anon, authenticated, service_role;
grant execute on function private.owned_merchant_ids() to authenticated;


-- 2. The tables.

-- No insert or update policy: codes are made by create_access_codes only, so nobody picks a code — picking
-- one and reading the unique violation would tell whether it exists without the claim's rate limit. A code
-- is not edited: delete it and make another.
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- Six of the 32 characters nobody misreads (no 0/O, 1/I). Shown as ABC-123.
  code text not null,
  -- The owner's note; blank shows the code.
  label text,
  -- Null: never expires.
  expires_at timestamptz,
  -- Null: any number of people. A use is a pending or approved request; a declined one frees its use.
  max_uses integer,
  created_at timestamptz not null default now(),

  constraint access_codes_code_unique unique (code),
  constraint access_codes_code_shape check (code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  constraint access_codes_label_length check (label is null or length(label) between 1 and 40),
  constraint access_codes_max_uses check (max_uses is null or max_uses >= 1)
);

alter table public.access_codes enable row level security;
create index if not exists access_codes_merchant_id_idx on public.access_codes (merchant_id, created_at desc);

drop policy if exists access_codes_select on public.access_codes;
create policy access_codes_select on public.access_codes
  for select to authenticated
  using (merchant_id in (select private.owned_merchant_ids()));

drop policy if exists access_codes_delete on public.access_codes;
create policy access_codes_delete on public.access_codes
  for delete to authenticated
  using (merchant_id in (select private.owned_merchant_ids()));

-- A code used by someone. Copies, taken when the code is used: the requester cannot read the system, the
-- code may be deleted, and the owner sees the person as they were when they asked.
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  merchant_name text not null,
  access_code_id uuid references public.access_codes (id) on delete set null,
  code text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint access_requests_status check (status in ('pending', 'approved', 'declined'))
);

alter table public.access_requests enable row level security;
-- One open request per person and system.
create unique index if not exists access_requests_one_pending on public.access_requests (merchant_id, user_id) where status = 'pending';
create index if not exists access_requests_merchant_id_idx on public.access_requests (merchant_id, created_at desc);
create index if not exists access_requests_user_id_idx on public.access_requests (user_id);
create index if not exists access_requests_access_code_id_idx on public.access_requests (access_code_id);

-- Select only: the owner sees the requests to their systems, the requester their own. The definer RPCs
-- below are the only writers.
drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests
  for select to authenticated
  using (merchant_id in (select private.owned_merchant_ids()) or user_id = (select auth.uid()));

-- One person's inbox. They read, mark read and clear their own; only the triggers below write one.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_id uuid references public.merchants (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  request_id uuid references public.access_requests (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_kind check (kind in ('access_requested', 'access_approved', 'access_declined', 'access_removed', 'access_changed'))
);

alter table public.notifications enable row level security;
create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_merchant_id_idx on public.notifications (merchant_id);
create index if not exists notifications_request_id_idx on public.notifications (request_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The claim's rate limit: a wrong, expired or used-up code is a failure, and ten in 15 minutes stop the
-- caller. In private, out of PostgREST's reach; RLS on with no policy all the same.
create table if not exists private.access_code_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  failed_at timestamptz not null default now()
);

alter table private.access_code_failures enable row level security;
create index if not exists access_code_failures_user_id_idx on private.access_code_failures (user_id, failed_at);


-- 3. Members. The invite by email and its two claim triggers go: a code is the only way in.

drop trigger if exists on_auth_user_claim_memberships on auth.users;
drop function if exists private.claim_memberships_for_user();
drop trigger if exists merchant_members_claim on public.merchant_members;
drop function if exists private.claim_membership();

delete from public.merchant_members where user_id is null;
alter table public.merchant_members alter column user_id set not null;

-- Was set null, which left a row nobody could use behind a deleted account.
alter table public.merchant_members drop constraint if exists merchant_members_user_id_fkey;
alter table public.merchant_members add constraint merchant_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.merchant_members drop constraint if exists merchant_members_user_unique;
alter table public.merchant_members add constraint merchant_members_user_unique unique (merchant_id, user_id);

-- The email, name and photo are copies from the request now, for the owner to recognise the person — not
-- a key, and not typed by anyone, so neither the email's uniqueness nor its shape is checked any more. A
-- Facebook account may have no email.
alter table public.merchant_members alter column email drop not null;
alter table public.merchant_members drop constraint if exists merchant_members_email_unique;
alter table public.merchant_members drop constraint if exists merchant_members_email_shape;
alter table public.merchant_members add column if not exists avatar_url text;
-- The code they joined with: the Members tab's "via".
alter table public.merchant_members add column if not exists access_code text;

-- Only decide_access_request makes a member (it runs as the table's owner, not as `authenticated`), and
-- nobody moves a member row to another person or system — that would let someone in without a code.
create or replace function private.require_access_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    raise exception 'access_code_required' using errcode = '42501',
      detail = 'People join a system by using one of its access codes.';
  end if;

  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.merchant_id is distinct from old.merchant_id) then
    raise exception 'member_locked' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.require_access_request() from public, anon, authenticated, service_role;

drop trigger if exists merchant_members_require_access_request on public.merchant_members;
create trigger merchant_members_require_access_request
  before insert or update of user_id, merchant_id on public.merchant_members
  for each row execute function private.require_access_request();


-- 4. Notifications.

create or replace function private.notify_access_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := format('%s-%s', left(new.code, 3), right(new.code, 3));
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, merchant_id, kind, title, body, request_id)
    select m.owner_id, new.merchant_id, 'access_requested', 'Access code used',
      format('%s used %s to ask for access to %s.', coalesce(new.full_name, new.email, 'Someone'), v_code, new.merchant_name),
      new.id
    from public.merchants m where m.id = new.merchant_id;
  elsif new.status = 'approved' then
    insert into public.notifications (user_id, merchant_id, kind, title, body, request_id)
    values (new.user_id, new.merchant_id, 'access_approved', 'Request approved',
      format('You can open %s from Home now.', new.merchant_name), new.id);
  elsif new.status = 'declined' then
    insert into public.notifications (user_id, merchant_id, kind, title, body, request_id)
    values (new.user_id, new.merchant_id, 'access_declined', 'Request declined',
      format('The owner of %s declined your request.', new.merchant_name), new.id);
  end if;

  return null;
end;
$$;

revoke execute on function private.notify_access_request() from public, anon, authenticated, service_role;

drop trigger if exists access_requests_notify_insert on public.access_requests;
create trigger access_requests_notify_insert
  after insert on public.access_requests
  for each row execute function private.notify_access_request();

drop trigger if exists access_requests_notify_decided on public.access_requests;
create trigger access_requests_notify_decided
  after update of status on public.access_requests
  for each row when (old.status is distinct from new.status)
  execute function private.notify_access_request();

create or replace function private.notify_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select m.name into v_name from public.merchants m where m.id = old.merchant_id;

  -- Removing the system, or deleting either account, takes the member row with it: then there is no system
  -- to name or nobody to tell, and the insert would fail the foreign keys.
  if v_name is null or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;

  insert into public.notifications (user_id, merchant_id, kind, title, body)
  values (old.user_id, old.merchant_id, 'access_removed', 'Access removed',
    format('The owner of %s removed your access.', v_name));
  return null;
end;
$$;

revoke execute on function private.notify_member_removed() from public, anon, authenticated, service_role;

drop trigger if exists merchant_members_notify_removed on public.merchant_members;
create trigger merchant_members_notify_removed
  after delete on public.merchant_members
  for each row execute function private.notify_member_removed();


-- 5. The RPCs. Security definer, each in `public` because the app calls it, so each revokes and grants by
-- name and checks (select auth.uid()) itself (CLAUDE.md §6.2).

-- Make 1–20 codes for a system the caller owns. Expiry is decided here, not on the phone: minutes from now,
-- or the end of a day where the system is (System Settings' time zone). Neither: never expires. No
-- p_max_uses: any number of people — so the app leaves out what it means as none.
create or replace function public.create_access_codes(
  p_merchant uuid,
  p_label text default null,
  p_quantity integer default 1,
  p_expires_minutes integer default null,
  p_expires_on date default null,
  p_max_uses integer default null
)
returns setof public.access_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz;
  v_code text;
  v_row public.access_codes;
begin
  if not exists (select 1 from public.merchants m where m.id = p_merchant and m.owner_id = (select auth.uid())) then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity not between 1 and 20 then
    raise exception 'invalid_quantity' using errcode = '22023', detail = 'Make 1 to 20 codes at a time.';
  end if;

  if p_expires_minutes is not null then
    if p_expires_minutes < 1 then
      raise exception 'invalid_expiry' using errcode = '22023';
    end if;
    v_expires := now() + make_interval(mins => p_expires_minutes);
  elsif p_expires_on is not null then
    if p_expires_on < private.merchant_today(p_merchant) then
      raise exception 'expiry_in_past' using errcode = '22023', detail = 'Pick today or a later day.';
    end if;
    v_expires := (p_expires_on + 1)::timestamp at time zone coalesce(
      (select s.time_zone from public.system_settings s where s.merchant_id = p_merchant), 'UTC'
    );
  end if;

  for i in 1 .. p_quantity loop
    loop
      -- 256 is a multiple of 32, so every character is equally likely.
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(b.bytes, n) % 32 + 1, 1), '' order by n)
      into v_code
      from (select extensions.gen_random_bytes(6) as bytes) b, generate_series(0, 5) as n;

      insert into public.access_codes (merchant_id, code, label, expires_at, max_uses)
      values (p_merchant, v_code, nullif(btrim(p_label), ''), v_expires, p_max_uses)
      on conflict (code) do nothing
      returning * into v_row;

      -- Taken already (one in a billion per code): draw again.
      exit when v_row.id is not null;
    end loop;

    return next v_row;
  end loop;
end;
$$;

revoke execute on function public.create_access_codes(uuid, text, integer, integer, date, integer) from public, anon, authenticated, service_role;
grant execute on function public.create_access_codes(uuid, text, integer, integer, date, integer) to authenticated;

-- Use a code: a request the owner approves or declines. Answers with a status instead of raising, so a
-- failure's rate-limit row is kept: requested | invalid | expired | used_up | own_system | already_member |
-- already_requested | declined | too_many_attempts. The system's name only once the code is real and not
-- spent, so guessing names nothing.
create or replace function public.claim_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.access_codes;
  v_name text;
  v_owner uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  delete from private.access_code_failures f where f.user_id = v_uid and f.failed_at < now() - interval '15 minutes';
  if (select count(*) from private.access_code_failures f where f.user_id = v_uid) >= 10 then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  -- Locked: two people using a one-person code at once are served one after the other.
  select * into c from public.access_codes ac
  where ac.code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
  for update;

  if c.id is null or c.expires_at <= now() then
    insert into private.access_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', case when c.id is null then 'invalid' else 'expired' end);
  end if;

  select m.name, m.owner_id into v_name, v_owner from public.merchants m where m.id = c.merchant_id;

  v_status := case
    when v_owner = v_uid then 'own_system'
    when exists (select 1 from public.merchant_members mm where mm.merchant_id = c.merchant_id and mm.user_id = v_uid) then 'already_member'
    when exists (select 1 from public.access_requests r where r.merchant_id = c.merchant_id and r.user_id = v_uid and r.status = 'pending') then 'already_requested'
    -- A decline frees the code's use for someone else, not for the person declined.
    when exists (select 1 from public.access_requests r where r.access_code_id = c.id and r.user_id = v_uid and r.status = 'declined') then 'declined'
  end;
  if v_status is not null then
    return jsonb_build_object('status', v_status, 'merchant_name', v_name);
  end if;

  if c.max_uses is not null and (
    select count(*) from public.access_requests r where r.access_code_id = c.id and r.status in ('pending', 'approved')
  ) >= c.max_uses then
    insert into private.access_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', 'used_up');
  end if;

  insert into public.access_requests (merchant_id, merchant_name, access_code_id, code, user_id, full_name, email, avatar_url)
  select c.merchant_id, v_name, c.id, c.code, v_uid, p.display_name, u.email, p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_uid;

  return jsonb_build_object('status', 'requested', 'merchant_name', v_name);
end;
$$;

revoke execute on function public.claim_access_code(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_access_code(text) to authenticated;

-- Approve or decline a pending request to a system the caller owns. Approving makes the member, with no
-- role. Already a member (approved through another code meanwhile): only the request changes.
create or replace function public.decide_access_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.access_requests;
begin
  select * into r from public.access_requests ar
  where ar.id = p_request
    and ar.merchant_id in (select m.id from public.merchants m where m.owner_id = (select auth.uid()))
  for update;

  if r.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'request_decided' using errcode = '23514', detail = 'This request was already approved or declined.';
  end if;

  update public.access_requests
  set status = case when p_approve then 'approved' when not p_approve then 'declined' end, decided_at = now()
  where id = r.id;

  if p_approve then
    insert into public.merchant_members (merchant_id, user_id, email, full_name, avatar_url, access_code)
    values (r.merchant_id, r.user_id, r.email, left(r.full_name, 120), r.avatar_url, r.code)
    on conflict (merchant_id, user_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.decide_access_request(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.decide_access_request(uuid, boolean) to authenticated;
