import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Every default is an id or '' for none; which
// records each may name is the database's rule (private.validate_defaults) and the pickers' filter.
export const brandSchema = z.object({
  brand: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  description: z.string().trim().max(1000, 'Use 1,000 characters or fewer.'),
  default_warehouse: z.string(),
  default_price_list: z.string(),
  selling_cost_center: z.string(),
  income_account: z.string(),
});

export type BrandValues = z.infer<typeof brandSchema>;
