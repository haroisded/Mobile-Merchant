import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { ItemGroupValues } from './schema';

// The only file that knows the tables are called `item_groups` and `item_group_taxes`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const itemGroupsKey = {
  all: ['item-groups'],
  lists: () => [...itemGroupsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...itemGroupsKey.lists(), args],
};

/**
 * A system's whole Item Group tree, flat, each with its Item Tax rows in order; the screens walk it with
 * src/lib/tree.ts. The rows need Item Group read; a caller with only select gets the names and no rows.
 */
export function useItemGroupsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: itemGroupsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('item_groups')
        .select('*, item_group_taxes(*)')
        .eq('merchant_id', merchantId)
        .order('item_group_name')
        .order('idx', { referencedTable: 'item_group_taxes' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type ItemGroup = NonNullable<ReturnType<typeof useItemGroupsQuery>['data']>[number];

/** Every item group as picker options, groups included — a Tax Rule or Stock Settings may name either. None first. */
export const itemGroupOptions = (groups: ItemGroup[]) => [
  { value: '', label: 'None' },
  ...groups.map((group) => ({ value: group.id, label: group.item_group_name, hint: group.is_group ? 'Group' : undefined })),
];

/** Save a group and its Item Tax rows in one transaction (public.save_item_group, security invoker). */
export function useSaveItemGroupMutation({ merchantId, groupId }: { merchantId: string; groupId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ItemGroupValues) => {
      await supabase.rpc('save_item_group', { payload: { id: groupId ?? '', merchant_id: merchantId, ...values } }).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemGroupsKey.lists() });
    },
  });
}

/** Refused with 23503 while groups sit under it, or a tax rule or Stock Settings names it. */
export function useDeleteItemGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('item_groups').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemGroupsKey.lists() });
    },
  });
}
