import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Blank conditions and dates are '' — the
// mutation sends null. Priority is the TextInput's string; the mutation sends Number().
export const taxRuleSchema = z
  .object({
    sales_tax_template_id: z.string().min(1, 'Pick a template.'),
    tax_category_id: z.string(),
    item_group_id: z.string(),
    from_date: z.string(),
    to_date: z.string(),
    // tax_rules_priority.
    priority: z.string().trim().regex(/^\d+$/, 'Enter a whole number.').refine((priority) => Number(priority) >= 1, 'Enter 1 or more.'),
  })
  // tax_rules_dates: ERPNext's "From Date cannot be greater than To Date".
  .refine((rule) => !rule.from_date || !rule.to_date || rule.from_date <= rule.to_date, {
    path: ['to_date'],
    message: "To Date can't be before From Date.",
  });

export type TaxRuleValues = z.infer<typeof taxRuleSchema>;
