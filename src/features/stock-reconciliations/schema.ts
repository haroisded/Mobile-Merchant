import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';
import { atLeastZero } from '../items/schema';

/** The first quantities and rates of a system, or a count against the books (docs.frappe.io/erpnext/stock-reconciliation). */
export const STOCK_RECONCILIATION_PURPOSES = ['Stock Reconciliation', 'Opening Stock'];

/**
 * Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_stock_reconciliation takes the same
 * object. Which warehouse and account it may name are the database's rules
 * (private.validate_stock_document) — a draft saves without them and Submit checks.
 */
export const stockReconciliationSchema = z
  .object({
    // '' for a document not yet saved; save_stock_reconciliation reads it from the same object.
    id: z.string(),
    purpose: z.string().min(1, 'Pick a purpose.'),
    // "YYYY-MM-DD".
    posting_date: z.string().min(1, 'Pick a date.'),
    difference_account: z.string(),
    items: z.array(
      z.object({
        item_id: z.string().min(1, 'Pick an item.'),
        warehouse_id: z.string().min(1, 'Pick a warehouse.'),
        // What the count found: 0 is a count too, so the field cannot be left empty.
        qty: numberText.refine((value) => value !== '' && Number(value) >= 0, 'Enter the quantity counted, 0 or more.'),
        valuation_rate: atLeastZero,
      })
    ),
  })
  .superRefine((reconciliation, context) => {
    reconciliation.items.forEach((row, index) => {
      // "Stock on hand needs a valuation rate above zero."
      if (Number(row.qty) > 0 && !(Number(row.valuation_rate) > 0)) {
        context.addIssue({ code: 'custom', path: ['items', index, 'valuation_rate'], message: 'Enter what each unit is worth.' });
      }
      // stock_reconciliation_items_unique: one count of one item in one warehouse per document.
      if (row.item_id && reconciliation.items.findIndex((other) => other.item_id === row.item_id && other.warehouse_id === row.warehouse_id) < index) {
        context.addIssue({ code: 'custom', path: ['items', index, 'warehouse_id'], message: 'This item is already counted in this warehouse above.' });
      }
    });
  });

export type StockReconciliationValues = z.infer<typeof stockReconciliationSchema>;
