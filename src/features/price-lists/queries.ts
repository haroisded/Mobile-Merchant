import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { PriceListValues } from './schema';

export type PriceList = Tables<'price_lists'>;

/** Enabled price lists as picker options, None first; `keep` as in accounts' ledgerOptions. */
export const priceListOptions = (priceLists: PriceList[], keep?: string | null) => [
  { value: '', label: 'None' },
  ...priceLists
    .filter((priceList) => priceList.id === keep || priceList.enabled)
    .map((priceList) => ({ value: priceList.id, label: priceList.price_list_name, hint: priceList.currency })),
];

// The only file that knows the table is called `price_lists` (.claude/instruction_mds/data-layer.md rules 2-3).
const priceListsKey = {
  all: ['price-lists'],
  lists: () => [...priceListsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...priceListsKey.lists(), args],
};

/** A system's price lists, by name. */
export function usePriceListsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: priceListsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('price_lists').select('*').eq('merchant_id', merchantId).order('price_list_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a price list, or edit one when `priceListId` is given. */
export function useSavePriceListMutation({ merchantId, priceListId }: { merchantId: string; priceListId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: PriceListValues) => {
      if (priceListId) {
        await supabase.from('price_lists').update(values).eq('id', priceListId).throwOnError();
      } else {
        await supabase.from('price_lists').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: priceListsKey.lists() });
    },
  });
}

/** Refused with 23503 while a brand names it as its default. */
export function useDeletePriceListMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('price_lists').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: priceListsKey.lists() });
    },
  });
}
