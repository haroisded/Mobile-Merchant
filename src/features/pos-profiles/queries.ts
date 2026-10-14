import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { PosProfileValues } from './schema';

// The only file that knows the tables are called `pos_profiles`, `pos_profile_users`, `pos_profile_payments`
// and `pos_profile_item_groups` (.claude/instruction_mds/data-layer.md rules 2-3).
const posProfilesKey = {
  all: ['pos-profiles'],
  lists: () => [...posProfilesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...posProfilesKey.lists(), args],
  users: () => [...posProfilesKey.all, 'users'],
};

export const invalidatePosProfiles = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: posProfilesKey.all });

/**
 * A system's POS Profiles (docs.frappe.io/erpnext/pos-profile), each with its users, payment methods and item
 * groups in their saved order.
 */
export function usePosProfilesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: posProfilesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('pos_profiles')
        .select('*, pos_profile_users(*), pos_profile_payments(*), pos_profile_item_groups(*)')
        .eq('merchant_id', merchantId)
        .order('pos_profile_name')
        .order('idx', { referencedTable: 'pos_profile_users' })
        .order('idx', { referencedTable: 'pos_profile_payments' })
        .order('idx', { referencedTable: 'pos_profile_item_groups' })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type PosProfile = NonNullable<ReturnType<typeof usePosProfilesQuery>['data']>[number];

/**
 * Every profile's user rows the caller can see, with the profile's name — so revoking someone can say which profiles
 * it leaves with nobody listed, and so open to everyone (private.pos_profile_usable).
 */
export function usePosProfileUsersQuery() {
  return useQuery({
    queryKey: posProfilesKey.users(),
    queryFn: async () => {
      const { data } = await supabase.from('pos_profile_users').select('member_id, pos_profile_id, pos_profiles(pos_profile_name)').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Save a profile and its three child tables in one transaction (public.save_pos_profile, security invoker). */
export function useSavePosProfileMutation({ merchantId, profileId }: { merchantId: string; profileId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: PosProfileValues) => {
      await supabase
        .rpc('save_pos_profile', { payload: { id: profileId ?? '', merchant_id: merchantId, ...values, write_off_limit: Number(values.write_off_limit || 0) } })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posProfilesKey.lists() });
    },
  });
}

export function useDeletePosProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('pos_profiles').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posProfilesKey.lists() });
    },
  });
}
