import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { postgrestError } from '../../lib/errors';
import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateDashboard } from '../dashboard/queries';
import type { SessionAmountsValues } from './schema';

// The only file that knows the tables are called `pos_opening_entries` and `pos_opening_entry_balances`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const posOpeningEntriesKey = {
  all: ['pos-opening-entries'],
  lists: () => [...posOpeningEntriesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...posOpeningEntriesKey.lists(), args],
};

/**
 * A system's POS Opening Entries — its sessions — newest first, each with its opening amounts; LEDGER_PAGE of
 * them at most. An open session is always among them: one cashier has one per POS Profile.
 */
export function usePosOpeningEntriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: posOpeningEntriesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_opening_entries')
        .select('*, pos_opening_entry_balances(*)')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: false })
        .order('idx', { referencedTable: 'pos_opening_entry_balances' })
        .limit(LEDGER_PAGE)
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type PosOpeningEntry = NonNullable<ReturnType<typeof usePosOpeningEntriesQuery>['data']>[number];

/** The session a cashier is selling in: their own submitted entry still Open. The newest, when they hold one on two profiles. */
export const openSession = (entries: PosOpeningEntry[] | undefined, userId: string | undefined) =>
  entries?.find((entry) => entry.user_id === userId && entry.docstatus === 1 && entry.status === 'Open');

/** After a session opens or closes: the sessions, and the Dashboard's Open Registers that counts them. */
export function invalidatePosOpeningEntries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([queryClient.invalidateQueries({ queryKey: posOpeningEntriesKey.lists() }), invalidateDashboard(queryClient)]);
}

/**
 * Open a session: the entry and its opening amounts, submitted in one transaction (public.open_pos_session,
 * security invoker). The database dates it and refuses a second open session on the same POS Profile.
 */
export function useOpenPosSessionMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, values }: { profileId: string; values: SessionAmountsValues }) => {
      const payload = {
        merchant_id: merchantId,
        pos_profile_id: profileId,
        balances: values.amounts.map((row) => ({ mode_of_payment_id: row.mode_of_payment_id, opening_amount: Number(row.amount || 0) })),
      };
      try {
        await supabase.rpc('open_pos_session', { payload }).throwOnError();
      } catch (cause) {
        // The person's session on this profile is open already — a first open whose answer was lost, or one from
        // another phone (pos_opening_entries_one_open): opening is done, as closing is (useClosePosSessionMutation).
        if (!(cause instanceof Error) || postgrestError(cause)?.code !== '23505') throw cause;
      }
    },
    // Settled, not only succeeded: the session list asks again whatever the answer.
    onSettled: () => invalidatePosOpeningEntries(queryClient),
  });
}
