-- Revert of supabase/migrations/20261009004450_modes_of_payment.sql. Run newest first
-- (.claude/instruction-mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's Modes of Payment, and the Mode of Payment rules in role_permissions.
-- Regenerate src/lib/database.types.ts afterwards — the Modes of Payment screens read this table.

drop trigger if exists merchants_seed_60_payments on public.merchants;
drop function if exists private.seed_payments();
drop function if exists private.seed_payments_for(uuid);

-- Its policies and trigger go with the table; its role permissions with its doctype (on delete cascade).
drop table if exists public.modes_of_payment;
drop function if exists private.validate_mode_of_payment_account();

delete from public.doctypes where name = 'Mode of Payment';
