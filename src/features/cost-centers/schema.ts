import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). An empty number is "none" — the mutation
// sends null. The tree rules are the database's: private.validate_tree.
export const costCenterSchema = z.object({
  cost_center_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  cost_center_number: z.string().trim().max(20, 'Use 20 characters or fewer.'),
  // Empty only for the root, the company's, whose parent never changes.
  parent_id: z.string(),
  is_group: z.boolean(),
  disabled: z.boolean(),
});

export type CostCenterValues = z.infer<typeof costCenterSchema>;
