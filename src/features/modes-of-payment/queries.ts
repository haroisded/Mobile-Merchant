import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { ModeOfPaymentValues } from './schema';

export type ModeOfPayment = Tables<'modes_of_payment'>;

// The only file that knows the table is called `modes_of_payment` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const modesOfPaymentKey = {
  all: ['modes-of-payment'],
  lists: () => [...modesOfPaymentKey.all, 'list'],
  list: (args: { merchantId: string }) => [...modesOfPaymentKey.lists(), args],
};

/** A system's modes of payment, by name. */
export function useModesOfPaymentQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: modesOfPaymentKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('modes_of_payment').select('*').eq('merchant_id', merchantId).order('mode_of_payment').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

const row = (values: ModeOfPaymentValues) => ({ ...values, default_account: values.default_account || null });

/** Create a mode of payment, or edit one when `modeId` is given. */
export function useSaveModeOfPaymentMutation({ merchantId, modeId }: { merchantId: string; modeId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ModeOfPaymentValues) => {
      if (modeId) {
        await supabase.from('modes_of_payment').update(row(values)).eq('id', modeId).throwOnError();
      } else {
        await supabase.from('modes_of_payment').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: modesOfPaymentKey.lists() });
    },
  });
}

export function useDeleteModeOfPaymentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('modes_of_payment').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: modesOfPaymentKey.lists() });
    },
  });
}
