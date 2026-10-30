import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { postgrestError } from '../../lib/errors';
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
 *
 * Closing is done once, however many times it is asked: a close whose answer was lost — the connection dropped
 * after the database committed it — is followed by a second tap that the database refuses (session_not_open). That
 * refusal answers with the session's own closing entry, so the page goes on to it (TC-POS-18). Rejected: an
 * idempotent close_pos_session — a session closed by someone else is still told apart from the person's own retry
 * only by there being an entry, which is what this reads.
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
      try {
        const { data } = await supabase.rpc('close_pos_session', { payload }).throwOnError();
        return data;
      } catch (cause) {
        if (!(cause instanceof Error) || postgrestError(cause)?.message !== 'session_not_open') throw cause;
        const { data } = await supabase
          .from('pos_closing_entries')
          .select('id')
          .eq('pos_opening_entry_id', sessionId)
          .eq('docstatus', 1)
          .maybeSingle()
          .throwOnError();
        if (!data) throw cause;
        return data.id;
      }
    },
    // Settled, not only succeeded: whatever the answer, the session list asks again, so Sell never shows a closed
    // session as open.
    onSettled: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: posClosingEntriesKey.lists() }), invalidatePosOpeningEntries(queryClient)]);
    },
  });
}
