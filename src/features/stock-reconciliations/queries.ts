import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { StockReconciliationValues } from './schema';

export type StockReconciliation = Tables<'stock_reconciliations'>;

// The only file that knows the tables are called `stock_reconciliations` and `stock_reconciliation_items`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const stockReconciliationsKey = {
  all: ['stock-reconciliations'],
  lists: () => [...stockReconciliationsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...stockReconciliationsKey.lists(), args],
  detail: (args: { id: string }) => [...stockReconciliationsKey.all, 'detail', args],
};

/** A system's stock reconciliations, newest first; LEDGER_PAGE of them at most. */
export function useStockReconciliationsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: stockReconciliationsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_reconciliations')
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
 * One stock reconciliation with its rows in order — by id, not out of the list, so a ledger row opens a
 * document however old it is. Null when it is gone or the caller's roles hide it; idle while there is no
 * `id` (a document not yet saved).
 */
export function useStockReconciliationQuery({ id }: { id: string | undefined }) {
  return useQuery({
    queryKey: stockReconciliationsKey.detail({ id: id ?? '' }),
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_reconciliations')
        .select('*, stock_reconciliation_items(*)')
        .eq('id', id ?? '')
        .order('idx', { referencedTable: 'stock_reconciliation_items' })
        .maybeSingle()
        .throwOnError();
      return data;
    },
    enabled: id !== undefined,
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type StockReconciliationDocument = NonNullable<ReturnType<typeof useStockReconciliationQuery>['data']>;

/** After a save, a submit or a cancel — and after a new item's Opening Stock: the list and every open document. */
export function invalidateStockReconciliations(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: stockReconciliationsKey.all });
}

/**
 * Save a draft and its rows in one transaction (public.save_stock_reconciliation, security invoker); answers
 * with the document's id, which a new one's page goes on with.
 */
export function useSaveStockReconciliationMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: StockReconciliationValues) => {
      const { data } = await supabase.rpc('save_stock_reconciliation', { payload: { ...values, merchant_id: merchantId } }).throwOnError();
      return data;
    },
    onSuccess: () => invalidateStockReconciliations(queryClient),
  });
}

/** A draft only: a submitted or cancelled document stays (private.guard_docstatus). */
export function useDeleteStockReconciliationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('stock_reconciliations').delete().eq('id', id).throwOnError();
    },
    // The lists only: the page of the deleted draft is closing, and refetching it would flash "not available".
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockReconciliationsKey.lists() }),
  });
}
