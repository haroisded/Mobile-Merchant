import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidatePermissions } from '../role-permissions/queries';
import type { RoleProfileValues } from './schema';

// The only file that knows the tables are called `role_profiles` and `role_profile_roles`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const roleProfilesKey = {
  all: ['role-profiles'],
  lists: () => [...roleProfilesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...roleProfilesKey.lists(), args],
};

/** A system's role profiles (ERPNext: a template of roles assigned together), each with its roles. */
export function useRoleProfilesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: roleProfilesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('role_profiles')
        .select('*, role_profile_roles(role_id)')
        .eq('merchant_id', merchantId)
        .order('role_profile_name')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type RoleProfile = NonNullable<ReturnType<typeof useRoleProfilesQuery>['data']>[number];

/** Save a profile and its roles in one transaction (public.save_role_profile, security invoker). */
export function useSaveRoleProfileMutation({ merchantId, roleProfileId }: { merchantId: string; roleProfileId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RoleProfileValues) => {
      await supabase
        .rpc('save_role_profile', { payload: { id: roleProfileId ?? '', merchant_id: merchantId, ...values } })
        .throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: roleProfilesKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}

export function useDeleteRoleProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('role_profiles').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: roleProfilesKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}
