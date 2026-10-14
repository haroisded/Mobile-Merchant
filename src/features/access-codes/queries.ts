import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { expiryArgs } from './code';
import type { NewAccessCodeValues } from './schema';

// The owner's access codes, across every system they own. The only file that knows the table is called
// `access_codes` (.claude/instruction_mds/data-layer.md rules 2-3). access_codes_select is owner-only, so the list
// needs no filter of its own.
const accessCodesKey = {
  all: ['access-codes'],
  lists: () => [...accessCodesKey.all, 'list'],
};

export const invalidateAccessCodes = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: accessCodesKey.all });

/**
 * Newest first, each with its system's name and its requests — their statuses, what codeStatus (./code.ts) reads, and
 * who sent them, what the code's page lists under Used by.
 */
export function useAccessCodesQuery() {
  return useQuery({
    queryKey: accessCodesKey.lists(),
    queryFn: async () => {
      const { data } = await supabase
        .from('access_codes')
        .select('*, merchants(name), access_requests(status, full_name, email, created_at)')
        .order('created_at', { ascending: false })
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.ONE,
  });
}

export type AccessCode = NonNullable<ReturnType<typeof useAccessCodesQuery>['data']>[number];

/** Make codes (public.create_access_codes): the rows made, for the form to show and share. */
export function useCreateAccessCodesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: NewAccessCodeValues) => {
      const { data } = await supabase
        .rpc('create_access_codes', {
          p_merchant: values.merchant_id,
          p_label: values.label,
          p_quantity: values.quantity,
          // Left out: any number of people.
          ...(values.uses === 'one' && { p_max_uses: 1 }),
          ...expiryArgs(values.expiry, values.expires_on),
        })
        .throwOnError();
      return data;
    },
    onSuccess: async () => {
      await invalidateAccessCodes(queryClient);
    },
  });
}

/** A deleted code stops working at once. Its requests stay, decided or not. */
export function useDeleteAccessCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('access_codes').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await invalidateAccessCodes(queryClient);
    },
  });
}
