import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import type { Override } from '../permissions/access';
import { invalidatePosProfiles } from '../pos-profiles/queries';
import { invalidatePermissions } from '../role-permissions/queries';

// A system's employees: someone the owner let in through an access code (public.decide_access_request), with one
// role and their own exceptions to it. The only file that knows the tables are called `merchant_members` and
// `member_overrides` (.claude/instruction_mds/data-layer.md rules 2-3).
const membersKey = {
  all: ['members'],
  lists: () => [...membersKey.all, 'list'],
  list: (args: { merchantId: string }) => [...membersKey.lists(), args],
  owned: () => [...membersKey.all, 'owned'],
};

export const invalidateMembers = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries({ queryKey: membersKey.all });

/**
 * A system's employees by name, each with their role and their exceptions to it. The owner has no row: they hold
 * every permission. The exceptions are the owner's to read; a POS Profile's manager, who looks employees up for its
 * users, gets them empty.
 */
export function useMembersQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: membersKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('merchant_members')
        .select('*, member_overrides(permission, allowed)')
        .eq('merchant_id', merchantId)
        .order('full_name')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type Member = NonNullable<ReturnType<typeof useMembersQuery>['data']>[number];

/**
 * Everyone let into the caller's own systems, newest first — the Access Codes page's Members tab. Filtered on the
 * owner, not left to RLS: a POS Profile's manager may look up the employees of a system they do not own.
 */
export function useOwnedMembersQuery() {
  const session = useSession();

  return useQuery({
    queryKey: membersKey.owned(),
    queryFn: async () => {
      const { data } = await supabase
        .from('merchant_members')
        .select('*, merchants!inner(name, owner_id)')
        .eq('merchants.owner_id', session?.user.id ?? '')
        .order('created_at', { ascending: false })
        .throwOnError();
      return data;
    },
    enabled: !!session,
    staleTime: STALE.MINUTES.ONE,
  });
}

export type OwnedMember = NonNullable<ReturnType<typeof useOwnedMembersQuery>['data']>[number];

/** The name a member goes by: the name on their account when they asked to join, else their email. */
export const memberName = (member: { full_name: string | null; email: string | null }) => member.full_name || member.email || 'Member';

/**
 * An employee's role and their exceptions to it, replaced as a set (public.save_member_access, security invoker).
 * No role: the argument is left out — the generated types forbid null.
 */
export function useSaveMemberAccessMutation({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, overrides }: { roleId: string | null; overrides: Override[] }) => {
      await (
        roleId
          ? supabase.rpc('save_member_access', { p_member: memberId, p_overrides: overrides, p_role: roleId })
          : supabase.rpc('save_member_access', { p_member: memberId, p_overrides: overrides })
      ).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateMembers(queryClient), invalidatePermissions(queryClient)]);
    },
  });
}

/** Revoke a member: their exceptions and places on POS Profiles go with them, they are told, and the system leaves their list. */
export function useDeleteMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('merchant_members').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateMembers(queryClient), invalidatePermissions(queryClient), invalidatePosProfiles(queryClient)]);
    },
  });
}
