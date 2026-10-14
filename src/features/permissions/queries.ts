import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type Permission = Tables<'permissions'>;

// The only file that knows the table is called `permissions` (.claude/instruction_mds/data-layer.md rules 2-3).
const catalogKey = { all: ['permission-catalog'] };

/**
 * Every permission an owner can turn on, in the order the editors list them: grouped by category, each with the one
 * it requires. A migration writes it and no client can, so it is fetched once.
 */
export function usePermissionCatalogQuery() {
  return useQuery({
    queryKey: catalogKey.all,
    queryFn: async () => {
      const { data } = await supabase.from('permissions').select('*').order('position').throwOnError();
      return data;
    },
    staleTime: STALE.STATIC,
  });
}
