import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { productsKey } from '../products/queries';

export type TaxClass = Tables<'tax_classes'>;

// Every call ends in throwOnError(), so a failure rejects with a real PostgrestError and the screens'
// postgrestError() checks can read its code — see the note in merchants/queries.ts.
export const taxClassesKey = {
  all: ['tax-classes'],
  lists: () => [...taxClassesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...taxClassesKey.lists(), args],
};

/**
 * Presets offered in the create dialog. Suggestions the merchant taps, not rows seeded into the table:
 * a trigger that writes rows on merchant creation is the thing instruction_mds/tenancy.md §5 refuses, and a
 * merchant outside the Philippines should not start with a VAT class they have to delete.
 */
export const TAX_CLASS_PRESETS = [
  { name: 'Standard VAT 12%', rate: '12' },
  { name: 'Zero-rated', rate: '0' },
  { name: 'VAT-exempt', rate: '0' },
] as const;

/** "Standard VAT 12% · 12%" — the picker's label. */
export function taxClassLabel(taxClass: TaxClass) {
  return `${taxClass.name} · ${taxClass.rate}%`;
}

export function useTaxClassesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: taxClassesKey.list({ merchantId }),
    queryFn: async () => {
      // Scoping to this system, not security — see the note in categories/queries.ts.
      const { data } = await supabase
        .from('tax_classes')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('name')
        .throwOnError();

      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useCreateTaxClassMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { name: string; rate: number }) => {
      const { data } = await supabase
        .from('tax_classes')
        .insert({ merchant_id: merchantId, name: values.name, rate: values.rate })
        .select()
        .single()
        .throwOnError();

      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxClassesKey.all });
    },
  });
}

export function useDeleteTaxClassMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Never refused for being in use: products_tax_class_fk is `on delete set null (tax_class_id)`,
      // so every product that had this class keeps its row and loses only the class.
      await supabase.from('tax_classes').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      // Products too: a product's detail and form show the class that just went.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taxClassesKey.all }),
        queryClient.invalidateQueries({ queryKey: productsKey.all }),
      ]);
    },
  });
}
