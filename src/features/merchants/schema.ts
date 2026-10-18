import * as z from 'zod';

// Zod earns its place here because this is *form input* — user-typed, untrusted, and needing
// per-field messages. Reads are not validated with it: the generated database.types.ts already
// expresses the schema, and a Zod mirror of a migration is the migration written twice in two
// languages, drifting from the day it is committed (.claude/instruction_mds/data-layer.md §3).
//
// One schema, shared by both forms that write a store — Create Store and the Store page — and by the
// mutations behind them, so the thing validated and the thing written cannot disagree. A store is ERPNext's
// Company, one per store and no branches (supabase/migrations/20261018162135_single_store.sql).
export const companySchema = z.object({
  // `.trim()` before `.min(1)` so a name of pure spaces fails here rather than at the
  // merchants_name_length check constraint, which bounds the trimmed name at 1..80.
  name: z.string().trim().min(1, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  country_code: z.string().min(1, 'Select a country.'),
  default_currency: z.string().min(1, 'Select a currency.'),
});

export type CompanyValues = z.infer<typeof companySchema>;

// The Store page's accounting defaults and Perpetual Inventory (docs.frappe.io/erpnext/company-accounting-defaults,
// /perpetual-inventory). Each holds an account id, '' for none; the mutation sends null. Which account each may
// name is the picker's filter and private.validate_company_accounts's check, not Zod's. Only the Store page
// writes them; Create Store leaves them to the merchants_seed_50 trigger.
export const companyFormSchema = companySchema.extend({
  default_cash_account: z.string(),
  default_bank_account: z.string(),
  default_income_account: z.string(),
  default_expense_account: z.string(),
  write_off_account: z.string(),
  round_off_account: z.string(),
  default_discount_account: z.string(),
  enable_perpetual_inventory: z.boolean(),
  default_inventory_account: z.string(),
  stock_adjustment_account: z.string(),
  stock_received_but_not_billed: z.string(),
  expenses_included_in_valuation: z.string(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
