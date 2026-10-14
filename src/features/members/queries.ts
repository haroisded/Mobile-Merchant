import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import { invalidatePosProfiles } from '../pos-profiles/queries';
import { invalidatePermissions } from '../role-permissions/queries';
import type { MemberValues } from './schema';

// ERPNext's User, scoped to one system: someone the owner let in through an access code
// (public.decide_access_request). The only file that knows the tables are called `merchant_members` and
// `member_roles` (.claude/instruction_mds/data-layer.md rules 2-3).
const membersKey = {
  all: ['members'],
  lists: () => [...membersKey.all, 'list'],
  list: (args: { merchantId: string }) => [...membersKey.lists(), args],
  owned: () => [...membersKey.all, 'owned'],
};

export const invalidateMembers = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries({ queryKey: membersKey.all });

/** A system's members, each with their own roles. The owner has no row: they are the Administrator. */
export function useMembersQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: membersKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('merchant_members')
        .select('*, member_roles(role_id)')
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
 * owner, not left to RLS: a role with User may read the members of a system it does not own.
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

export const memberStatus = (member: Member) => (member.enabled ? 'Active' : 'Disabled');

/** Edit a member and their roles in one transaction (public.save_member, security invoker). */
export function useSaveMemberMutation({ merchantId, memberId }: { merchantId: string; memberId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: MemberValues) => {
      await supabase.rpc('save_member', { payload: { id: memberId, merchant_id: merchantId, ...values } }).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateMembers(queryClient), invalidatePermissions(queryClient)]);
    },
  });
}

/**
 * Remove a member: their roles, User Permissions and places on POS Profiles go with them, they are told, and the
 * system leaves their list.
 */
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
