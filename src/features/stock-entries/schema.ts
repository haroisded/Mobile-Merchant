import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';
import { atLeastZero } from '../items/schema';

/** Stock received, issued — damage, wastage, own use — or moved between two warehouses (docs.frappe.io/erpnext/stock-entry-purpose). */
export const STOCK_ENTRY_PURPOSES = ['Material Receipt', 'Material Issue', 'Material Transfer'];

/** Whether a purpose has a Source Warehouse: every one but a receipt takes stock out of somewhere. */
export const takesFrom = (purpose: string) => purpose !== 'Material Receipt';
/** Whether a purpose has a Target Warehouse: every one but an issue brings stock in somewhere. */
export const bringsTo = (purpose: string) => purpose !== 'Material Issue';

/**
 * Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_stock_entry takes the same object. Which
 * warehouse, account and cost center it may name, and whether the stock is there to move, are the database's
 * rules (private.validate_stock_document, private.post_sle) — a draft saves without them and Submit checks.
 */
export const stockEntrySchema = z
  .object({
    // '' for a document not yet saved; save_stock_entry reads it from the same object.
    id: z.string(),
    purpose: z.string().min(1, 'Pick a purpose.'),
    // "YYYY-MM-DD".
    posting_date: z.string().min(1, 'Pick a date.'),
    from_warehouse: z.string(),
    to_warehouse: z.string(),
    difference_account: z.string(),
    cost_center: z.string(),
    items: z.array(
      z.object({
        item_id: z.string().min(1, 'Pick an item.'),
        qty: numberText.refine((value) => Number(value || 0) > 0, 'Enter a quantity above 0.'),
        // Typed on a receipt only.
        basic_rate: atLeastZero,
      })
    ),
  })
  .superRefine((entry, context) => {
    const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message });

    if (takesFrom(entry.purpose) && !entry.from_warehouse) issue(['from_warehouse'], 'Pick the warehouse it leaves.');
    if (bringsTo(entry.purpose) && !entry.to_warehouse) issue(['to_warehouse'], 'Pick the warehouse it goes to.');
    // stock_entries_warehouses.
    if (takesFrom(entry.purpose) && bringsTo(entry.purpose) && entry.from_warehouse && entry.from_warehouse === entry.to_warehouse) {
      issue(['to_warehouse'], 'It is already in this warehouse. Pick another.');
    }
    // "Item Valuation becomes a mandatory field in the Material Receipt entry."
    if (entry.purpose === 'Material Receipt') {
      entry.items.forEach((row, index) => {
        if (!(Number(row.basic_rate) > 0)) issue(['items', index, 'basic_rate'], 'Enter the rate it came in at.');
      });
    }
  });

export type StockEntryValues = z.infer<typeof stockEntrySchema>;
