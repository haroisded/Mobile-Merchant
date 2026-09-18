import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../Store/StoreUser';

export type Profile = Tables<'profiles'>;

// A separate resource from merchants — its own table, its own policies, its own key — so it gets its
// own folder rather than being folded in as a helper (instruction_mds/structure.md rule 1).
export const profileKey = {
  all: ['profile'],
  detail: () => [...profileKey.all, 'detail'],
};

export function useProfileQuery() {
  const session = useSession();

  return useQuery({
    queryKey: profileKey.detail(),
    queryFn: async () => {
      // maybeSingle, not single. The signup trigger creates this row, so in practice it is always
      // there — but `single()` throws when it is not, which would turn a missing profile into a
      // hard error on a screen that could simply fall back to the session's own metadata.
      //
      // throwOnError() throws a real PostgrestError; see the note in merchants/queries.ts.
      const { data } = await supabase.from('profiles').select('*').maybeSingle().throwOnError();

      return data;
    },

    // The route guard renders nothing until the session resolves, but this hook can still mount for
    // one render while `session` is undefined. Without this the query fires and RLS returns an
    // empty row that then caches as "no profile".
    enabled: !!session,

    staleTime: STALE.MINUTES.FIVE,
  });
}
