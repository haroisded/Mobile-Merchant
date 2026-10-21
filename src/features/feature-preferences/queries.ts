import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';
import { levelHidden } from '../merchants/levels';

// The only file that knows the table is called `feature_preferences` (.claude/instruction-mds/data-layer.md
// rules 2-3): one row per person and store, their own (20261021004636_feature_preferences.sql). What its keys mean
// is ./visibility.ts.
const featurePreferencesKey = {
  all: ['feature-preferences'],
  detail: (args: { merchantId: string }) => [...featurePreferencesKey.all, args],
};

/**
 * What the signed-in person has hidden in a store, as they saved it: null until they save the Features page once — the
 * store's level then decides (useHiddenFeatures). The provider is keyed on the user (data-layer.md §6), so the key
 * needs no user id. `fresh`: ask again on mount whatever the cache holds — the Features page saves the whole set, so
 * starting from a copy another phone has since changed would write that phone's change away.
 */
export function useFeaturePreferencesQuery({ merchantId, fresh = false }: { merchantId: string; fresh?: boolean }) {
  return useQuery({
    queryKey: featurePreferencesKey.detail({ merchantId }),
    queryFn: async () => {
      // RLS answers the caller's own row only, so the store alone narrows it to one.
      const { data } = await supabase.from('feature_preferences').select('hidden').eq('merchant_id', merchantId).maybeSingle().throwOnError();
      return data?.hidden ?? null;
    },
    staleTime: STALE.MINUTES.FIVE,
    refetchOnMount: fresh ? 'always' : true,
  });
}

/** What a person's menu hides: their saved choices, else the store's level's menu (../merchants/levels.ts). */
export const hiddenOf = (saved: string[] | null, level: number) => saved ?? levelHidden(level);

/**
 * What the person hides in a store: undefined until both their choices and the store's level have loaded, so a
 * destination or a row appears and never vanishes.
 */
export function useHiddenFeatures({ merchantId, level }: { merchantId: string; level: number | undefined }) {
  const saved = useFeaturePreferencesQuery({ merchantId }).data;
  return saved === undefined || level === undefined ? undefined : hiddenOf(saved, level);
}

/** A level change deleted everyone's choices in the store (merchants_level_changed): the cache says so at once. */
export const resetFeaturePreferences = (queryClient: QueryClient, merchantId: string) =>
  queryClient.setQueryData(featurePreferencesKey.detail({ merchantId }), null);

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
