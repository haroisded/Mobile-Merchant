import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { AccountValues } from './schema';

export type Account = Tables<'accounts'>;

/**
 * "1110 - Cash": ERPNext's account name, number first when set. No " - ABBR" after it: ERPNext's suffix tells
 * several companies' accounts apart, and a store has one set (supabase/migrations/20261018162135_single_store.sql).
 */
export const accountLabel = (account: Account) => `${account.account_number ? `${account.account_number} - ` : ''}${account.account_name}`;

/**
 * The accounts a default may name, as picker options with None first: enabled ledgers that `fits` lets
 * through — the filter private.validate_company_accounts and validate_mode_of_payment_account check again.
 * `keep` stays listed even when it no longer fits (disabled since it was picked), so the field still shows
 * what is saved.
 */
export const ledgerOptions = (accounts: Account[], fits: (account: Account) => boolean, keep?: string | null) => [
  { value: '', label: 'None' },
  ...accounts
    .filter((account) => account.id === keep || (!account.is_group && !account.disabled && fits(account)))
    .map((account) => ({ value: account.id, label: accountLabel(account), hint: account.account_type ?? account.root_type })),
];

// The only file that knows the table is called `accounts` (.claude/instruction_mds/data-layer.md rules 2-3).
const accountsKey = {
  all: ['accounts'],
  lists: () => [...accountsKey.all, 'list'],
  list: (args: { merchantId: string }) => [...accountsKey.lists(), args],
};

/**
 * A system's whole Chart of Accounts, flat; the screens walk it with src/lib/tree.ts. Numbered accounts
 * first, by number, then by name. ponytail: one fetch of every account — a POS chart is tens of rows; page
 * by parent if a chart ever runs to thousands.
 */
export function useAccountsQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: accountsKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('merchant_id', merchantId)
        .order('account_number', { nullsFirst: false })
        .order('account_name')
        .throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/** The row a form's strings become: blanks to null. root_type only on create (see schema.ts). */
const row = ({ root_type: _rootType, ...values }: AccountValues) => ({
  ...values,
  account_number: values.account_number || null,
  parent_id: values.parent_id || null,
  account_type: values.account_type || null,
});

/** Create an account, or edit one when `accountId` is given. */
export function useSaveAccountMutation({ merchantId, accountId }: { merchantId: string; accountId?: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AccountValues) => {
      if (accountId) {
        await supabase.from('accounts').update(row(values)).eq('id', accountId).throwOnError();
      } else {
        await supabase.from('accounts').insert({ merchant_id: merchantId, root_type: values.root_type, ...row(values) }).throwOnError();
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountsKey.lists() });
    },
  });
}

/** Refused with 23503 while accounts sit under it (accounts_parent_fk). */
export function useDeleteAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('accounts').delete().eq('id', id).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountsKey.lists() });
    },
  });
}
