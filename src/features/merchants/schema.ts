import * as z from 'zod';

// Zod earns its place here because this is *form input* — user-typed, untrusted, and needing
// per-field messages. Reads are not validated with it: the generated database.types.ts already
// expresses the schema, and a Zod mirror of a migration is the migration written twice in two
// languages, drifting from the day it is committed (.claude/instruction_mds/data-layer.md §3).
//
// One schema, shared by both forms that write a Company — Create System and the Company screen — and by
// the mutations behind them, so the thing validated and the thing written cannot disagree. A system IS its
// company (supabase/migrations/20261008101635_company_and_fiscal_year.sql).
export const companySchema = z.object({
  // `.trim()` before `.min(1)` so a name of pure spaces fails here rather than at the
  // merchants_name_length check constraint, which bounds the trimmed name at 1..80.
  name: z.string().trim().min(1, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
  // merchants_abbr_shape: 1..10 characters, no spaces.
  abbr: z
    .string()
    .trim()
    .min(1, 'Enter an abbreviation.')
    .max(10, 'Use 10 characters or fewer.')
    .regex(/^\S+$/, 'Leave out the spaces.'),
  country_code: z.string().min(1, 'Select a country.'),
  default_currency: z.string().min(1, 'Select a currency.'),
});

export type CompanyValues = z.infer<typeof companySchema>;

// The Company screen's accounting defaults and Perpetual Inventory (docs.frappe.io/erpnext/company-accounting-defaults,
// /perpetual-inventory). Each holds an account or cost center id, '' for none; the mutation sends null. Which
// record each may name is the picker's filter and private.validate_company_accounts's check, not Zod's. Only
// the Company screen writes them; Create System leaves them to the merchants_seed_50 trigger.
export const companyFormSchema = companySchema.extend({
  default_cash_account: z.string(),
  default_bank_account: z.string(),
  default_income_account: z.string(),
  default_expense_account: z.string(),
  cost_center: z.string(),
  write_off_account: z.string(),
  round_off_account: z.string(),
  round_off_cost_center: z.string(),
  default_discount_account: z.string(),
  enable_perpetual_inventory: z.boolean(),
  default_inventory_account: z.string(),
  stock_adjustment_account: z.string(),
  stock_received_but_not_billed: z.string(),
  expenses_included_in_valuation: z.string(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

/**
 * "Corner Cafe" → "CC": the first letter of up to three words, upper case — the abbreviation ERPNext's
 * setup wizard suggests, and the one the migration gave the systems that already existed.
 */
export function suggestAbbr(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}
