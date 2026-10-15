import { PostgrestError } from '@supabase/supabase-js';
import { onlineManager } from '@tanstack/react-query';

// What a failed action puts on screen when there is no connection. One string, because the cause is
// the same everywhere and the advice does not change with the action.
const OFFLINE_MESSAGE = "You're offline. Reconnect and try again.";

/**
 * The message a failed action shows the user. Never the provider's own string.
 *
 * A PostgREST or GoTrue message is written for whoever is reading the logs — it names columns,
 * policies and constraints — so putting it on screen tells the user nothing they can act on and
 * leaks the shape of the schema. The caller passes copy written for the user instead, and this
 * function only decides whether the connection is the better explanation.
 *
 * It deliberately does not take the error. Discarding that string IS the fix, so a parameter
 * carrying a value nothing reads would only imply otherwise — and `anti-slop/no-unknown-parameters`
 * rejects an `unknown` parameter unless it is named `cause`, which a caught value is not.
 *
 * `onlineManager` rather than sniffing the error shape: src/lib/query.ts already wires it to
 * expo-network, so it is the app's one answer to "is there a connection", and a fetch failure has
 * no stable shape to match on across supabase-js, GoTrue and the platform's own fetch.
 */
export function failureMessage(fallback: string): string {
  return onlineManager.isOnline() ? fallback : OFFLINE_MESSAGE;
}

/**
 * The PostgREST error behind a failed write, when there is one — so a screen can pick its own copy for a
 * case it expects (a duplicate name is SQLSTATE 23505, an overlapping fiscal year 23P01) instead of the
 * generic failure line. `.throwOnError()` is what makes this a real PostgrestError rather than a plain
 * object (.claude/instruction_mds/data-layer.md §2). Anything else — a dropped connection, an Error thrown
 * in a mutationFn — is not one: null, and the caller falls back to failureMessage's copy.
 */
export function postgrestError(cause: Error | null): PostgrestError | null {
  return cause instanceof PostgrestError ? cause : null;
}

// A delete refused because a record of these still names the one deleted. Keyed by the referencing table,
// which Postgres names last in a 23503: `… violates foreign key constraint "…" on table "stock_settings"`.
const USED_BY = new Map([
  ['item_groups', "It's an item group's default. Clear it on the item group first."],
  ['item_group_taxes', "It's in an item group's Item Tax rows. Remove that row first."],
  ['tax_rules', 'A tax rule uses it. Change or delete that rule first.'],
  ['selling_settings', "It's the Default Price List in Selling Settings. Pick another there first."],
  ['stock_settings', "It's a default in Stock Settings. Pick another there first."],
  ['items', 'An item uses it. Change it on that item first.'],
  ['item_uoms', "It's in an item's Units of Measure. Remove that row first."],
  ['item_taxes', "It's in an item's Item Tax rows. Remove that row first."],
  ['item_prices', 'An item price uses it. Change or delete that price first.'],
  ['pos_profiles', 'A POS Profile uses it. Change it on that profile first.'],
  ['pos_profile_payments', "It's one of a POS Profile's payment methods. Remove that row first."],
  ['pos_profile_item_groups', "It's one of a POS Profile's item groups. Remove that row first."],
  ['pricing_rules', 'A pricing rule uses it. Change it on that rule first.'],
  ['pricing_rule_targets', 'A pricing rule applies on it. Remove it from that rule first.'],
  // A session or a sale names it, and neither is ever edited to let it go.
  ['pos_opening_entries', 'A session was opened on it, so it stays. Disable it instead.'],
  ['pos_opening_entry_balances', 'A session opened with it, so it stays. Disable it instead.'],
  ['pos_invoices', 'A sale names it, so it stays. Disable it instead.'],
  ['pos_invoice_items', 'It has been sold, so it stays. Disable it instead.'],
  ['pos_invoice_taxes', 'A sale was taxed to it, so it stays. Disable it instead.'],
  ['pos_invoice_payments', 'A sale was paid with it, so it stays. Disable it instead.'],
  ['pos_closing_entry_payments', 'A closed session counted it, so it stays. Disable it instead.'],
  // A ledger or a document names it, and neither is ever edited to let it go.
  ['gl_entries', 'It has ledger entries, so it stays. Disable it instead.'],
  ['stock_ledger_entries', 'It has stock movements, so it stays. Disable it instead.'],
  ['bins', 'It has a stock balance, so it stays. Disable it instead.'],
  ['stock_entries', 'A stock entry names it, so it stays. Disable it instead.'],
  ['stock_entry_items', "It's on a stock entry, so it stays. Disable it instead."],
  ['stock_reconciliations', 'A stock reconciliation names it, so it stays. Disable it instead.'],
  ['stock_reconciliation_items', "It's on a stock reconciliation, so it stays. Disable it instead."],
]);

/**
 * The words for a delete refused by one of the settings, item groups, tax rules, items, prices, ledgers or documents
 * naming the record — null for any other refusal, so each screen keeps its own copy for the references it already had.
 */
