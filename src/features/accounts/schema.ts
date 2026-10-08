import * as z from 'zod';

/**
 * ERPNext's account types this app uses, under the root type each belongs to — the same lists the
 * accounts_type_fits_root check holds (supabase/migrations/20261008152613_chart_of_accounts.sql). No
 * Receivable, Payable or fixed-asset types: Customer, Supplier and Fixed Assets are out of scope.
 */
export const ACCOUNT_TYPES = new Map<string, readonly string[]>([
  ['Asset', ['Bank', 'Cash', 'Chargeable', 'Current Asset', 'Stock', 'Tax', 'Temporary']],
  ['Liability', ['Chargeable', 'Current Liability', 'Stock Received But Not Billed', 'Tax', 'Temporary']],
  ['Equity', ['Equity', 'Temporary']],
  ['Income', ['Direct Income', 'Income Account', 'Indirect Income', 'Temporary']],
  [
    'Expense',
    [
      'Chargeable',
      'Cost of Goods Sold',
      'Direct Expense',
      'Expense Account',
      'Expenses Included In Valuation',
      'Indirect Expense',
      'Round Off',
      'Stock Adjustment',
      'Tax',
      'Temporary',
    ],
  ],
]);

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Empty strings are "none" — the mutation
// sends null. The tree rules (a parent is a group, no cycles) are the database's: private.validate_tree.
export const accountSchema = z.object({
  account_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  account_number: z.string().trim().max(20, 'Use 20 characters or fewer.'),
  // Empty only for a root, whose parent never changes.
  parent_id: z.string(),
  // The parent's, sent on create because the column is required; private.validate_tree sets it from the
  // parent anyway, so moving an account under another root type needs no second field.
  root_type: z.string(),
  is_group: z.boolean(),
  account_type: z.string(),
  disabled: z.boolean(),
});

export type AccountValues = z.infer<typeof accountSchema>;
