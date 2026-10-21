import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';

// The only file that knows the table is called `feature_preferences` (.claude/instruction-mds/data-layer.md
// rules 2-3): one row per person and store, their own (20261021004636_feature_preferences.sql). What its keys mean
// is ./visibility.ts.
const featurePreferencesKey = {
  all: ['feature-preferences'],
  detail: (args: { merchantId: string }) => [...featurePreferencesKey.all, args],
};

/**
 * What the signed-in person has hidden in a store: `[]` until they save the Features page once. The provider is
 * keyed on the user (data-layer.md §6), so the key needs no user id. `fresh`: ask again on mount whatever the cache
 * holds — the Features page saves the whole set, so starting from a copy another phone has since changed would
 * write that phone's change away.
 */
export function useFeaturePreferencesQuery({ merchantId, fresh = false }: { merchantId: string; fresh?: boolean }) {
  return useQuery({
    queryKey: featurePreferencesKey.detail({ merchantId }),
    queryFn: async () => {
      // RLS answers the caller's own row only, so the store alone narrows it to one.
      const { data } = await supabase.from('feature_preferences').select('hidden').eq('merchant_id', merchantId).maybeSingle().throwOnError();
      return data?.hidden ?? [];
    },
    staleTime: STALE.MINUTES.FIVE,
    refetchOnMount: fresh ? 'always' : true,
  });
}

/** What the person hid in a store, as a list: nothing until it loads, so a row appears and never vanishes. */
export const useHiddenFeatures = ({ merchantId }: { merchantId: string }) => useFeaturePreferencesQuery({ merchantId }).data ?? [];

/** Saves what the Features page hides: one upsert, the person's own row. */
export function useSaveFeaturePreferencesMutation({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();
  const userId = useSession()?.user.id;

  return useMutation({
    mutationFn: async (hidden: string[]) => {
      if (!userId) throw new Error('Not signed in.');
      await supabase
        .from('feature_preferences')
        .upsert({ user_id: userId, merchant_id: merchantId, hidden, updated_at: new Date().toISOString() }, { onConflict: 'user_id,merchant_id' })
        .throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: featurePreferencesKey.all });
    },
  });
}
