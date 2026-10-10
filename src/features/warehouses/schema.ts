import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Empty strings are "none" — the mutation
// sends null. The tree rules are the database's (private.validate_tree), and so is the account's: an enabled
// Stock ledger (private.validate_warehouse_account).
export const warehouseSchema = z.object({
  warehouse_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  // Empty only for the root, All Warehouses, whose parent never changes.
  parent_id: z.string(),
  is_group: z.boolean(),
  account: z.string(),
  disabled: z.boolean(),
});

export type WarehouseValues = z.infer<typeof warehouseSchema>;
