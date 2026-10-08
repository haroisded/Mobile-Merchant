import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

/** A doctype a permission can name (supabase/migrations/20261008145056_users_and_access.sql §1). */
export type Doctype = Tables<'doctypes'>;

// The registry is written only by migrations, so it is reference data: fetched once, never refetched.
const doctypesKey = { all: ['doctypes'] };

export function useDoctypesQuery() {
  return useQuery({
    queryKey: doctypesKey.all,
    queryFn: async () => {
      const { data } = await supabase.from('doctypes').select('*').order('name').throwOnError();
      return data;
    },
    staleTime: STALE.STATIC,
  });
}
