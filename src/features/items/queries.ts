import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateLedgers } from '../documents/queries';
import { invalidateItemPrices } from '../item-prices/queries';
import { invalidateStockReconciliations } from '../stock-reconciliations/queries';
import type { ItemValues } from './schema';

// The only file that knows the tables are called `items`, `item_uoms` and `item_taxes`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const itemsKey = {
  all: ['items'],
  lists: () => [...itemsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...itemsKey.lists(), args],
};

/**
 * A system's items by code, each with its UOMs and Item Tax rows in order. The rows need Item read; a caller
 * with only select gets the items and no rows.
 *
 * ponytail: one request, so PostgREST's 1,000-row cap is the ceiling. Past it this needs a search sent to the
 * server and a paged list (FlashList, .claude/instruction_mds/frontend.md §4.2).
 */
export function useItemsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: itemsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('items')
        .select('*, item_uoms(*), item_taxes(*)')
        .eq('merchant_id', merchantId)
        .order('item_code')
        .order('idx', { referencedTable: 'item_uoms' })
        .order('idx', { referencedTable: 'item_taxes' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type Item = NonNullable<ReturnType<typeof useItemsQuery>['data']>[number];

/** "ITEM-001 · Notebook", or the code alone when the name repeats it. */
export const itemLabel = (item: Pick<Item, 'item_code' | 'item_name'>) =>
  item.item_name === item.item_code ? item.item_code : `${item.item_code} · ${item.item_name}`;

/**
 * The items a stock document may move, as picker options: enabled ones that keep stock (private.lock_bin
 * refuses the rest). `keep` stays listed once disabled, so a saved row still shows it.
 */
export const stockItemOptions = (items: Item[], keep?: string) =>
  items.filter((item) => item.id === keep || (item.is_stock_item && !item.disabled)).map((item) => ({ value: item.id, label: itemLabel(item) }));

/**
 * Save an item and its rows in one transaction (public.save_item_with_opening_stock, security invoker: it
 * calls public.save_item). A new stock item's Opening Stock is posted with it, as a submitted Opening Stock
 * reconciliation — so the save also changes the ledgers, the stock balance and the reconciliations.
 */
export function useSaveItemMutation({ merchantId, itemId }: { merchantId: string; itemId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ItemValues) => {
      await supabase.rpc('save_item_with_opening_stock', { payload: { id: itemId ?? '', merchant_id: merchantId, ...values } }).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: itemsKey.lists() }),
        invalidateItemPrices(queryClient),
        invalidateLedgers(queryClient),
        invalidateStockReconciliations(queryClient),
      ]);
    },
  });
}

/** Its prices go with it; refused with 23503 while a document still names it. */
export function useDeleteItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('items').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: itemsKey.lists() }), invalidateItemPrices(queryClient)]);
    },
  });
}
