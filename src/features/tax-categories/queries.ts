import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { TaxCategoryValues } from './schema';

export type TaxCategory = Tables<'tax_categories'>;

// The only file that knows the table is called `tax_categories` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const taxCategoriesKey = {
  all: ['tax-categories'],
  lists: () => [...taxCategoriesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...taxCategoriesKey.lists(), args],
};

/** A system's tax categories (docs.frappe.io/erpnext/tax-category), by title. */
export function useTaxCategoriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: taxCategoriesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('tax_categories').select('*').eq('merchant_id', merchantId).order('title').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a tax category, or edit one when `categoryId` is given. */
export function useSaveTaxCategoryMutation({ merchantId, categoryId }: { merchantId: string; categoryId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: TaxCategoryValues) => {
      if (categoryId) {
        await supabase.from('tax_categories').update(values).eq('id', categoryId).throwOnError();
      } else {
        await supabase.from('tax_categories').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxCategoriesKey.lists() });
    },
  });
}

/** Refused with 23503 while a Sales Taxes and Charges Template names it (sales_tax_templates_category_fk). */
export function useDeleteTaxCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('tax_categories').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxCategoriesKey.lists() });
    },
  });
}
