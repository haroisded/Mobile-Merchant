import * as z from 'zod';

import { EXPIRY_CHOICES } from './code';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3): the new-code form. expiryArgs (./code.ts) turns the
// expiry into create_access_codes' arguments, and the database works out the instant.
export const newAccessCodeSchema = z
  .object({
    merchant_id: z.string().min(1, 'Pick a system.'),
    label: z.string().trim().max(40, 'Use 40 characters or fewer.'),
    quantity: z.number().int().min(1, 'Make at least 1 code.').max(20, 'Make 20 codes or fewer at a time.'),
    expiry: z.enum(EXPIRY_CHOICES.map((choice) => choice.value)),
    // A stored date; '' unless the expiry is Custom.
    expires_on: z.string(),
    uses: z.enum(['one', 'many']),
  })
  .superRefine((values, ctx) => {
    if (values.expiry === 'custom' && values.expires_on === '') {
      ctx.addIssue({ code: 'custom', path: ['expires_on'], message: 'Pick the last day the code works.' });
    }
  });

export type NewAccessCodeValues = z.infer<typeof newAccessCodeSchema>;
