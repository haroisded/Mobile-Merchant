import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { ItemPriceValues } from './schema';

export type ItemPrice = Tables<'item_prices'>;

// The only file that knows the table is called `item_prices` (.claude/instruction_mds/data-layer.md rules 2-3).
const itemPricesKey = {
  all: ['item-prices'],
  lists: () => [...itemPricesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...itemPricesKey.lists(), args],
};

/**
 * A system's item prices, newest first.
 *
 * ponytail: one request, so PostgREST's 1,000-row cap is the ceiling. Past it this needs a filter by item or
 * price list sent to the server, and a paged list.
 */
export function useItemPricesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: itemPricesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('item_prices').select('*').eq('merchant_id', merchantId).order('created_at', { ascending: false }).throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Saving or deleting an item changes its prices too: the Standard Selling Rate writes one, a delete takes them. */
export function invalidateItemPrices(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: itemPricesKey.lists() });
}

/** The row a form's strings become: blank dates to null, the rate parsed. */
const row = (values: ItemPriceValues) => ({
  ...values,
  price_list_rate: Number(values.price_list_rate),
  valid_from: values.valid_from || null,
  valid_upto: values.valid_upto || null,
});

/** Create a price, or edit one when `priceId` is given. */
export function useSaveItemPriceMutation({ merchantId, priceId }: { merchantId: string; priceId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ItemPriceValues) => {
      if (priceId) {
        await supabase.from('item_prices').update(row(values)).eq('id', priceId).throwOnError();
      } else {
        await supabase.from('item_prices').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: () => invalidateItemPrices(queryClient),
  });
}

export function useDeleteItemPriceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('item_prices').delete().eq('id', id).throwOnError();
    },
    onSuccess: () => invalidateItemPrices(queryClient),
  });
}
