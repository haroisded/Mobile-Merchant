import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import type { ClaimStatus } from '../access-codes/code';
import { invalidateAccessCodes } from '../access-codes/queries';
import { invalidateMembers } from '../members/queries';

// Requests to join a system: made by claim_access_code, decided by decide_access_request — both security definer, and
// access_requests has no write policy. The only file that knows the table is called `access_requests`
// (.claude/instruction_mds/data-layer.md rules 2-3).
const accessRequestsKey = {
  all: ['access-requests'],
  lists: () => [...accessRequestsKey.all, 'list'],
  mine: () => [...accessRequestsKey.all, 'mine'],
};

export const invalidateAccessRequests = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: accessRequestsKey.all });

/**
 * The requests to the caller's systems, newest first. access_requests_select also shows people their own requests to
 * other systems, and nobody can request their own system (own_system) — so leaving out the caller's own rows leaves
 * exactly the requests made to them.
 */
export function useAccessRequestsQuery() {
  const session = useSession();

  return useQuery({
    queryKey: accessRequestsKey.lists(),
    queryFn: async () => {
      const { data } = await supabase
        .from('access_requests')
        .select('*')
        .neq('user_id', session?.user.id ?? '')
        .order('created_at', { ascending: false })
        .throwOnError();
      return data;
    },
    enabled: !!session,
    staleTime: STALE.MINUTES.ONE,
  });
}

export type AccessRequest = NonNullable<ReturnType<typeof useAccessRequestsQuery>['data']>[number];

/** The caller's own requests still waiting for an owner — Home's "Waiting for approval". */
export function useMyPendingRequestsQuery() {
  const session = useSession();

  return useQuery({
    queryKey: accessRequestsKey.mine(),
    queryFn: async () => {
      const { data } = await supabase
        .from('access_requests')
        .select('id, merchant_name, code, created_at')
        .eq('user_id', session?.user.id ?? '')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .throwOnError();
      return data;
    },
    enabled: !!session,
    staleTime: STALE.MINUTES.ONE,
  });
}

/** Use a code (public.claim_access_code). It answers with a status rather than failing: claimMessage words it. */
export function useClaimAccessCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await supabase.rpc('claim_access_code', { p_code: code }).throwOnError();
      // SAFETY: the generated types call any jsonb Json; claim_access_code builds this one with jsonb_build_object
      // from a status and, for the answers that know the system, merchant_name
      // (supabase/migrations/20261013213537_access_codes.sql).
      return data as { status: ClaimStatus; merchant_name?: string | null };
    },
    onSuccess: async (result) => {
      if (result.status === 'requested') await invalidateAccessRequests(queryClient);
    },
  });
}

/** Approve or decline (public.decide_access_request). Approving makes the member, and the code's status moves. */
export function useDecideAccessRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      await supabase.rpc('decide_access_request', { p_request: id, p_approve: approve }).throwOnError();
    },
    onSuccess: async () => {
      await Promise.all([invalidateAccessRequests(queryClient), invalidateAccessCodes(queryClient), invalidateMembers(queryClient)]);
    },
  });
}
