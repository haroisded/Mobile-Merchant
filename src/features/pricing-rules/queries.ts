import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { PricingRuleValues } from './schema';

// The only file that knows the tables are called `pricing_rules` and `pricing_rule_targets`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const pricingRulesKey = {
  all: ['pricing-rules'],
  lists: () => [...pricingRulesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...pricingRulesKey.lists(), args],
};

/**
 * A system's Pricing Rules (docs.frappe.io/erpnext/pricing-rule), each with what it applies on, oldest
 * first — the order apply.ts breaks a tie in. The Register reads them too: a cashier holds Read.
 */
export function usePricingRulesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: pricingRulesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pricing_rules')
        .select('*, pricing_rule_targets(*)')
        .eq('merchant_id', merchantId)
        .order('created_at')
        .order('idx', { referencedTable: 'pricing_rule_targets' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type PricingRule = NonNullable<ReturnType<typeof usePricingRulesQuery>['data']>[number];

/** The column each Apply On's rows fill, and the one each result is kept in. */
const TARGET_COLUMN = { 'Item Code': 'item_id', 'Item Group': 'item_group_id', Brand: 'brand_id' } as const;
const RESULT_COLUMN = { Rate: 'rate', 'Discount Percentage': 'discount_percentage', 'Discount Amount': 'discount_amount' } as const;

/** The target a saved row names, whichever kind it is. */
export const targetOf = (row: PricingRule['pricing_rule_targets'][number]) => row.item_id ?? row.item_group_id ?? row.brand_id ?? '';

/** What the rule gives, as its form's one field holds it. */
export const resultOf = (rule: PricingRule) => (rule.rate_or_discount === 'Rate' ? rule.rate : rule.rate_or_discount === 'Discount Amount' ? rule.discount_amount : rule.discount_percentage);

/** Save a rule and its rows in one transaction (public.save_pricing_rule, security invoker). */
export function useSavePricingRuleMutation({ merchantId, ruleId }: { merchantId: string; ruleId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targets, value, ...values }: PricingRuleValues) => {
      await supabase
        .rpc('save_pricing_rule', {
          payload: {
            id: ruleId ?? '',
            merchant_id: merchantId,
            title: values.title,
            apply_on: values.apply_on,
            min_qty: Number(values.min_qty || 0),
            max_qty: Number(values.max_qty || 0),
            min_amt: Number(values.min_amt || 0),
            max_amt: Number(values.max_amt || 0),
            valid_from: values.valid_from || null,
            valid_upto: values.valid_upto || null,
            for_price_list: values.for_price_list || null,
            priority: Number(values.priority),
            disable: values.disable,
            rate_or_discount: values.rate_or_discount,
            // The two results the rule does not give go back to 0.
            rate: 0,
            discount_percentage: 0,
            discount_amount: 0,
            [RESULT_COLUMN[values.rate_or_discount]]: Number(value),
            targets: targets.map((row) => ({ [TARGET_COLUMN[values.apply_on]]: row.target })),
          },
        })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pricingRulesKey.lists() });
    },
  });
}

/** Its rows go with it; refused with 23503 once a sale's line was priced by it. */
export function useDeletePricingRuleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('pricing_rules').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pricingRulesKey.lists() });
    },
  });
}
