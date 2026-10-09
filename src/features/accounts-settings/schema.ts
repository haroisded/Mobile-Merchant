import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The frozen date is "YYYY-MM-DD" or '' and the
// role an id or '' — the mutation sends null for either blank.
export const accountsSettingsSchema = z.object({
  unlink_payment_on_cancellation: z.boolean(),
  delete_linked_ledger_entries: z.boolean(),
  enable_immutable_ledger: z.boolean(),
  enable_discount_accounting: z.boolean(),
  add_taxes_from_item_tax_template: z.boolean(),
  accounts_frozen_till_date: z.string(),
  frozen_accounts_modifier: z.string(),
});

export type AccountsSettingsValues = z.infer<typeof accountsSettingsSchema>;
