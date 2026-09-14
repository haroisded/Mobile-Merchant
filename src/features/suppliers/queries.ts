import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { productsKey } from '../products/queries';

export type Supplier = Tables<'suppliers'>;

// A resource of its own — the Suppliers screen a POS eventually grows reads this same table — so it
// gets its folder now, even though the product form's picker is its only caller today.
//
// Every call ends in throwOnError(), so a failure rejects with a real PostgrestError — see the note in
// merchants/queries.ts.
export const suppliersKey = {
  all: ['suppliers'],
  lists: () => [...suppliersKey.all, 'list'],
  list: (args: { merchantId: string }) => [...suppliersKey.lists(), args],
};

export function useSuppliersQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: suppliersKey.list({ merchantId }),
    queryFn: async () => {
      // Scoping to this system, not security — see the note in categories/queries.ts.
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('name')
        .throwOnError();

      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useCreateSupplierMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { name: string; contact: string | null }) => {
      const { data } = await supabase
        .from('suppliers')
        .insert({ merchant_id: merchantId, name: values.name, contact: values.contact })
        .select()
        .single()
        .throwOnError();

      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: suppliersKey.all });
    },
  });
}

export function useDeleteSupplierMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Never refused for being in use: products_supplier_fk is `on delete set null (supplier_id)`,
      // so every product that had this supplier keeps its row and loses only the supplier.
      await supabase.from('suppliers').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: suppliersKey.all }),
        queryClient.invalidateQueries({ queryKey: productsKey.all }),
      ]);
    },
  });
}
