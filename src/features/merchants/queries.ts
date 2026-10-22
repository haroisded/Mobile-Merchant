import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import { resetFeaturePreferences } from '../feature-preferences/queries';
import type { CompanyFormValues, CreateStoreValues } from './schema';

// The row type comes from the generated types, not from a hand-written interface. One less thing to
// keep in step with the migration.
export type Merchant = Tables<'merchants'>;

// This is the only file in the app that knows the table is called `merchants`. Screens import the
// hooks below; nothing outside this file calls supabase.from() (.claude/instruction_mds/data-layer.md rules 2-3).

// Key factory, most generic to most specific, so `merchantsKey.all` invalidates everything about
// merchants while a narrower key can still be targeted later. When a filtered list arrives, its args
// go in an OBJECT, never positionally, so adding a second argument cannot silently reorder an
// existing call site (.claude/instruction_mds/data-layer.md rule 7).
//
// Deliberately no owner id in the key: the QueryClient itself is keyed on session.user.id in
// src/app/_layout.tsx, so a different user gets a different cache entirely. Scoping the key too
// would restate that and imply the cache is shared, which is exactly the impression to avoid.
const merchantsKey = {
  all: ['merchants'],
  lists: () => [...merchantsKey.all, 'list'],
};

/** For a change made elsewhere: an owner letting the caller in, or removing them (src/features/notifications/). */
export const invalidateMerchants = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries({ queryKey: merchantsKey.all });

export function useMerchantsQuery() {
  return useQuery({
    queryKey: merchantsKey.lists(),
    queryFn: async () => {
      // No owner_id filter. merchants_select_own already restricts this to the caller's rows, and
      // adding a client-side `.eq('owner_id', …)` would read as though it were the thing keeping
      // other users' rows out — it is not, and a reader who believes that will eventually remove
      // the policy.
      //
      // throwOnError(), because supabase-js resolves rather than rejects on an API error. Without it
      // the failure comes back in `error` as a PLAIN OBJECT (postgrest-js dist/index.mjs:494, :513),
      // not a PostgrestError: throwing that copy gives React Query a non-Error with no stack and no
      // class to test a code against. throwOnError() throws the real class (:506, :526). Found on
      // the device.
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false })
        .throwOnError();

      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * One system out of the list the shell already fetched (a cache hit), and whether the caller owns it — what a route
 * inside a system hands its screen. Undefined until the list has it.
 */
export function useMerchant(id: string) {
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);
  const userId = useSession()?.user.id;
  return merchant ? { merchant, isOwner: merchant.owner_id === userId } : undefined;
}

export function useCreateSystemMutation() {
  const queryClient = useQueryClient();
  const session = useSession();

  return useMutation({
    mutationFn: async (values: CreateStoreValues) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Not signed in.');

      const { data } = await supabase
        .from('merchants')
        // merchants_insert_own checks owner_id against auth.uid(); sending anyone else's id is
        // rejected by the database, not merely by this line. The insert is the whole of the setup:
        // the merchants_seed_* triggers create the store's first fiscal year in the same
        // transaction, as ERPNext's setup wizard does — and merchants_seed_98_level what its level adds.
        .insert({ owner_id: userId, ...values })
        .select()
        .single()
        .throwOnError();

      return data;
    },

    onSuccess: async () => {
      // Mutation then invalidation is the whole CRUD loop here. Awaiting keeps the mutation in
      // `pending` until the refetch lands, so the form closes onto a list that already has the new
      // card rather than one that pops in a moment later.
      await queryClient.invalidateQueries({ queryKey: merchantsKey.lists() });
    },
  });
}

/** The Store form's account fields hold '' for none; the row holds null. */
const companyRow = (values: CompanyFormValues) => ({
  ...values,
  default_cash_account: values.default_cash_account || null,
  default_bank_account: values.default_bank_account || null,
  default_income_account: values.default_income_account || null,
  default_expense_account: values.default_expense_account || null,
  write_off_account: values.write_off_account || null,
  round_off_account: values.round_off_account || null,
  default_discount_account: values.default_discount_account || null,
  default_inventory_account: values.default_inventory_account || null,
  stock_adjustment_account: values.stock_adjustment_account || null,
  stock_received_but_not_billed: values.stock_received_but_not_billed || null,
  expenses_included_in_valuation: values.expenses_included_in_valuation || null,
});

/** The Store page's save: name, country and default currency of one store, its accounting defaults and Perpetual Inventory. */
export function useUpdateCompanyMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      // merchants_update_own decides who may write this row, as it does for the list above;
      // private.validate_company_accounts, which record each default may name.
      await supabase.from('merchants').update(companyRow(values)).eq('id', merchantId).throwOnError();
    },

    // Awaited, so Save stays in its spinner until the list (which the shell reads its name from) has the
    // new values.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: merchantsKey.lists() });
    },
  });
}

/**
 * The owner's change of a store's level (./levels.ts), from Features. merchants_guard_level refuses anyone else;
 * merchants_level_changed adds what the level needs (private.apply_level) and deletes everyone's saved Features
 * choices in the store, so each menu starts again from the new level's.
 */
export function useSetStoreLevelMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (level: number) => {
      await supabase.from('merchants').update({ level }).eq('id', merchantId).throwOnError();
    },
    onSuccess: async () => {
      // The trigger deleted the choices: the cache says so before the new level arrives, so the Features page never
      // starts from the old ones. Then everything — a level can add a register and change Stock Settings, and this is
      // a rare, deliberate action.
      resetFeaturePreferences(queryClient, merchantId);
      await queryClient.invalidateQueries();
    },
  });
}

/** Removes one store or several — the systems list's multi-select — in one statement. */
export function useDeleteMerchantsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // No owner_id filter, for the same reason the list query has none: merchants_delete_own is
      // what restricts this to the caller's rows. A client-side `.eq('owner_id', …)` would read as
      // the thing enforcing it, and a reader who believes that will eventually drop the policy.
      //
      // Worth knowing about that policy's shape: RLS on a DELETE *filters* rows rather than
      // refusing the statement, so deleting a row the caller does not own is a successful no-op,
      // not the 403 a permission error would give. It is unreachable from here anyway — the grid
      // only ever renders rows merchants_select_own returned — and a row deleted elsewhere in the
      // meantime lands on the same screen either way, because the invalidation below refetches a
      // list that no longer contains it.
      await supabase.from('merchants').delete().in('id', ids).throwOnError();
    },

    onSuccess: async () => {
      // Only the merchants key. Unlike the create mutation this writes one table, and invalidating
      // profiles as well would refetch the Account screen's display_name for no reason.
      //
      // Awaited, so the mutation stays `pending` until the refetch lands and the dialog closes onto
      // a grid the card has already left, rather than one it disappears from a moment later.
      await queryClient.invalidateQueries({ queryKey: merchantsKey.lists() });
    },
  });
}
