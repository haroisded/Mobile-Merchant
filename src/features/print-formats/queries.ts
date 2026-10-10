import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { PrintFormatValues } from './schema';

export type PrintFormat = Tables<'print_formats'>;

// The only file that knows the table is called `print_formats` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const printFormatsKey = {
  all: ['print-formats'],
  lists: () => [...printFormatsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...printFormatsKey.lists(), args],
};

/** A system's print formats, by name. */
export function usePrintFormatsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: printFormatsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('print_formats').select('*').eq('merchant_id', merchantId).order('print_format_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a print format, or edit one when `formatId` is given. */
export function useSavePrintFormatMutation({ merchantId, formatId }: { merchantId: string; formatId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: PrintFormatValues) => {
      if (formatId) {
        await supabase.from('print_formats').update(values).eq('id', formatId).throwOnError();
      } else {
        await supabase.from('print_formats').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printFormatsKey.lists() });
    },
  });
}

export function useDeletePrintFormatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('print_formats').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printFormatsKey.lists() });
    },
  });
}
