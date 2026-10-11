-- Revert of supabase/migrations/20261011170112_stock_in_and_adjustments.sql. Run newest first
-- (.claude/instruction_mds/migrations.md rule 6), and before the revert of 20261011165554_ledgers.sql.
--
-- DESTROYS DATA: EVERY STOCK RECONCILIATION AND STOCK ENTRY OF EVERY SYSTEM, their rules in
-- role_permissions, and their rows in Document Naming Settings. The General Ledger and Stock Ledger entries
-- they posted stay, naming documents that are gone, and the stock they moved stays in the bins: revert the
-- ledgers next, or cancel the documents first. Their series' counters stay too (naming_series_counters is
-- keyed by prefix, not by document). Regenerate src/lib/database.types.ts afterwards — the Stock screens
-- read these tables, and the Item page calls save_item_with_opening_stock.

drop function if exists public.save_item_with_opening_stock(jsonb);

drop function if exists private.submit_stock_entries(uuid);
drop function if exists private.submit_stock_reconciliations(uuid);

drop function if exists public.save_stock_entry(jsonb);
drop function if exists public.save_stock_reconciliation(jsonb);

-- Policies, triggers and indexes go with the tables.
drop table if exists public.stock_entry_items;
drop table if exists public.stock_entries;
drop table if exists public.stock_reconciliation_items;
drop table if exists public.stock_reconciliations;

drop function if exists private.validate_stock_document();

-- Cascades to the standard_role_permissions and role_permissions rows naming them.
delete from public.doctypes where name in ('Stock Reconciliation', 'Stock Entry');

-- Naming series, as 20261010064803_naming_series.sql made them: three documents.
delete from public.naming_series where document_type in ('Stock Reconciliation', 'Stock Entry');

alter table public.naming_series drop constraint if exists naming_series_document_type;
alter table public.naming_series add constraint naming_series_document_type
  check (document_type in ('POS Invoice', 'Sales Invoice', 'Item'));

create or replace function private.seed_naming_for(p_merchant uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.naming_series (merchant_id, document_type, options)
  values
    (p_merchant, 'POS Invoice', array['ACC-PSINV-.YYYY.-']),
    (p_merchant, 'Sales Invoice', array['ACC-SINV-.YYYY.-']),
    (p_merchant, 'Item', array['STO-ITEM-.YYYY.-'])
  on conflict (merchant_id, document_type) do nothing;
$$;
