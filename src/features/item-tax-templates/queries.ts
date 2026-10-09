import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { ItemTaxTemplateValues } from './schema';

// The only file that knows the tables are called `item_tax_templates` and `item_tax_template_rows`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const itemTaxTemplatesKey = {
  all: ['item-tax-templates'],
  lists: () => [...itemTaxTemplatesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...itemTaxTemplatesKey.lists(), args],
};

/**
 * A system's Item Tax Templates (docs.frappe.io/erpnext/item-tax-template), each with its rates in row order.
 * The rows need Item Tax Template read; a caller with only select gets the titles and no rows.
 */
export function useItemTaxTemplatesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: itemTaxTemplatesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('item_tax_templates')
        .select('*, item_tax_template_rows(*)')
        .eq('merchant_id', merchantId)
        .order('title')
        .order('idx', { referencedTable: 'item_tax_template_rows' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type ItemTaxTemplate = NonNullable<ReturnType<typeof useItemTaxTemplatesQuery>['data']>[number];

/** An item's rates by tax account, as calculate.ts takes them. Not Applicable counts as 0. */
export const itemTaxRates = (template: ItemTaxTemplate) =>
  new Map(template.item_tax_template_rows.map((row) => [row.account, row.not_applicable ? 0 : row.tax_rate]));

/** Save a template and its rows in one transaction (public.save_item_tax_template, security invoker). */
export function useSaveItemTaxTemplateMutation({ merchantId, templateId }: { merchantId: string; templateId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ItemTaxTemplateValues) => {
      const rows = values.rows.map((row) => ({ ...row, tax_rate: Number(row.tax_rate || 0) }));
      await supabase
        .rpc('save_item_tax_template', { payload: { id: templateId ?? '', merchant_id: merchantId, ...values, rows } })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemTaxTemplatesKey.lists() });
    },
  });
}

export function useDeleteItemTaxTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('item_tax_templates').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemTaxTemplatesKey.lists() });
    },
  });
}
