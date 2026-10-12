import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidatePosOpeningEntries } from '../pos-opening-entries/queries';
import type { SessionAmountsValues } from '../pos-opening-entries/schema';

// The only file that knows the tables are called `pos_closing_entries` and `pos_closing_entry_payments`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const posClosingEntriesKey = {
  all: ['pos-closing-entries'],
  lists: () => [...posClosingEntriesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...posClosingEntriesKey.lists(), args],
  detail: (args: { id: string }) => [...posClosingEntriesKey.all, 'detail', args],
};

/** A system's POS Closing Entries, newest first; LEDGER_PAGE of them at most. */
export function usePosClosingEntriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: posClosingEntriesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_closing_entries')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })
        .limit(LEDGER_PAGE)
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** One closing entry with a row per payment method: opening, expected, counted, difference. Null when gone or hidden. */
export function usePosClosingEntryQuery({ id }: { id: string }) {
  return useQuery({
    queryKey: posClosingEntriesKey.detail({ id }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_closing_entries')
        .select('*, pos_closing_entry_payments(*)')
        .eq('id', id)
        .order('idx', { referencedTable: 'pos_closing_entry_payments' })
        .maybeSingle()
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * Close a session: the entry and what was counted, submitted in one transaction (public.close_pos_session,
 * security invoker). The database works out what each payment method should hold and the difference, and
 * marks the session Closed; it answers with the closing entry's id.
 */
export function useClosePosSessionMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, values }: { sessionId: string; values: SessionAmountsValues }) => {
      const payload = {
        merchant_id: merchantId,
        pos_opening_entry_id: sessionId,
        payments: values.amounts.map((row) => ({ mode_of_payment_id: row.mode_of_payment_id, closing_amount: Number(row.amount || 0) })),
      };
      const { data } = await supabase.rpc('close_pos_session', { payload }).throwOnError();
      return data;
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: posClosingEntriesKey.lists() }), invalidatePosOpeningEntries(queryClient)]);
    },
  });
}
