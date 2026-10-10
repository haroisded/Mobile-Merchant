import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { seriesLines } from './schema';
import type { NamingSeriesValues, SeriesCounterValues } from './schema';

export type NamingSeries = Tables<'naming_series'>;

// The only file that knows the table is called `naming_series`, and the two functions beside it
// (.claude/instruction_mds/data-layer.md rules 2-3). One row per document that takes a series, made by the
// merchants_seed_94_naming trigger.
const namingSeriesKey = {
  all: ['naming-series'],
  list: (args: { merchantId: string }) => [...namingSeriesKey.all, 'list', args],
  preview: (args: { merchantId: string }) => [...namingSeriesKey.all, 'preview', args],
};

/** A system's documents and the series each may be numbered by, the default first. */
export function useNamingSeriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: namingSeriesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('naming_series').select('*').eq('merchant_id', merchantId).order('document_type').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * Every series as it resolves today: the prefix its counter is kept under, the counter's current value and the
 * name the next document would take (public.naming_series_preview — the parser lives in the database, which
 * hands out the numbers). Always stale: it follows the date, the fiscal years and every document numbered, and
 * none of those invalidate it, so each visit asks again.
 */
export function useSeriesPreviewQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: namingSeriesKey.preview({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.rpc('naming_series_preview', { p_merchant: merchantId }).throwOnError();
      return data;
    },
    staleTime: STALE.ALWAYS,
  });
}

export type SeriesPreview = NonNullable<ReturnType<typeof useSeriesPreviewQuery>['data']>[number];

/** Save one document's series and whether the person must always pick one. */
export function useUpdateNamingSeriesMutation({ merchantId, documentType }: { merchantId: string; documentType: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: NamingSeriesValues) => {
      await supabase
        .from('naming_series')
        .update({ options: seriesLines(values.series), user_must_select: values.user_must_select })
        .eq('merchant_id', merchantId)
        .eq('document_type', documentType)
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: namingSeriesKey.all });
    },
  });
}

/** Update Series: set the number a series last gave out (public.update_series_counter, security invoker). */
export function useUpdateSeriesCounterMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: SeriesCounterValues) => {
      await supabase
        .rpc('update_series_counter', { p_merchant: merchantId, p_series: values.series, p_current: Number(values.current_value) })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: namingSeriesKey.preview({ merchantId }) });
    },
  });
}
