import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';

/** A child table lists each record once (the tables' unique constraints), said beside the second row. */
const once = <T>(rows: T[], key: (row: T) => string, field: string, ctx: z.RefinementCtx) => {
  rows.forEach((row, i) => {
    if (key(row) && rows.findIndex((other) => key(other) === key(row)) < i) {
      ctx.addIssue({ code: 'custom', path: [i, field], message: 'Already listed above.' });
    }
  });
};

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); save_pos_profile takes the same object. Empty
// strings are "none" — the RPC stores null. Which record each link may name is the database's rule
// (private.validate_pos_profile), and so are the payment rows' (private.validate_pos_profile_payments),
// explained here before a round trip.
export const posProfileSchema = z.object({
  pos_profile_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  disabled: z.boolean(),
  warehouse: z.string().min(1, 'Pick a warehouse.'),
  selling_price_list: z.string(),
  taxes_and_charges: z.string(),
  tax_category: z.string(),
  print_format: z.string(),
  letter_head: z.string(),
  account_for_change_amount: z.string(),
  write_off_account: z.string(),
  write_off_cost_center: z.string(),
  write_off_limit: numberText.refine((limit) => Number(limit || 0) >= 0, 'Enter 0 or more.'),
  income_account: z.string(),
  expense_account: z.string(),
  cost_center: z.string(),
  hide_unavailable_items: z.boolean(),
  allow_rate_change: z.boolean(),
  set_grand_total_to_default_mop: z.boolean(),
  print_receipt_on_order_complete: z.boolean(),
  users: z
    .array(z.object({ member_id: z.string().min(1, 'Pick a user.'), is_default: z.boolean() }))
    .superRefine((rows, ctx) => once(rows, (row) => row.member_id, 'member_id', ctx)),
  payments: z
    .array(z.object({ mode_of_payment_id: z.string().min(1, 'Pick a mode of payment.'), is_default: z.boolean(), allow_in_returns: z.boolean() }))
    .superRefine((rows, ctx) => {
      once(rows, (row) => row.mode_of_payment_id, 'mode_of_payment_id', ctx);
      // "Set one of them as the default payment method": the second default says so.
      rows.forEach((row, i) => {
        if (row.is_default && rows.findIndex((other) => other.is_default) < i) {
          ctx.addIssue({ code: 'custom', path: [i, 'is_default'], message: 'Another row is already the default.' });
        }
      });
    }),
  item_groups: z
    .array(z.object({ item_group_id: z.string().min(1, 'Pick an item group.') }))
    .superRefine((rows, ctx) => once(rows, (row) => row.item_group_id, 'item_group_id', ctx)),
});

export type PosProfileValues = z.infer<typeof posProfileSchema>;

/** What the payment rows lack as a set — the line under the form's buttons; null when they are complete. */
export function paymentsGap(payments: PosProfileValues['payments']) {
  if (payments.length === 0) return 'Add at least one payment method.';
  return payments.some((row) => row.is_default) ? null : 'Make one payment method the default.';
}
