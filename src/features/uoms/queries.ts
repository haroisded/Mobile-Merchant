import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { UomValues } from './schema';

export type Uom = Tables<'uoms'>;

/** Enabled units as picker options; `keep` stays listed even once disabled, so a saved field still shows it. */
export const uomOptions = (uoms: Uom[], keep?: string) =>
  uoms.filter((uom) => uom.id === keep || uom.enabled).map((uom) => ({ value: uom.id, label: uom.uom_name }));

// The only file that knows the table is called `uoms` (.claude/instruction_mds/data-layer.md rules 2-3).
const uomsKey = {
  all: ['uoms'],
  lists: () => [...uomsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...uomsKey.lists(), args],
};

/** A system's units of measure, by name. */
export function useUomsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: uomsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('uoms').select('*').eq('merchant_id', merchantId).order('uom_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a unit, or edit one when `uomId` is given. */
export function useSaveUomMutation({ merchantId, uomId }: { merchantId: string; uomId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: UomValues) => {
      if (uomId) {
        await supabase.from('uoms').update(values).eq('id', uomId).throwOnError();
      } else {
        await supabase.from('uoms').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: uomsKey.lists() });
    },
  });
}

/** Refused with 23503 while a conversion names the unit. */
export function useDeleteUomMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('uoms').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: uomsKey.lists() });
    },
  });
}
