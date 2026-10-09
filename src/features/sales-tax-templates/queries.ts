import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { taxRow } from './schema';
import type { SalesTaxTemplateValues } from './schema';

// The only file that knows the tables are called `sales_tax_templates` and `sales_tax_template_rows`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const salesTaxTemplatesKey = {
  all: ['sales-tax-templates'],
  lists: () => [...salesTaxTemplatesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...salesTaxTemplatesKey.lists(), args],
};

/**
 * A system's Sales Taxes and Charges Templates (docs.frappe.io/erpnext/sales-taxes-and-charges-template), each
 * with its rows in calculation order. The rows need the template's read; select alone gets the titles.
 */
export function useSalesTaxTemplatesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: salesTaxTemplatesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_tax_templates')
        .select('*, sales_tax_template_rows(*)')
        .eq('merchant_id', merchantId)
        .order('title')
        .order('idx', { referencedTable: 'sales_tax_template_rows' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type SalesTaxTemplate = NonNullable<ReturnType<typeof useSalesTaxTemplatesQuery>['data']>[number];

/** Save a template and its rows in one transaction (public.save_sales_tax_template, security invoker). */
export function useSaveSalesTaxTemplateMutation({ merchantId, templateId }: { merchantId: string; templateId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: SalesTaxTemplateValues) => {
      await supabase
        .rpc('save_sales_tax_template', { payload: { id: templateId ?? '', merchant_id: merchantId, ...values, rows: values.rows.map(taxRow) } })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesTaxTemplatesKey.lists() });
    },
  });
}

export function useDeleteSalesTaxTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('sales_tax_templates').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesTaxTemplatesKey.lists() });
    },
  });
}
