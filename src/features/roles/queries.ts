import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidateAccountsSettings } from '../accounts-settings/queries';
import { invalidateMembers } from '../members/queries';
import { invalidatePermissions } from '../role-permissions/queries';
import type { RoleValues } from './schema';

export type Role = Tables<'roles'>;

// The only file that knows the tables are called `roles` and `role_grants` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const rolesKey = {
  all: ['roles'],
  lists: () => [...rolesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...rolesKey.lists(), args],
};

const invalidateRoles = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries({ queryKey: rolesKey.all });

/**
 * A system's roles by name, each with its permissions. The permissions are the owner's to read: anyone else who may
 * look roles up (Accounts Settings' frozen-period role) gets them empty.
 */
export function useRolesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: rolesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('roles').select('*, role_grants(permission)').eq('merchant_id', merchantId).order('role_name').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type RoleWithGrants = NonNullable<ReturnType<typeof useRolesQuery>['data']>[number];

/** A role's permission keys. */
export const roleKeys = (role: { role_grants: { permission: string }[] } | undefined) => role?.role_grants.map((grant) => grant.permission) ?? [];

/**
 * Create a role, or edit one when `roleId` is given: its name, colour and permissions, and who holds it — in one
 * transaction (public.save_role, security invoker). Answers the role's id.
 */
export function useSaveRoleMutation({ merchantId, roleId }: { merchantId: string; roleId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RoleValues) => {
      const { data } = await supabase.rpc('save_role', { payload: { id: roleId ?? null, merchant_id: merchantId, ...values } }).throwOnError();
      return data;
    },
    onSuccess: async () => {
      await Promise.all([invalidateRoles(queryClient), invalidateMembers(queryClient), invalidatePermissions(queryClient)]);
    },
  });
}

/** Delete a role. Whoever held it keeps their seat with no role; Accounts Settings' frozen-period role empties. */
export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('roles').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateRoles(queryClient),
        invalidateMembers(queryClient),
        invalidatePermissions(queryClient),
        invalidateAccountsSettings(queryClient),
      ]);
    },
  });
}