export function usedElsewhere(cause: Error | null): string | null {
  const error = postgrestError(cause);
  if (error?.code !== '23503') return null;
  return USED_BY.get(/on table "(\w+)"$/.exec(error.message)?.[1] ?? '') ?? null;
}

// What the database names when it refuses to save, submit or cancel a document
// (supabase/migrations/20261011165554_ledgers.sql, 20261011170112_stock_in_and_adjustments.sql). Here because
// every document's page can meet them, and so can a new item's Opening Stock.
const POSTING_REFUSALS = new Map([
  ['not_a_draft', 'It has already been submitted or cancelled. Go back and open it again.'],
  ['not_submitted', "It isn't submitted any more. Go back and open it again."],
  ['document_locked', "A submitted document can't be changed. Cancel it instead."],
  ['not_permitted', "You don't have permission for this."],
  ['no_document_series', 'Document Naming Settings has no series for this document. Add one there first.'],
  ['no_fiscal_year', "No fiscal year covers the posting date, so its series can't number the document."],
  ['posting_date_in_future', 'The posting date is in the future. Pick today or earlier.'],
  ['posting_outside_fiscal_year', 'No enabled fiscal year covers the posting date. Add or enable one in Fiscal Years.'],
  ['accounts_frozen', 'Accounts are frozen up to this date (Accounts Settings). Pick a later date, or ask someone who may post into a frozen period.'],
  ['account_unusable', "An account this posts to is a group or disabled. Check the document's accounts and the warehouse's account."],
  ['cost_center_unusable', 'The cost center is a group or disabled. Pick another.'],
  ['gl_unbalanced', "The debits and credits don't balance, so nothing was posted."],
  ['item_unusable', 'One of the items is disabled or keeps no stock. Remove it, or change the item.'],
  ['warehouse_unusable', 'One of the warehouses is a group or disabled. Pick another.'],
  ['stock_backdated', 'One of the items already has a later stock movement in that warehouse. Use that date or a later one.'],
  ['whole_number_required', "One of the quantities is a fraction, and its unit of measure can't be divided."],
  ['rate_required', 'One of the items has no rate to value it at. Enter a rate, or receive it first.'],
  ['insufficient_stock', "There isn't enough stock in the warehouse for this. Receive more first, or allow negative stock."],
  ['cancel_blocked', "Later stock movements build on this one, so it can't be reversed. Reverse those first."],
  ['document_link_invalid', "A warehouse, account or cost center on it can't be used any more — pick it again."],
  ['opening_account_invalid', "An Opening Stock's Difference Account is an asset or liability account, such as Temporary Opening."],
  ['difference_account_required', 'Pick a Difference Account first: the change in stock value needs somewhere to go.'],
  ['valuation_rate_required', 'Every row with a quantity needs a Valuation Rate above 0.'],
  ['no_inventory_account', 'The warehouse has no account, and the company has no Default Inventory Account. Set one first.'],
  ['nothing_to_reconcile', 'Nothing would change: every row already matches the books.'],
  ['no_rows', 'Add at least one item first.'],
  ['stock_entry_not_found', "It no longer exists, or you can't change it."],
  ['stock_reconciliation_not_found', "It no longer exists, or you can't change it."],
  // The Register (supabase/migrations/20261012004616_pos_shift_and_sale.sql).
  ['no_open_session', 'Your session is no longer open. Go back to Sell and open one.'],
  ['session_not_open', 'That session is already closed.'],
  ['not_your_session', 'A session is closed by its cashier, or by a manager.'],
  ['pos_profile_unusable', "That POS Profile is disabled, or you aren't one of its users."],
  ['payment_method_not_offered', "One of the payment methods isn't on the POS Profile any more. Go back and open the page again."],
  ['uom_not_on_item', "One of the items isn't sold in that unit any more. Pick its unit again."],
  ['rate_locked', "The POS Profile doesn't allow changing a rate, and a price has changed since. Go back and open the cart again."],
  ['totals_mismatch', "The totals don't add up against the items, so nothing was sold. Go back and open the cart again."],
  ['underpaid', 'The payments are less than the total, by more than the POS Profile lets you write off.'],
  ['not_cancellable', "A session's entries can't be cancelled: close the session instead."],
  // Returns, voids and a cancelled document's delete (supabase/migrations/20261012080419_pos_returns_and_voids.sql).
  ['return_original_invalid', "That sale can't be returned: it isn't submitted any more, or it is a return itself."],
  ['return_line_invalid', "A line doesn't match the sale it returns. Go back and open the return again."],
  ['return_qty_exceeds', 'More is being returned than is left of the sale. Go back and open the return again.'],
  ['refund_method_not_allowed', "One of the payment methods isn't allowed in returns on the POS Profile any more. Go back and open the return again."],
  ['refund_mismatch', "What is handed back doesn't equal the refund."],
  ['has_returns', 'A return was made against this sale. Cancel the return first.'],
  ['session_closed', "Its session is already closed, so it can't be cancelled. Return it instead."],
  ['not_cancelled', 'Only a cancelled document can be deleted. Go back and open it again.'],
  ['ledger_entries_kept', 'Accounts Settings keeps ledger entries, so a cancelled document stays. Turn on Delete Ledger Entries with the Document first.'],
  ['document_in_use', "Another document still names this one, so it can't be deleted."],
  // Discounts (supabase/migrations/20261012085548_pos_invoice_discounts.sql).
  ['discount_locked', "The POS Profile doesn't allow that discount. Go back and open the cart again."],
  ['max_discount_exceeded', "One of the items is discounted by more than its Max Discount allows."],
  ['pricing_rule_mismatch', "A pricing rule has changed since, or no longer applies. Go back and open the cart again."],
  ['below_valuation', "One of the items would sell for less than it is valued at, which Selling Settings don't allow."],
  // Employees & permissions (supabase/migrations/20261014034106_employees_and_permissions.sql): the owner took the
  // permission away while this screen was open.
  ['sales_not_permitted', "You can't ring up sales any more. Ask the owner for Process Sales."],
  ['refunds_not_permitted', "You can't take returns any more. Ask the owner for Process Refunds."],
  ['discounts_not_permitted', "You can't change a price or give a discount. Ask the owner for Apply Discounts."],
]);

