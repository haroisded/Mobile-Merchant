import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { UomConversionFactorValues } from './schema';

export type UomConversionFactor = Tables<'uom_conversion_factors'>;

/** "1 Kg = 1000 Gram": one From UOM is Value To UOMs. */
export const factorLabel = (factor: UomConversionFactor, uoms: { id: string; uom_name: string }[] | undefined) => {
  const unit = (id: string) => uoms?.find((uom) => uom.id === id)?.uom_name ?? '…';
  return `1 ${unit(factor.from_uom)} = ${factor.value} ${unit(factor.to_uom)}`;
};

// The only file that knows the table is called `uom_conversion_factors` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const uomConversionFactorsKey = {
  all: ['uom-conversion-factors'],
  lists: () => [...uomConversionFactorsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...uomConversionFactorsKey.lists(), args],
};

/** A system's conversions, oldest first; the screen names their units from the UOMs list. */
export function useUomConversionFactorsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: uomConversionFactorsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('uom_conversion_factors').select('*').eq('merchant_id', merchantId).order('created_at').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

const row = (values: UomConversionFactorValues) => ({ ...values, value: Number(values.value) });

/** Create a conversion, or edit one when `factorId` is given. */
export function useSaveUomConversionFactorMutation({ merchantId, factorId }: { merchantId: string; factorId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: UomConversionFactorValues) => {
      if (factorId) {
        await supabase.from('uom_conversion_factors').update(row(values)).eq('id', factorId).throwOnError();
      } else {
        await supabase.from('uom_conversion_factors').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: uomConversionFactorsKey.lists() });
    },
  });
}

export function useDeleteUomConversionFactorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('uom_conversion_factors').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: uomConversionFactorsKey.lists() });
    },
  });
}
