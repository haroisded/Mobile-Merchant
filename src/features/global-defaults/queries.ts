import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type GlobalDefaults = Tables<'global_defaults'>;

/** The form's values: two switches, so no Zod — there is nothing to reject (.claude/instruction_mds/data-layer.md §3). */
export type GlobalDefaultsValues = Pick<GlobalDefaults, 'disable_rounded_total' | 'disable_in_words'>;

// The only file that knows the table is called `global_defaults` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system.
const globalDefaultsKey = {
  all: ['global-defaults'],
  detail: (args: { merchantId: string }) => [...globalDefaultsKey.all, args],
};

export function useGlobalDefaultsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: globalDefaultsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('global_defaults').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdateGlobalDefaultsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: GlobalDefaultsValues) => {
      await supabase.from('global_defaults').update(values).eq('merchant_id', merchantId).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: globalDefaultsKey.all });
    },
  });
}
