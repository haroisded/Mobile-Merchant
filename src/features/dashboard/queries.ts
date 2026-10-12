import { useQuery } from '@tanstack/react-query';
import type { useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

// The only file that knows the Dashboard's four functions (supabase/migrations/20261012200010_dashboard.sql;
// .claude/instruction_mds/data-layer.md rules 2-3). All four are security invoker: the caller's own policies
// decide every row, so a figure here is what the same person's Orders, Sell and Stock Balance add up to.
//
// The shell's drawer keeps the Dashboard mounted, so it never remounts to ask again: a posting of this device
// invalidates these (invalidateDashboard), and another register's sales arrive when the screen is focused or
// the app resumes (refetchStaleDashboard, refetchOnWindowFocus) — hence a minute, not the default five.
type Range = { merchantId: string; from: string; to: string };

/** What Top-Selling Items ranks by: the quantity sold in stock units, or the net amount. */
export type TopBy = 'qty' | 'amount';

const dashboardKey = {
  all: ['dashboard'],
  cards: (args: Range) => [...dashboardKey.all, 'cards', args],
  salesByDay: (args: Range) => [...dashboardKey.all, 'sales-by-day', args],
  topSelling: (args: Range & { by: TopBy; group: boolean }) => [...dashboardKey.all, 'top-selling', args],
  stockAlerts: (args: { merchantId: string; limit: number }) => [...dashboardKey.all, 'stock-alerts', args],
};

const LIVE = { staleTime: STALE.MINUTES.ONE, refetchOnWindowFocus: true };

/**
 * The number cards: the period's Sales (Net Total, returns netted), its invoice count and its Gross Profit,
 * and — as things stand now — the open registers with their expected cash, and the items low on stock.
 * `gross_profit` is null for someone who may not read the Stock Ledger, whatever the generated type says.
 */
export function useDashboardCardsQuery({ merchantId, from, to }: Range) {
  return useQuery({
    queryKey: dashboardKey.cards({ merchantId, from, to }),
    queryFn: async () => {
      const { data } = await supabase.rpc('dashboard_cards', { p_merchant: merchantId, p_from: from, p_to: to }).single().throwOnError();
      return data;
    },
    ...LIVE,
  });
}

/** One row a day from `from` to `to`, a day without a sale at zero. */
export function useSalesByDayQuery({ merchantId, from, to }: Range) {
  return useQuery({
    queryKey: dashboardKey.salesByDay({ merchantId, from, to }),
    queryFn: async () => {
      const { data } = await supabase.rpc('sales_by_day', { p_merchant: merchantId, p_from: from, p_to: to }).throwOnError();
      return data;
    },
    ...LIVE,
  });
}

export type SalesDay = NonNullable<ReturnType<typeof useSalesByDayQuery>['data']>[number];

/** The ten best sellers of the period, by Item or by Item Group. `code` is an item's: a group's is null. */
export function useTopSellingQuery({ merchantId, from, to, by, group }: Range & { by: TopBy; group: boolean }) {
  return useQuery({
    queryKey: dashboardKey.topSelling({ merchantId, from, to, by, group }),
    queryFn: async () => {
      const { data } = await supabase
        .rpc('top_selling', { p_merchant: merchantId, p_from: from, p_to: to, p_by: by, p_group: group })
        .throwOnError();
      return data;
    },
    ...LIVE,
  });
}

/** The first `limit` bins out of stock, or at or below their item's Re-order Level — the emptiest first. */
export function useStockAlertsQuery({ merchantId, limit }: { merchantId: string; limit: number }) {
  return useQuery({
    queryKey: dashboardKey.stockAlerts({ merchantId, limit }),
    queryFn: async () => {
      const { data } = await supabase.rpc('stock_alerts', { p_merchant: merchantId, p_limit: limit }).throwOnError();
      return data;
    },
    ...LIVE,
  });
}

type Client = ReturnType<typeof useQueryClient>;

/** What a posting or a session's opening and closing changes here: every figure. */
export function invalidateDashboard(queryClient: Client) {
  return queryClient.invalidateQueries({ queryKey: dashboardKey.all });
}

/** Ask again for what went stale while the Dashboard was not the screen in front. */
export function refetchStaleDashboard(queryClient: Client) {
  return queryClient.refetchQueries({ queryKey: dashboardKey.all, stale: true, type: 'active' });
}
