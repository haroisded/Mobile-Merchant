import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { displayDate } from '../../lib/dates';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { TaxRuleValues } from './schema';

export type TaxRule = Tables<'tax_rules'>;

/** "1 Jan 2026 to 30 Jun 2026", "From 1 Jul 2026", or "Always". */
export const ruleDates = (rule: Pick<TaxRule, 'from_date' | 'to_date'>) => {
  if (rule.from_date && rule.to_date) return `${displayDate(rule.from_date)} to ${displayDate(rule.to_date)}`;
  if (rule.from_date) return `From ${displayDate(rule.from_date)}`;
  if (rule.to_date) return `Until ${displayDate(rule.to_date)}`;
  return 'Always';
};

// The only file that knows the table is called `tax_rules` (.claude/instruction_mds/data-layer.md rules 2-3).
const taxRulesKey = {
  all: ['tax-rules'],
  lists: () => [...taxRulesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...taxRulesKey.lists(), args],
};

/** A system's Tax Rules, oldest first — the order resolve.ts breaks a tie in. */
export function useTaxRulesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: taxRulesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('tax_rules').select('*').eq('merchant_id', merchantId).order('created_at').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

const row = (values: TaxRuleValues) => ({
  sales_tax_template_id: values.sales_tax_template_id,
  tax_category_id: values.tax_category_id || null,
  item_group_id: values.item_group_id || null,
  from_date: values.from_date || null,
  to_date: values.to_date || null,
  priority: Number(values.priority),
});

/** Create a rule, or edit one when `ruleId` is given. Refused with 23P01 when it conflicts (tax_rules_no_conflict). */
export function useSaveTaxRuleMutation({ merchantId, ruleId }: { merchantId: string; ruleId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: TaxRuleValues) => {
      if (ruleId) {
        await supabase.from('tax_rules').update(row(values)).eq('id', ruleId).throwOnError();
      } else {
        await supabase.from('tax_rules').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxRulesKey.lists() });
    },
  });
}

export function useDeleteTaxRuleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('tax_rules').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxRulesKey.lists() });
    },
  });
}
