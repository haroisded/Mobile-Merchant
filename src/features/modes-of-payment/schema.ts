import * as z from 'zod';

import type { Account } from '../accounts/queries';

// ERPNext's Mode of Payment types. The type names the method; the default account decides the ledger.
export const PAYMENT_TYPES = ['Cash', 'Bank', 'General', 'Phone'] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

/**
 * The ledgers a mode of its type may propose — private.validate_mode_of_payment_account's rule: a Cash mode a
 * Cash ledger, a Bank mode a Bank ledger, General and Phone either.
 */
export const fitsPaymentType = (type: string) => (account: Account) =>
  type === 'Cash' ? account.account_type === 'Cash' : type === 'Bank' ? account.account_type === 'Bank' : account.account_type === 'Cash' || account.account_type === 'Bank';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). modes_of_payment_name_length bounds the
// trimmed name at 1..140; default_account is an id or '' for none.
export const modeOfPaymentSchema = z.object({
  mode_of_payment: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  type: z.enum(PAYMENT_TYPES),
  default_account: z.string(),
  enabled: z.boolean(),
});

export type ModeOfPaymentValues = z.infer<typeof modeOfPaymentSchema>;
