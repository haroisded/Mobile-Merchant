import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidatePermissions } from '../role-permissions/queries';
import type { RoleValues } from './schema';

export type Role = Tables<'roles'>;

/** ERPNext's implicit role: every member holds it, so it is never assigned and never listed to pick. */
export const ALL_ROLE = 'All';

// The only file that knows the table is called `roles` (.claude/instruction_mds/data-layer.md rules 2-3).
const rolesKey = {
  all: ['roles'],
  lists: () => [...rolesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...rolesKey.lists(), args],
};

/** A system's roles: the standard ones first, then the custom ones, by name. */
export function useRolesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: rolesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('roles')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('is_standard', { ascending: false })
        .order('role_name')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Create a custom role, or edit one when `roleId` is given. A standard role's name is the database's to keep. */
export function useSaveRoleMutation({ merchantId, roleId }: { merchantId: string; roleId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RoleValues) => {
      if (roleId) {
        await supabase.from('roles').update(values).eq('id', roleId).throwOnError();
      } else {
        await supabase.from('roles').insert({ merchant_id: merchantId, ...values }).throwOnError();
      }
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: rolesKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('roles').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: rolesKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}
