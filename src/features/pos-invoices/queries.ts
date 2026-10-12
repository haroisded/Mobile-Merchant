import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateLedgers } from '../documents/queries';
import { invalidateItemPrices } from '../item-prices/queries';
import type { checkoutPayload } from './cart';

// The only file that knows the tables are called `pos_invoices`, `pos_invoice_items`, `pos_invoice_taxes` and
// `pos_invoice_payments` (.claude/instruction_mds/data-layer.md rules 2-3).
const posInvoicesKey = {
  all: ['pos-invoices'],
  lists: () => [...posInvoicesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...posInvoicesKey.lists(), args],
  detail: (args: { id: string }) => [...posInvoicesKey.all, 'detail', args],
};

/** A system's POS Invoices — the Orders — newest first; LEDGER_PAGE of them at most. */
export function usePosInvoicesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: posInvoicesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_invoices')
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
 * One invoice with its items, taxes and payments in order — by id, not out of the list, so a ledger row opens
 * a sale however old it is. Null when it is gone or the caller's roles hide it.
 */
export function usePosInvoiceQuery({ id }: { id: string }) {
  return useQuery({
    queryKey: posInvoicesKey.detail({ id }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_invoices')
        .select('*, pos_invoice_items(*), pos_invoice_taxes(*), pos_invoice_payments(*)')
        .eq('id', id)
        .order('idx', { referencedTable: 'pos_invoice_items' })
        .order('idx', { referencedTable: 'pos_invoice_taxes' })
        .order('idx', { referencedTable: 'pos_invoice_payments' })
        .maybeSingle()
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type PosInvoiceDocument = NonNullable<ReturnType<typeof usePosInvoiceQuery>['data']>;

/**
 * Complete an order: the invoice and its rows, submitted in one transaction (public.pos_checkout, security
 * invoker) — a refused sale leaves no draft and uses no number. The database dates it, checks the totals add
 * up and posts the stock and the ledgers; it answers with the invoice's id. A sale can also write a missing
 * Item Price (Stock Settings).
 */
export function useCheckoutMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sale: ReturnType<typeof checkoutPayload>) => {
      const { data } = await supabase.rpc('pos_checkout', { payload: { merchant_id: merchantId, ...sale } }).throwOnError();
      return data;
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: posInvoicesKey.lists() }), invalidateLedgers(queryClient), invalidateItemPrices(queryClient)]);
    },
  });
}
