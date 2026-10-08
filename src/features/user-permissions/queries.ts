import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidatePermissions } from '../role-permissions/queries';
import type { UserPermissionValues } from './schema';

export type UserPermission = Tables<'user_permissions'>;

// The only file that knows the table is called `user_permissions` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const userPermissionsKey = {
  all: ['user-permissions'],
  lists: () => [...userPermissionsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...userPermissionsKey.lists(), args],
};

/** A system's User Permissions: which records of a doctype a member is restricted to. */
export function useUserPermissionsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: userPermissionsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('created_at')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** The row to write: Applicable For only when the restriction is not for every document type. */
const row = (values: UserPermissionValues) => ({
  ...values,
  applicable_for: values.apply_to_all_doctypes ? null : values.applicable_for,
});

export function useSaveUserPermissionMutation({ merchantId, userPermissionId }: { merchantId: string; userPermissionId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: UserPermissionValues) => {
      if (userPermissionId) {
        await supabase.from('user_permissions').update(row(values)).eq('id', userPermissionId).throwOnError();
      } else {
        await supabase.from('user_permissions').insert({ merchant_id: merchantId, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: userPermissionsKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}

export function useDeleteUserPermissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('user_permissions').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: userPermissionsKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}
