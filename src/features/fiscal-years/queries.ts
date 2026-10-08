import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { FiscalYearValues } from './schema';

export type FiscalYear = Tables<'fiscal_years'>;

// This is the only file in the app that knows the table is called `fiscal_years`
// (.claude/instruction_mds/data-layer.md rules 2-3). Keys most generic first; args in an object (rule 7).
const fiscalYearsKey = {
  all: ['fiscal-years'],
  lists: () => [...fiscalYearsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...fiscalYearsKey.lists(), args],
};

export function useFiscalYearsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: fiscalYearsKey.list({ merchantId }),
    queryFn: async () => {
      // The merchant filter picks one of the caller's systems; RLS is what keeps everyone else's out.
      const { data } = await supabase
        .from('fiscal_years')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('year_start_date', { ascending: false })
        .throwOnError();

      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a fiscal year, or edit one when `fiscalYearId` is given. */
export function useSaveFiscalYearMutation({ merchantId, fiscalYearId }: { merchantId: string; fiscalYearId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: FiscalYearValues) => {
      // Making a year the default needs no second write: the fiscal_years_single_default trigger clears
      // the old default inside this same statement.
      if (fiscalYearId) {
        await supabase.from('fiscal_years').update(values).eq('id', fiscalYearId).throwOnError();
      } else {
        await supabase.from('fiscal_years').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },

    // Awaited, so the form closes onto a list that already shows the change.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fiscalYearsKey.lists() });
    },
  });
}

export function useDeleteFiscalYearMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('fiscal_years').delete().eq('id', id).throwOnError();
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fiscalYearsKey.lists() });
    },
  });
}
