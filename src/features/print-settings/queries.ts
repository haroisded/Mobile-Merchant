import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type PrintSettings = Tables<'print_settings'>;

/** The form's values: three switches, so no Zod — there is nothing to reject (.claude/instruction_mds/data-layer.md §3). */
export type PrintSettingsValues = Pick<PrintSettings, 'with_letterhead' | 'compact_item_print' | 'print_taxes_with_zero_amount'>;

// The only file that knows the table is called `print_settings` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system, made by the merchants_seed_96_printing trigger.
const printSettingsKey = {
  all: ['print-settings'],
  detail: (args: { merchantId: string }) => [...printSettingsKey.all, args],
};

export function usePrintSettingsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: printSettingsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('print_settings').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdatePrintSettingsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: PrintSettingsValues) => {
      await supabase.from('print_settings').update(values).eq('merchant_id', merchantId).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printSettingsKey.all });
    },
  });
}
