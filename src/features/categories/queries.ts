import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { productsKey } from '../products/queries';

export type Category = Tables<'product_categories'>;

// The only file that knows the table is called product_categories (docs/data-layer.md rule 3). Its own
// folder rather than a helper inside products: a separate table with its own policies and its own
// screen (docs/structure.md rule 1).
//
// Every call ends in throwOnError(), so a failure rejects with a real PostgrestError and the screens'
// postgrestError() checks can read its code — see the note in merchants/queries.ts.
export const categoriesKey = {
  all: ['categories'],
  lists: () => [...categoriesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...categoriesKey.lists(), args],
};

export function useCategoriesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: categoriesKey.list({ merchantId }),
    queryFn: async () => {
      // The merchant_id filter SCOPES, it does not protect. An owner of two systems may read the
      // categories of both, so without it one system's form would list the other's. What keeps other
      // owners' rows out is product_categories_select_own_merchant, not this line.
      const { data } = await supabase
        .from('product_categories')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('name')
        .throwOnError();

      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Top-level categories, the only ones a product's Category field offers. */
export function topLevel(categories: Category[]) {
  return categories.filter((category) => category.parent_id === null);
}

/** The subcategories under one category. */
export function childrenOf(categories: Category[], parentId: string) {
  return categories.filter((category) => category.parent_id === parentId);
}

export function useCreateCategoryMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { name: string; parentId: string | null }) => {
      const { data } = await supabase
        .from('product_categories')
        .insert({ merchant_id: merchantId, name: values.name, parent_id: values.parentId })
        .select()
        .single()
        .throwOnError();

      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesKey.all });
    },
  });
}

export function useRenameCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { id: string; name: string }) => {
      await supabase.from('product_categories').update({ name: values.name }).eq('id', values.id).throwOnError();
    },
    onSuccess: async () => {
      // Products too: the list and detail screens show the category's name.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoriesKey.all }),
        queryClient.invalidateQueries({ queryKey: productsKey.all }),
      ]);
    },
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Subcategories go with it through product_categories_parent_fk's cascade. A category or
      // subcategory that a product still points at refuses with 23503 (products_category_fk has no
      // cascade on purpose) — the screen turns that into "move those products first".
      await supabase.from('product_categories').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesKey.all });
    },
  });
}
