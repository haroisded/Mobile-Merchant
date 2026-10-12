import * as z from 'zod';

import { atLeastZero } from '../items/schema';

/** What a rule is looked up by (pricing_rules_apply_on); its rows are of that kind. */
export const APPLY_ON = ['Item Code', 'Item Group', 'Brand'] as const;

/** What a rule gives (pricing_rules_result). */
export const RATE_OR_DISCOUNT = ['Rate', 'Discount Percentage', 'Discount Amount'] as const;

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Numbers are the TextInput's strings, blank
// for 0; blank dates and price list are '' — the mutation sends numbers and nulls. A rule's three results are
// one field here, `value`: the mutation writes it to the column Rate or Discount names.
export const pricingRuleSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(140, 'Use 140 characters or fewer.'),
    apply_on: z.enum(APPLY_ON),
    // The item, item group or brand of each row — whichever Apply On names. Listed once each.
    targets: z.array(z.object({ target: z.string().min(1, 'Pick one.') })).superRefine((rows, ctx) => {
      rows.forEach((row, i) => {
        if (row.target && rows.findIndex((other) => other.target === row.target) < i) {
          ctx.addIssue({ code: 'custom', path: [i, 'target'], message: 'Already listed above.' });
        }
      });
    }),
    min_qty: atLeastZero,
    max_qty: atLeastZero,
    min_amt: atLeastZero,
    max_amt: atLeastZero,
    valid_from: z.string(),
    valid_upto: z.string(),
    for_price_list: z.string(),
    // pricing_rules_priority.
    priority: z.string().trim().regex(/^\d+$/, 'Enter a whole number.').refine((priority) => Number(priority) >= 1, 'Enter 1 or more.'),
    disable: z.boolean(),
    rate_or_discount: z.enum(RATE_OR_DISCOUNT),
    value: atLeastZero.refine((value) => value.trim() !== '', 'Enter a number.'),
  })
  // pricing_rules_ranges: a max of 0 is no upper limit.
  .refine((rule) => !Number(rule.max_qty) || Number(rule.max_qty) >= Number(rule.min_qty || 0), { path: ['max_qty'], message: "Max Qty can't be under Min Qty." })
  .refine((rule) => !Number(rule.max_amt) || Number(rule.max_amt) >= Number(rule.min_amt || 0), { path: ['max_amt'], message: "Max Amt can't be under Min Amt." })
  // pricing_rules_dates.
  .refine((rule) => !rule.valid_from || !rule.valid_upto || rule.valid_from <= rule.valid_upto, { path: ['valid_upto'], message: "Valid Upto can't be before Valid From." })
  // pricing_rules_result.
  .refine((rule) => rule.rate_or_discount !== 'Discount Percentage' || Number(rule.value) <= 100, { path: ['value'], message: 'Enter 100 or less.' });

export type PricingRuleValues = z.infer<typeof pricingRuleSchema>;

/** What the rows lack as a set — the line under the form's buttons; null when there is one. */
export const targetsGap = (targets: PricingRuleValues['targets']) => (targets.length === 0 ? 'Add at least one row for the rule to apply on.' : null);
