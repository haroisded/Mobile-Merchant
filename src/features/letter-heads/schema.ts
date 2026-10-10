import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The lengths are the table's checks
// (letter_heads_name_length, _content_length, _footer_length).
export const letterHeadSchema = z
  .object({
    letter_head_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
    content: z.string().max(1000, 'Use 1,000 characters or fewer.'),
    footer: z.string().max(500, 'Use 500 characters or fewer.'),
    is_default: z.boolean(),
    disabled: z.boolean(),
  })
  // letter_heads_default_enabled.
  .refine((head) => !(head.is_default && head.disabled), { path: ['is_default'], message: 'A disabled letter head cannot be the default.' });

export type LetterHeadValues = z.infer<typeof letterHeadSchema>;
