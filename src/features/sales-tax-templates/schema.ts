import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';
import { CHARGE_TYPES, PREVIOUS_ROW_TYPES } from './calculate';

const rowSchema = z.object({
  charge_type: z.enum(CHARGE_TYPES),
  account: z.string().min(1, 'Pick a tax account.'),
  description: z.string().trim().min(1, 'Enter a description.').max(140, 'Use 140 characters or fewer.'),
  rate: numberText,
  tax_amount: numberText,
  // Reference Row #, "1", "2" …; '' unless the type reads an earlier row.
  row_id: z.string(),
  included_in_print_rate: z.boolean(),
  cost_center: z.string(),
});

export type SalesTaxRowValues = z.infer<typeof rowSchema>;

/**
 * The rows in calculation order, with ERPNext's rules on them — the table's checks and
 * private.validate_tax_row_references, explained beside the row before a round trip; the database still
 * enforces them. The template's Preview calculates only rows that pass.
 */
export const taxRowsSchema = z.array(rowSchema).superRefine((rows, ctx) => {
  rows.forEach((row, i) => {
    const reference = Number(row.row_id);
    const previous = PREVIOUS_ROW_TYPES.includes(row.charge_type);
    if (previous && i === 0) {
      ctx.addIssue({ code: 'custom', path: [i, 'charge_type'], message: 'The first row has no row before it to be calculated on.' });
      return;
    }
    if (previous && !(reference >= 1 && reference <= i)) {
      ctx.addIssue({ code: 'custom', path: [i, 'row_id'], message: 'Pick a row above this one.' });
      return;
    }
    if (!row.included_in_print_rate) return;
    if (row.charge_type === 'Actual') {
      ctx.addIssue({ code: 'custom', path: [i, 'included_in_print_rate'], message: 'A fixed amount cannot be included in the price.' });
      return;
    }
    const base = row.charge_type === 'On Previous Row Amount' ? [rows[reference - 1]] : previous ? rows.slice(0, reference) : [];
    if (base.some((earlier) => !earlier.included_in_print_rate)) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'included_in_print_rate'],
        message: `Include ${base.length > 1 ? `rows 1–${reference}` : `row ${reference}`} in the price first.`,
      });
    }
  });
});

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_sales_tax_template takes the same object.
export const salesTaxTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(140, 'Use 140 characters or fewer.'),
    tax_category_id: z.string(),
    is_default: z.boolean(),
    disabled: z.boolean(),
    rows: taxRowsSchema,
  })
  // sales_tax_templates_default_enabled: "Disabled template must not be default template."
  .superRefine((values, ctx) => {
    if (values.is_default && values.disabled) {
      ctx.addIssue({ code: 'custom', path: ['is_default'], message: 'A disabled template cannot be the default.' });
    }
  });

export type SalesTaxTemplateValues = z.infer<typeof salesTaxTemplateSchema>;

/** A form row as calculate.ts and save_sales_tax_template take it: numbers, and a reference only where it applies. */
export const taxRow = (row: SalesTaxRowValues) => ({
  ...row,
  rate: Number(row.rate || 0),
  tax_amount: Number(row.tax_amount || 0),
  row_id: PREVIOUS_ROW_TYPES.includes(row.charge_type) ? Number(row.row_id) : null,
});
