import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { invalidateBins } from '../bins/queries';
import { invalidateGlEntries } from '../gl-entries/queries';
import { invalidateStockLedgerEntries } from '../stock-ledger-entries/queries';

type Client = ReturnType<typeof useQueryClient>;

/** A document's docstatus in words, by its number: only a draft can be changed, and a cancelled one is final. */
export const DOCSTATUS = ['Draft', 'Submitted', 'Cancelled'];

/** What any posting writes: both ledgers and the stock balance. */
export function invalidateLedgers(queryClient: Client) {
  return Promise.all([invalidateGlEntries(queryClient), invalidateStockLedgerEntries(queryClient), invalidateBins(queryClient)]);
}

type ActionArgs = {
  /** The doctype's name, as public.doctypes has it ("Stock Entry"). */
  doctype: string;
  action: 'submit' | 'cancel';
  /** The document's own queries: its docstatus changed, and a submit writes what its rows moved. */
  invalidate: (queryClient: Client) => Promise<void>;
};

/**
 * Submit or cancel one document, by id — public.submit_document and public.cancel_document, the two RPCs
 * every document shares. Security definer: they check the caller's Submit or Cancel permission themselves,
 * and post or reverse in one transaction, so a refusal leaves nothing half-posted.
 */
export function useDocumentActionMutation({ doctype, action, invalidate }: ActionArgs) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const args = { p_doctype: doctype, p_id: id };
      await (action === 'submit' ? supabase.rpc('submit_document', args) : supabase.rpc('cancel_document', args)).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateLedgers(queryClient), invalidate(queryClient)]);
    },
  });
}
