import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { bringsTo, takesFrom } from './schema';
import type { StockEntryValues } from './schema';

export type StockEntry = Tables<'stock_entries'>;

// The only file that knows the tables are called `stock_entries` and `stock_entry_items`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const stockEntriesKey = {
  all: ['stock-entries'],
  lists: () => [...stockEntriesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...stockEntriesKey.lists(), args],
  detail: (args: { id: string }) => [...stockEntriesKey.all, 'detail', args],
};

/** A system's stock entries, newest first; LEDGER_PAGE of them at most. */
export function useStockEntriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: stockEntriesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_entries')
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

/**
 * One stock entry with its rows in order — by id, not out of the list, so a ledger row opens a document
 * however old it is. Null when it is gone or the caller's roles hide it; idle while there is no `id` (a
 * document not yet saved).
 */
export function useStockEntryQuery({ id }: { id: string | undefined }) {
  return useQuery({
    queryKey: stockEntriesKey.detail({ id: id ?? '' }),
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_entries')
        .select('*, stock_entry_items(*)')
        .eq('id', id ?? '')
        .order('idx', { referencedTable: 'stock_entry_items' })
        .maybeSingle()
        .throwOnError();
      return data;
    },
    enabled: id !== undefined,
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type StockEntryDocument = NonNullable<ReturnType<typeof useStockEntryQuery>['data']>;

/** After a save, a submit or a cancel: the list and every open document. */
export function invalidateStockEntries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: stockEntriesKey.all });
}

/**
 * Save a draft and its rows in one transaction (public.save_stock_entry, security invoker); answers with the
 * document's id, which a new one's page goes on with. The warehouse a purpose has no use for is left out
 * (stock_entries_warehouses), and so is a rate that is not a receipt's: an issue or a transfer leaves at the
 * stock's own valuation, written on submit.
 */
export function useSaveStockEntryMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: StockEntryValues) => {
      const payload = {
        ...values,
        merchant_id: merchantId,
        from_warehouse: takesFrom(values.purpose) ? values.from_warehouse : '',
        to_warehouse: bringsTo(values.purpose) ? values.to_warehouse : '',
        items: values.items.map((row) => ({ ...row, basic_rate: values.purpose === 'Material Receipt' ? row.basic_rate : '' })),
      };
      const { data } = await supabase.rpc('save_stock_entry', { payload }).throwOnError();
      return data;
    },
    onSuccess: () => invalidateStockEntries(queryClient),
  });
}

/** A draft only: a submitted or cancelled document stays (private.guard_docstatus). */
export function useDeleteStockEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('stock_entries').delete().eq('id', id).throwOnError();
    },
    // The lists only: the page of the deleted draft is closing, and refetching it would flash "not available".
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockEntriesKey.lists() }),
  });
}
