import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';

/** A quantity or rate as the TextInput holds it: blank for none, never below zero. */
export const atLeastZero = numberText.refine((value) => Number(value || 0) >= 0, 'Enter 0 or more.');

/**
 * Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_item takes the same object. Empty strings
 * are "none" — the RPC stores null. Which record each default may name is the database's rule
 * (private.validate_defaults), and so is the code under a naming series (private.prepare_item): `codeTyped`
 * is false when Stock Settings names items by the series, and the field is then left out of the form.
 * `nameRequired`: where the store's level hides the code (src/features/merchants/levels.ts), the name is what the
 * item is known by, so a blank one — which would read as the series' number — is refused.
 */
export const itemSchema = (codeTyped: boolean, nameRequired = false) =>
  z
    .object({
      item_code: codeTyped ? z.string().trim().min(1, 'Enter a code.').max(140, 'Use 140 characters or fewer.') : z.string(),
      // Blank: the code, as ERPNext fills it.
      item_name: nameRequired
        ? z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.')
        : z.string().trim().max(140, 'Use 140 characters or fewer.'),
      // What the camera reads off the pack: items_barcode_shape's printable characters, no spaces. Blank for none.
      barcode: z
        .string()
        .trim()
        .max(64, 'Use 64 characters or fewer.')
        .regex(/^[!-~]*$/, 'Use letters, digits and symbols, with no spaces.'),
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
      income_account: z.string(),
      expense_account: z.string(),
      // items_max_discount: a percentage; blank or 0 is no limit.
      max_discount: atLeastZero.refine((value) => Number(value || 0) <= 100, 'Enter 100 or less.'),
      discount_account: z.string(),
      // Read on creation only: it becomes the item's first Item Price.
      standard_rate: atLeastZero,
      // Read on creation only: together they become an Opening Stock reconciliation, saved and submitted with
      // the item (public.save_item_with_opening_stock). An empty rate takes the Standard Selling Rate.
      opening_stock: atLeastZero,
      valuation_rate: atLeastZero,
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
