import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { StockSettingsValues } from './schema';

export type StockSettings = Tables<'stock_settings'>;

// The only file that knows the table is called `stock_settings` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system, made by the merchants_seed_92_stock_settings trigger.
const stockSettingsKey = {
  all: ['stock-settings'],
  detail: (args: { merchantId: string }) => [...stockSettingsKey.all, args],
};

export function useStockSettingsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: stockSettingsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('stock_settings').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdateStockSettingsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: StockSettingsValues) => {
      await supabase
        .from('stock_settings')
        .update({
          ...values,
          item_group: values.item_group || null,
          stock_uom: values.stock_uom || null,
          default_warehouse: values.default_warehouse || null,
        })
        .eq('merchant_id', merchantId)
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stockSettingsKey.all });
    },
  });
}
