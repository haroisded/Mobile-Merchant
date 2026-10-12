import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateLedgers } from '../documents/queries';
import { invalidateItemPrices } from '../item-prices/queries';
import type { checkoutPayload, returnPayload } from './cart';

// The only file that knows the tables are called `pos_invoices`, `pos_invoice_items`, `pos_invoice_taxes` and
// `pos_invoice_payments` (.claude/instruction_mds/data-layer.md rules 2-3).
const posInvoicesKey = {
  all: ['pos-invoices'],
  lists: () => [...posInvoicesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...posInvoicesKey.lists(), args],
  returns: (args: { returnAgainst: string }) => [...posInvoicesKey.lists(), 'returns', args],
  detail: (args: { id: string }) => [...posInvoicesKey.all, 'detail', args],
};

/** Every POS Invoice query — the Orders, each sale's page, the returns made against it: a void or a return changes all three. */
export const invalidatePosInvoices = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: posInvoicesKey.all });

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
 * a sale however old it is. Null when it is gone or the caller's roles hide it. A return also carries the
 * number of the sale it was made against (`return_against_name`): one more row, read only for a return.
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
      if (!data) return null;

      const original = data.return_against ? (await supabase.from('pos_invoices').select('name').eq('id', data.return_against).maybeSingle().throwOnError()).data : null;
      return { ...data, return_against_name: original?.name ?? null };
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type PosInvoiceDocument = NonNullable<ReturnType<typeof usePosInvoiceQuery>['data']>;

/**
 * The submitted returns made against one sale, oldest first, each with its lines: what is already returned of
 * every line, and the returns the sale's page lists.
 */
export function usePosInvoiceReturnsQuery({ returnAgainst }: { returnAgainst: string }) {
  return useQuery({
    queryKey: posInvoicesKey.returns({ returnAgainst }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_invoices')
        .select('id, name, rounded_total, pos_invoice_items(return_against_item, qty)')
        .eq('return_against', returnAgainst)
        .eq('docstatus', 1)
        .order('created_at')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * Complete an order, or the return of one: the invoice and its rows, submitted in one transaction
 * (public.pos_checkout, security invoker) — a refused sale leaves no draft and uses no number. The database
 * dates it, checks the totals add up — a return's against the sale it takes back — and posts the stock and
 * the ledgers; it answers with the invoice's id. A sale can also write a missing Item Price (Stock Settings).
 */
export function useCheckoutMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sale: ReturnType<typeof checkoutPayload> | ReturnType<typeof returnPayload>) => {
      const { data } = await supabase.rpc('pos_checkout', { payload: { merchant_id: merchantId, ...sale } }).throwOnError();
      return data;
    },
    onSuccess: async () => {
      await Promise.all([invalidatePosInvoices(queryClient), invalidateLedgers(queryClient), invalidateItemPrices(queryClient)]);
    },
  });
}
