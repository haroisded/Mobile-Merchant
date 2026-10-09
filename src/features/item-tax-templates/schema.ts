import * as z from 'zod';

// A rate as the TextInput holds it: a number, or blank for 0 (.claude/instruction_mds/data-layer.md §3 — the
// mutation sends Number()).
export const numberText = z.string().trim().regex(/^(-?\d+(\.\d+)?)?$/, 'Enter a number.');

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_item_tax_template takes the same object.
export const itemTaxTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(140, 'Use 140 characters or fewer.'),
    disabled: z.boolean(),
    rows: z.array(
      z.object({
        account: z.string().min(1, 'Pick a tax account.'),
        tax_rate: numberText,
        not_applicable: z.boolean(),
      })
    ),
  })
  // item_tax_template_rows_account_unique: "{account} entered twice in Item Tax".
  .superRefine((values, ctx) => {
    values.rows.forEach((row, i) => {
      if (row.account && values.rows.findIndex((other) => other.account === row.account) < i) {
        ctx.addIssue({ code: 'custom', path: ['rows', i, 'account'], message: 'This account is already in the list above.' });
      }
    });
  });

export type ItemTaxTemplateValues = z.infer<typeof itemTaxTemplateSchema>;
