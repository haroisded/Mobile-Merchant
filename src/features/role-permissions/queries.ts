import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type RolePermission = Tables<'role_permissions'>;

/**
 * The Role Permissions Manager's form: one doctype's rules, one per role — what save_role_permissions takes.
 * No Zod: every field is a checkbox, so there is nothing to reject (.claude/instruction_mds/data-layer.md §3).
 */
export type RulesValues = { rules: Pick<RolePermission, 'role_id' | 'can_select' | 'can_read' | 'can_write' | 'can_create' | 'can_delete'>[] };

/** ERPNext's permission types this app enforces; submit, cancel and print arrive with POS Invoice. */
export type Ptype = 'select' | 'read' | 'write' | 'create' | 'delete';

export type DoctypePermissions = Record<Ptype, boolean>;

/** What public.my_permissions returns: who owns the system, and what the caller may do in it. */
export type Permissions = {
  is_owner: boolean;
  owner_email: string | null;
  owner_name: string | null;
  perms: Record<string, DoctypePermissions>;
};

// The only file that knows the table is called `role_permissions` (.claude/instruction_mds/data-layer.md
// rules 2-3). Keys most generic first; args in an object (rule 7).
const permissionsKey = {
  all: ['permissions'],
  detail: (args: { merchantId: string }) => [...permissionsKey.all, args],
};

const rolePermissionsKey = {
  all: ['role-permissions'],
  lists: () => [...rolePermissionsKey.all, 'list'],
  list: (args: { merchantId: string; doctype: string }) => [...rolePermissionsKey.lists(), args],
};

/**
 * What the signed-in person may do in one system, so a screen hides what RLS would refuse. The policies
 * stay the boundary (private.permitted_merchant_ids); this mirrors them. The owner may do everything.
 */
export function usePermissions({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: permissionsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.rpc('my_permissions', { p_merchant: merchantId }).throwOnError();
      // SAFETY: public.my_permissions builds exactly this object with jsonb_build_object, or returns null
      // for a system the caller cannot enter; the generated types can only say Json.
      return data as Permissions | null;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Whether `permissions` allow `ptype` on `doctype`. False while they load: a control appears, never vanishes. */
export function can(permissions: Permissions | null | undefined, doctype: string, ptype: Ptype) {
  if (!permissions) return false;
  if (permissions.is_owner) return true;
  return permissions.perms[doctype]?.[ptype] ?? false;
}

/** The Role Permissions Manager's rows for one doctype. */
export function useRolePermissionsQuery({ merchantId, doctype }: { merchantId: string; doctype: string }) {
  return useQuery({
    queryKey: rolePermissionsKey.list({ merchantId, doctype }),
    queryFn: async () => {
      const { data } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('doctype', doctype)
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** Save one doctype's rules as a set (public.save_role_permissions: removed roles go, the rest upsert). */
export function useSaveRolePermissionsMutation({ merchantId, doctype }: { merchantId: string; doctype: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RulesValues) => {
      await supabase.rpc('save_role_permissions', { p_merchant: merchantId, p_doctype: doctype, p_rows: values.rules }).throwOnError();
    },
    // The caller's own permissions may have changed with the matrix.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rolePermissionsKey.lists() }),
        queryClient.invalidateQueries({ queryKey: permissionsKey.all }),
      ]);
    },
  });
}

/** After a change to roles, profiles or members: what anyone may do could have changed with it. */
export function invalidatePermissions(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: permissionsKey.all });
}
