import { useQuery } from '@tanstack/react-query';
import type { useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type GlEntry = Tables<'gl_entries'>;

/** What the General Ledger is narrowed by; '' is "any". Dates are "YYYY-MM-DD", `voucher` a document's number. */
type GlEntriesArgs = { merchantId: string; from: string; to: string; account: string; voucher: string };

// The only file that knows the table is called `gl_entries` (.claude/instruction_mds/data-layer.md rules
// 2-3). No mutation: only a posting writes it (private.post_gl), and nobody's policies let them.
const glEntriesKey = {
  all: ['gl-entries'],
  lists: () => [...glEntriesKey.all, 'list'],
  list: (args: GlEntriesArgs) => [...glEntriesKey.lists(), args],
};

/** A system's General Ledger entries, newest first, narrowed on the server; LEDGER_PAGE of them at most. */
export function useGlEntriesQuery(args: GlEntriesArgs) {
  return useQuery({
    queryKey: glEntriesKey.list(args),
    queryFn: async () => {
      let query = supabase.from('gl_entries').select('*').eq('merchant_id', args.merchantId);
      if (args.from) query = query.gte('posting_date', args.from);
      if (args.to) query = query.lte('posting_date', args.to);
      if (args.account) query = query.eq('account_id', args.account);
      if (args.voucher) query = query.eq('voucher_no', args.voucher);
      const { data } = await query.order('posting_date', { ascending: false }).order('id', { ascending: false }).limit(LEDGER_PAGE).throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function invalidateGlEntries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: glEntriesKey.lists() });
}
