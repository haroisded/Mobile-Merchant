import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). uoms_name_length bounds the trimmed name at 1..140.
export const uomSchema = z.object({
  uom_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  must_be_whole_number: z.boolean(),
  enabled: z.boolean(),
});

export type UomValues = z.infer<typeof uomSchema>;
