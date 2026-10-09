import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). tax_categories_title_length bounds the
// trimmed title at 1..140.
export const taxCategorySchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(140, 'Use 140 characters or fewer.'),
  disabled: z.boolean(),
});

export type TaxCategoryValues = z.infer<typeof taxCategorySchema>;
