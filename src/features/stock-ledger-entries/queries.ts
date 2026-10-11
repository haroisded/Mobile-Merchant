import { useQuery } from '@tanstack/react-query';
import type { useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { LEDGER_PAGE, STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type StockLedgerEntry = Tables<'stock_ledger_entries'>;

/** What the Stock Ledger is narrowed by; '' is "any". Dates are "YYYY-MM-DD", `voucher` a document's number. */
type StockLedgerEntriesArgs = { merchantId: string; from: string; to: string; item: string; warehouse: string; voucher: string };

// The only file that knows the table is called `stock_ledger_entries` (.claude/instruction_mds/data-layer.md
// rules 2-3). No mutation: only a posting writes it (private.post_sle), and nobody's policies let them.
const stockLedgerEntriesKey = {
  all: ['stock-ledger-entries'],
  lists: () => [...stockLedgerEntriesKey.all, 'list'],
  list: (args: StockLedgerEntriesArgs) => [...stockLedgerEntriesKey.lists(), args],
};

/** A system's stock movements, newest first, narrowed on the server; LEDGER_PAGE of them at most. */
export function useStockLedgerEntriesQuery(args: StockLedgerEntriesArgs) {
  return useQuery({
    queryKey: stockLedgerEntriesKey.list(args),
    queryFn: async () => {
      let query = supabase.from('stock_ledger_entries').select('*').eq('merchant_id', args.merchantId);
      if (args.from) query = query.gte('posting_date', args.from);
      if (args.to) query = query.lte('posting_date', args.to);
      if (args.item) query = query.eq('item_id', args.item);
      if (args.warehouse) query = query.eq('warehouse_id', args.warehouse);
      if (args.voucher) query = query.eq('voucher_no', args.voucher);
      const { data } = await query.order('posting_date', { ascending: false }).order('id', { ascending: false }).limit(LEDGER_PAGE).throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function invalidateStockLedgerEntries(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: stockLedgerEntriesKey.lists() });
}
