import { useQuery } from '@tanstack/react-query';
import type { useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

/** The Stock Balance of one item in one warehouse: quantity, valuation rate and value. */
export type Bin = Tables<'bins'>;

/** What the Stock Balance is narrowed by; '' is "any". */
type BinsArgs = { merchantId: string; item: string; warehouse: string };

// The only file that knows the table is called `bins` (.claude/instruction_mds/data-layer.md rules 2-3).
// No mutation: only a posting writes it (private.post_sle), and nobody's policies let them.
const binsKey = {
  all: ['bins'],
  lists: () => [...binsKey.all, 'list'],
  list: (args: BinsArgs) => [...binsKey.lists(), args],
};

/**
 * A system's stock balances, narrowed on the server.
 *
 * ponytail: one request, so PostgREST's 1,000-row cap is the ceiling — items times warehouses. Past it the
 * report needs paging, and its total a sum the database works out.
 */
export function useBinsQuery(args: BinsArgs) {
  return useQuery({
    queryKey: binsKey.list(args),
    queryFn: async () => {
      let query = supabase.from('bins').select('*').eq('merchant_id', args.merchantId);
      if (args.item) query = query.eq('item_id', args.item);
      if (args.warehouse) query = query.eq('warehouse_id', args.warehouse);
      const { data } = await query.throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function invalidateBins(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: binsKey.lists() });
}
