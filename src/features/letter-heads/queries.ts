import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { LetterHeadValues } from './schema';

export type LetterHead = Tables<'letter_heads'>;

// The only file that knows the table is called `letter_heads` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const letterHeadsKey = {
  all: ['letter-heads'],
  lists: () => [...letterHeadsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...letterHeadsKey.lists(), args],
};

/** A system's letter heads, by name. */
export function useLetterHeadsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: letterHeadsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('letter_heads').select('*').eq('merchant_id', merchantId).order('letter_head_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a letter head, or edit one when `letterHeadId` is given. */
export function useSaveLetterHeadMutation({ merchantId, letterHeadId }: { merchantId: string; letterHeadId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: LetterHeadValues) => {
      if (letterHeadId) {
        await supabase.from('letter_heads').update(values).eq('id', letterHeadId).throwOnError();
      } else {
        await supabase.from('letter_heads').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: letterHeadsKey.lists() });
    },
  });
}

export function useDeleteLetterHeadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('letter_heads').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: letterHeadsKey.lists() });
    },
  });
}
