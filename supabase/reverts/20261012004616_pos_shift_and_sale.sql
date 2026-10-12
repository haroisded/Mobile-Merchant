-- Revert of supabase/migrations/20261012004616_pos_shift_and_sale.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6).
--
-- DESTROYS DATA: every system's POS Opening Entries, POS Invoices and POS Closing Entries with their rows,
-- their rules in role_permissions, and the two entries' naming series and counters. It does NOT take back
-- what the sales posted: their gl_entries and stock_ledger_entries stay, and the bins keep the stock the
-- sales took — cancel the invoices first (public.cancel_document) to reverse them. Regenerate
-- src/lib/database.types.ts afterwards — the Sell screens read these tables.

drop function if exists public.close_pos_session(jsonb);
drop function if exists public.pos_checkout(jsonb);
drop function if exists public.open_pos_session(jsonb);

drop function if exists private.submit_pos_closing_entries(uuid);
drop function if exists private.submit_pos_invoices(uuid);
drop function if exists private.submit_pos_opening_entries(uuid);
drop function if exists private.pos_profile_usable(uuid);

-- Policies and triggers go with their tables.
drop table if exists public.pos_closing_entry_payments;
drop table if exists public.pos_closing_entries;
drop table if exists public.pos_invoice_payments;
drop table if exists public.pos_invoice_taxes;
drop table if exists public.pos_invoice_items;
drop table if exists public.pos_invoices;
drop table if exists public.pos_opening_entry_balances;
drop table if exists public.pos_opening_entries;

drop function if exists private.keep_pos_entry();

-- Cascades to the standard_role_permissions and role_permissions rows naming them.
delete from public.doctypes where name in ('POS Opening Entry', 'POS Invoice', 'POS Closing Entry');
delete from public.standard_role_permissions where role_name = 'All' and doctype = 'Accounts Settings';
delete from public.role_permissions p using public.roles r
where r.id = p.role_id and r.role_name = 'All' and p.doctype = 'Accounts Settings';

-- Naming, as 20261011170112_stock_in_and_adjustments.sql left it.
delete from public.naming_series where document_type in ('POS Opening Entry', 'POS Closing Entry');
delete from public.naming_series_counters where prefix like 'POS-OPE-%' or prefix like 'POS-CLE-%';

alter table public.naming_series drop constraint if exists naming_series_document_type;
alter table public.naming_series add constraint naming_series_document_type
  check (document_type in ('POS Invoice', 'Sales Invoice', 'Item', 'Stock Reconciliation', 'Stock Entry'));

create or replace function private.seed_naming_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.naming_series (merchant_id, document_type, options)
  values
    (p_merchant, 'POS Invoice', array['ACC-PSINV-.YYYY.-']),
    (p_merchant, 'Sales Invoice', array['ACC-SINV-.YYYY.-']),
    (p_merchant, 'Item', array['STO-ITEM-.YYYY.-']),
    (p_merchant, 'Stock Reconciliation', array['MAT-RECO-.YYYY.-']),
    (p_merchant, 'Stock Entry', array['MAT-STE-.YYYY.-'])
  on conflict (merchant_id, document_type) do nothing;
$$;
