import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { invalidatePermissions } from '../role-permissions/queries';
import type { MemberValues } from './schema';

// ERPNext's User, scoped to one system. The only file that knows the tables are called
// `merchant_members` and `member_roles` (.claude/instruction_mds/data-layer.md rules 2-3).
const membersKey = {
  all: ['members'],
  lists: () => [...membersKey.all, 'list'],
  list: (args: { merchantId: string }) => [...membersKey.lists(), args],
};

/** A system's members, each with their own roles. The owner has no row: they are the Administrator. */
export function useMembersQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: membersKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('merchant_members')
        .select('*, member_roles(role_id)')
        .eq('merchant_id', merchantId)
        .order('email')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export type Member = NonNullable<ReturnType<typeof useMembersQuery>['data']>[number];

/** Invited until an account with that confirmed email exists; then Active, or Disabled. */
export function memberStatus(member: Member) {
  if (!member.enabled) return 'Disabled';
  return member.user_id ? 'Active' : 'Invited';
}

/**
 * Invite a member, or edit one when `memberId` is given — the member and their roles in one transaction
 * (public.save_member, security invoker). The claim trigger attaches the account by email.
 */
export function useSaveMemberMutation({ merchantId, memberId }: { merchantId: string; memberId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: MemberValues) => {
      await supabase.rpc('save_member', { payload: { id: memberId ?? '', merchant_id: merchantId, ...values } }).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: membersKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}

/** Remove a member: their roles and User Permissions go with them, and the system leaves their list. */
export function useDeleteMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('merchant_members').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: membersKey.lists() }), invalidatePermissions(queryClient)]);
    },
  });
}
