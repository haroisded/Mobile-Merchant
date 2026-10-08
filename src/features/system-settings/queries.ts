import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { SystemSettingsValues } from './schema';

export type SystemSettings = Tables<'system_settings'>;

// The only file that knows the table is called `system_settings` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system, made by the merchants_seed_30_defaults trigger.
const systemSettingsKey = {
  all: ['system-settings'],
  detail: (args: { merchantId: string }) => [...systemSettingsKey.all, args],
};

export function useSystemSettingsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: systemSettingsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('system_settings').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdateSystemSettingsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: SystemSettingsValues) => {
      await supabase
        .from('system_settings')
        .update({ ...values, float_precision: Number(values.float_precision), currency_precision: Number(values.currency_precision) })
        .eq('merchant_id', merchantId)
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: systemSettingsKey.all });
    },
  });
}