/** The words for a document the database refused to save, submit or cancel — null for any other failure. */
export function postingRefusal(cause: Error | null): string | null {
  return POSTING_REFUSALS.get(postgrestError(cause)?.message ?? '') ?? null;
}

// What the database names when it refuses a new item (supabase/migrations/20261011134250_items.sql,
// 20261011134357_item_prices.sql, and 20261011170112_stock_in_and_adjustments.sql for the Opening Stock).
// Here because the Item form and Import Items both create items.
const ITEM_REFUSALS = new Map([
  ['valuation_rate_required', 'Opening Stock needs a Valuation Rate, or a Standard Selling Rate to take it from.'],
  ['no_default_warehouse', 'Opening Stock needs a warehouse: give the item a Default Warehouse, or set one in Stock Settings.'],
  ['item_group_is_group', 'Pick an item group that is not a group: items go in the groups under it.'],
  ['default_invalid', "The unit or one of the defaults can't be used any more — pick it again."],
  ['no_default_price_list', 'Selling Settings has no Default Price List for the Standard Selling Rate. Set one there, or clear the rate.'],
  ['price_list_disabled', "Selling Settings' Default Price List is disabled, so the Standard Selling Rate has nowhere to go. Clear the rate, or enable the list."],
  ['no_item_series', 'Document Naming Settings has no series for Item. Add one there first.'],
  ['no_fiscal_year', "No fiscal year covers today, so the Item series can't number this item."],
]);

/**
 * The words for an item the database refused to create — a code already taken, a default it can't use, or
 * what posting its Opening Stock met (postingRefusal) — null for any other failure.
 */
export function itemRefusal(cause: Error | null): string | null {
  const error = postgrestError(cause);
  // Two unique keys: the code (items_code_unique) and the barcode (items_barcode_unique).
  if (error?.code === '23505') return error.message.includes('items_barcode_unique') ? 'Another item already has this barcode.' : 'There is already an item with this code.';
  return ITEM_REFUSALS.get(error?.message ?? '') ?? postingRefusal(cause);
}

// What the database names when it refuses a role or an employee's access
// (supabase/migrations/20261014034106_employees_and_permissions.sql). Here because the Roles and the
// Permissions editors both meet them.
const ACCESS_REFUSALS = new Map([
  ['permission_requires', 'A permission is on without the one it needs. Turn that one on too.'],
  ['role_not_found', 'That role no longer exists. Go back and open Roles again.'],
  ['member_not_found', 'That employee is no longer in this system.'],
]);

/** The words for a role or an employee's access the database refused to save — null for any other failure. */
export function accessRefusal(cause: Error | null): string | null {
  const error = postgrestError(cause);
  if (error?.code === '23505') return 'There is already a role with this name.';
  return ACCESS_REFUSALS.get(error?.message ?? '') ?? null;
}

/** The line under a form or confirm: an offline wait, or what went wrong. */
export type Notice = { type: 'error' | 'info'; text: string };

/**
 * A mutation's notice. Paused before error: a write queued while offline is waiting, not failed
 * (.claude/instruction_mds/data-layer.md §5). `errorText` is the caller's copy for the failure it expects,
 * usually from failureMessage(). `fallback` is the screen's own error — a failed validation — shown
 * when the write has nothing to say.
 */
export function mutationNotice(
  mutation: { isPaused: boolean; isError: boolean },
  errorText: string,
  fallback: string | null = null
): Notice | null {
  if (mutation.isPaused) return { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' };
  if (mutation.isError) return { type: 'error', text: errorText };
  return fallback === null ? null : { type: 'error', text: fallback };
}
