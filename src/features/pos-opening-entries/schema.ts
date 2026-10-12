import * as z from 'zod';

import { atLeastZero } from '../items/schema';

/**
 * Form input, so Zod (.claude/instruction_mds/data-layer.md §3): an amount per payment method — what is in the
 * drawer when a session opens, and what was counted when it closes. Blank is 0. Which methods a session may
 * name is the database's rule (private.submit_pos_opening_entries).
 */
export const sessionAmountsSchema = z.object({
  amounts: z.array(z.object({ mode_of_payment_id: z.string(), amount: atLeastZero })),
});

export type SessionAmountsValues = z.infer<typeof sessionAmountsSchema>;
