import { useQuery, useQueryClient } from '@tanstack/react-query';

import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import type { Permissions } from '../permissions/access';

// The checks themselves are import-free (src/features/permissions/access.ts, asserted in tools/check-logic.mjs);
// every screen keeps importing them from here.
export { can, has } from '../permissions/access';
export type { Permissions, Ptype } from '../permissions/access';

const permissionsKey = {
  all: ['permissions'],
  detail: (args: { merchantId: string }) => [...permissionsKey.all, args],
};

/**
 * What the signed-in person may do in one system, so a screen hides what RLS would refuse. The policies stay the
 * boundary (private.permitted_merchant_ids); this mirrors them. The owner may do everything. Asked again every
 * minute and on coming back, so an owner's change reaches an open app within a minute without a restart. The
 * "Access changed" notification is no substitute: while one is unread, private.notify_access_changed() adds no
 * second, so nothing new arrives to ask sooner (src/features/notifications/queries.ts).
 */
export function usePermissions({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: permissionsKey.detail({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.rpc('my_permissions', { p_merchant: merchantId }).throwOnError();
      // SAFETY: public.my_permissions builds exactly this object with jsonb_build_object, or returns null
      // for a system the caller cannot enter; the generated types can only say Json.
      return data as Permissions | null;
    },
    staleTime: STALE.MINUTES.ONE,
    refetchInterval: STALE.MINUTES.ONE,
    refetchOnWindowFocus: true,
  });
}

/** After a change to roles or employees: what anyone may do could have changed with it. */
export function invalidatePermissions(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: permissionsKey.all });
}
