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
