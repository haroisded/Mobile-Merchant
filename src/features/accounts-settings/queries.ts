import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { AccountsSettingsValues } from './schema';

export type AccountsSettings = Tables<'accounts_settings'>;

// The only file that knows the table is called `accounts_settings` (.claude/instruction_mds/data-layer.md
// rules 2-3). A single: one row per system, made by the merchants_seed_50_accounting_defaults trigger.
const accountsSettingsKey = {
  all: ['accounts-settings'],
  detail: (args: { merchantId: string }) => [...accountsSettingsKey.all, args],
};

export function useAccountsSettingsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: accountsSettingsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('accounts_settings').select('*').eq('merchant_id', merchantId).single().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useUpdateAccountsSettingsMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AccountsSettingsValues) => {
      await supabase
        .from('accounts_settings')
        .update({
          ...values,
          accounts_frozen_till_date: values.accounts_frozen_till_date || null,
          frozen_accounts_modifier: values.frozen_accounts_modifier || null,
        })
        .eq('merchant_id', merchantId)
        .throwOnError();
    },
    onSuccess: async () => {
      await invalidateAccountsSettings(queryClient);
    },
  });
}

/**
 * After a role is deleted: the database cleared it from frozen_accounts_modifier (on delete set null).
 * `refetchType: 'all'` because the page is not mounted then: a stale cache would seed the form's
 * defaultValues with the dead role on the next open, and a later refetch does not reset them.
 */
export function invalidateAccountsSettings(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: accountsSettingsKey.all, refetchType: 'all' });
}
