import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_item_group takes the same object. Empty
// strings are "none" — the RPC stores null. The tree rules are the database's (private.validate_tree), and so
// is which record each default may name (private.validate_defaults).
export const itemGroupSchema = z.object({
  item_group_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  // Empty only for the root, All Item Groups, whose parent never changes.
  parent_id: z.string(),
  is_group: z.boolean(),
  default_price_list: z.string(),
  default_warehouse: z.string(),
  income_account: z.string(),
  expense_account: z.string(),
  taxes: z.array(
    z
      .object({
        item_tax_template_id: z.string().min(1, 'Pick an item tax template.'),
        tax_category_id: z.string(),
        // "YYYY-MM-DD", or '' for always.
        valid_from: z.string(),
        minimum_net_rate: numberText.refine((rate) => Number(rate || 0) >= 0, 'Enter 0 or more.'),
        maximum_net_rate: numberText.refine((rate) => Number(rate || 0) >= 0, 'Enter 0 or more.'),
      })
      // item_group_taxes_range: 0 is no upper bound.
      .refine((row) => Number(row.maximum_net_rate || 0) === 0 || Number(row.minimum_net_rate || 0) <= Number(row.maximum_net_rate), {
        path: ['maximum_net_rate'],
        message: 'Enter at least the Minimum Net Rate, or 0 for no limit.',
      })
  ),
});

export type ItemGroupValues = z.infer<typeof itemGroupSchema>;
