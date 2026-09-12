import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import { profileKey } from '../profiles/queries';
import { normalizePhone } from './schema';
import type { CreateSystemValues } from './schema';

// The row type comes from the generated types, not from a hand-written interface. One less thing to
// keep in step with the migration.
export type Merchant = Tables<'merchants'>;

// This is the only file in the app that knows the table is called `merchants`. Screens import the
// hooks below; nothing outside this file calls supabase.from() (docs/data-layer.md rules 2-3).

// Key factory, most generic to most specific, so `merchantsKey.all` invalidates everything about
// merchants while a narrower key can still be targeted later. Args go in an OBJECT, never
// positionally, so adding a second argument cannot silently reorder an existing call site
// (docs/data-layer.md rule 6).
//
// Deliberately no owner id in the key: the QueryClient itself is keyed on session.user.id in
// src/app/_layout.tsx, so a different user gets a different cache entirely. Scoping the key too
// would restate that and imply the cache is shared, which is exactly the impression to avoid.
export const merchantsKey = {
  all: ['merchants'],
  lists: () => [...merchantsKey.all, 'list'],
  list: (filters: { category?: string } = {}) => [...merchantsKey.lists(), filters],
};

export function useMerchantsQuery() {
  return useQuery({
    queryKey: merchantsKey.list(),
    queryFn: async () => {
      // No owner_id filter. merchants_select_own already restricts this to the caller's rows, and
      // adding a client-side `.eq('owner_id', …)` would read as though it were the thing keeping
      // other users' rows out — it is not, and a reader who believes that will eventually remove
      // the policy.
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });

      // supabase-js resolves rather than rejects on an API error, so the throw is what tells React
      // Query the query failed. Without it, `error` becomes the query's `data`.
      if (error) throw error;
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

export function useCreateSystemMutation() {
  const queryClient = useQueryClient();
  const session = useSession();

  return useMutation({
    mutationFn: async (values: CreateSystemValues) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Not signed in.');

      // ponytail: two writes, one mutationFn — promote to a security-definer RPC only if a partial
      // state turns out to matter. They are not in one transaction: step 1's username belongs to
      // the person (profiles) and steps 2-3 belong to the business (merchants), which are two
      // tables and two policies. The failure mode is a display_name saved with no merchant, and
      // retrying writes the same value, so it is idempotent rather than corrupting.
      const profileUpdate = await supabase
        .from('profiles')
        .update({ display_name: values.displayName })
        .eq('id', userId);

      if (profileUpdate.error) throw profileUpdate.error;

      const { data, error } = await supabase
        .from('merchants')
        .insert({
          // merchants_insert_own checks this against auth.uid(); sending anyone else's id is
          // rejected by the database, not merely by this line.
          owner_id: userId,
          name: values.name,
          contact_email: values.contactEmail,
          // These two columns are nullable and their form fields are strings. '' would be a value
          // that means "not given" without looking like one in the database.
          //
          // normalizePhone runs here rather than in the schema so the form validates what the user
          // typed and the table stores E.164 — see the note on it in schema.ts.
          phone: normalizePhone(values.phone) || null,
          address: values.address || null,
          category: values.category,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    onSuccess: async () => {
      // Mutation then invalidation is the whole CRUD loop here. Awaiting keeps the mutation in
      // `pending` until the refetch lands, so the modal closes onto a list that already has the new
      // card rather than one that pops in a moment later.
      //
      // Both keys, because mutationFn wrote both tables — invalidating only merchants leaves the
      // Account screen showing the old display_name until something else happens to refetch it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: merchantsKey.lists() }),
        queryClient.invalidateQueries({ queryKey: profileKey.all }),
      ]);
    },
  });
}

export function useDeleteMerchantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
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
      const { error } = await supabase.from('merchants').delete().eq('id', id);
      if (error) throw error;
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
