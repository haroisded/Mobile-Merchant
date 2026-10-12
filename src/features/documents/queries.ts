import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { invalidateBins } from '../bins/queries';
import { invalidateDashboard } from '../dashboard/queries';
import { invalidateGlEntries } from '../gl-entries/queries';
import { invalidateStockLedgerEntries } from '../stock-ledger-entries/queries';

type Client = ReturnType<typeof useQueryClient>;

/** A document's docstatus in words, by its number: only a draft can be changed, and a cancelled one is final. */
export const DOCSTATUS = ['Draft', 'Submitted', 'Cancelled'];

/** What any posting writes: both ledgers and the stock balance — and so every figure the Dashboard adds up from them. */
export function invalidateLedgers(queryClient: Client) {
  return Promise.all([
    invalidateGlEntries(queryClient),
    invalidateStockLedgerEntries(queryClient),
    invalidateBins(queryClient),
    invalidateDashboard(queryClient),
  ]);
}

type ActionArgs = {
  /** The doctype's name, as public.doctypes has it ("Stock Entry"). */
  doctype: string;
  action: 'submit' | 'cancel' | 'delete';
  /** The document's own queries: its docstatus changed, and a submit writes what its rows moved. */
  invalidate: (queryClient: Client) => Promise<void>;
};

/**
 * Submit, cancel or delete one document, by id — public.submit_document, public.cancel_document and
 * public.delete_document, the three RPCs every document shares. Security definer: they check the caller's
 * Submit, Cancel or Delete permission themselves, and post, reverse or remove in one transaction, so a
 * refusal leaves nothing half-done. Delete is a cancelled document's, with the ledger entries it posted,
 * and only while Accounts Settings say so; a draft is deleted through its own feature.
 */
export function useDocumentActionMutation({ doctype, action, invalidate }: ActionArgs) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const args = { p_doctype: doctype, p_id: id };
      const calls = {
        submit: () => supabase.rpc('submit_document', args),
        cancel: () => supabase.rpc('cancel_document', args),
        delete: () => supabase.rpc('delete_document', args),
      };
      await calls[action]().throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateLedgers(queryClient), invalidate(queryClient)]);
    },
  });
}
