import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { SellingSettingsValues } from './schema';

export type SellingSettings = Tables<'selling_settings'>;

// The only file that knows the table is called `selling_settings` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system, made by the merchants_seed_90_selling trigger.
const sellingSettingsKey = {
  all: ['selling-settings'],
  detail: (args: { merchantId: string }) => [...sellingSettingsKey.all, args],
};

export function useSellingSettingsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: sellingSettingsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('selling_settings').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdateSellingSettingsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: SellingSettingsValues) => {
      await supabase
        .from('selling_settings')
        .update({ ...values, default_price_list: values.default_price_list || null })
        .eq('merchant_id', merchantId)
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sellingSettingsKey.all });
    },
  });
}
