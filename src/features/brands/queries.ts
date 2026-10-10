import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { BrandValues } from './schema';

export type Brand = Tables<'brands'>;

// The only file that knows the table is called `brands` (.claude/instruction_mds/data-layer.md rules 2-3).
const brandsKey = {
  all: ['brands'],
  lists: () => [...brandsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...brandsKey.lists(), args],
};

/** A system's brands, by name. */
export function useBrandsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: brandsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('brands').select('*').eq('merchant_id', merchantId).order('brand').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** The row a form's strings become: blanks to null. */
const row = (values: BrandValues) => ({
  ...values,
  description: values.description || null,
  default_warehouse: values.default_warehouse || null,
  default_price_list: values.default_price_list || null,
  selling_cost_center: values.selling_cost_center || null,
  income_account: values.income_account || null,
});

/** Create a brand, or edit one when `brandId` is given. */
export function useSaveBrandMutation({ merchantId, brandId }: { merchantId: string; brandId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: BrandValues) => {
      if (brandId) {
        await supabase.from('brands').update(row(values)).eq('id', brandId).throwOnError();
      } else {
        await supabase.from('brands').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brandsKey.lists() });
    },
  });
}

export function useDeleteBrandMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('brands').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brandsKey.lists() });
    },
  });
}
