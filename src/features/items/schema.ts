import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';

const atLeastZero = numberText.refine((value) => Number(value || 0) >= 0, 'Enter 0 or more.');

/**
 * Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_item takes the same object. Empty strings
 * are "none" — the RPC stores null. Which record each default may name is the database's rule
 * (private.validate_defaults), and so is the code under a naming series (private.prepare_item): `codeTyped`
 * is false when Stock Settings names items by the series, and the field is then left out of the form.
 */
export const itemSchema = (codeTyped: boolean) =>
  z
    .object({
      item_code: codeTyped ? z.string().trim().min(1, 'Enter a code.').max(140, 'Use 140 characters or fewer.') : z.string(),
      // Blank: the code, as ERPNext fills it.
      item_name: z.string().trim().max(140, 'Use 140 characters or fewer.'),
      item_group_id: z.string().min(1, 'Pick an item group.'),
      stock_uom: z.string().min(1, 'Pick a unit of measure.'),
      description: z.string().trim().max(1000, 'Use 1,000 characters or fewer.'),
      brand_id: z.string(),
      disabled: z.boolean(),
      is_stock_item: z.boolean(),
      // '' for Stock Settings' method, or FIFO / Moving Average.
      valuation_method: z.string(),
      allow_negative_stock: z.boolean(),
      reorder_level: atLeastZero,
      // '' for the stock unit.
      sales_uom: z.string(),
      default_warehouse: z.string(),
      default_price_list: z.string(),
      selling_cost_center: z.string(),
      income_account: z.string(),
      expense_account: z.string(),
      // Read on creation only: it becomes the item's first Item Price.
      standard_rate: atLeastZero,
      uoms: z.array(
        z.object({
          uom_id: z.string().min(1, 'Pick a unit.'),
          conversion_factor: numberText.refine((value) => Number(value || 0) > 0, 'Enter a number above 0.'),
        })
      ),
      taxes: z.array(
        z.object({
          item_tax_template_id: z.string().min(1, 'Pick an item tax template.'),
          tax_category_id: z.string(),
          // "YYYY-MM-DD", or '' for always.
          valid_from: z.string(),
        })
      ),
    })
    .superRefine((item, context) => {
      item.uoms.forEach((row, index) => {
        if (!row.uom_id) return;
        // The stock unit's factor is 1 by definition, and item_uoms_unique allows a unit once.
        const message =
          row.uom_id === item.stock_uom
            ? 'This is the stock unit: it needs no row.'
            : item.uoms.findIndex((other) => other.uom_id === row.uom_id) < index
              ? 'This unit is already in the table.'
              : null;
        if (message) context.addIssue({ code: 'custom', path: ['uoms', index, 'uom_id'], message });
      });
    });

export type ItemValues = z.infer<ReturnType<typeof itemSchema>>;
