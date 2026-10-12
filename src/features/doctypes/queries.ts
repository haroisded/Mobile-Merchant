import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

/** A doctype a permission can name (supabase/migrations/20261008145056_users_and_access.sql §1). */
export type Doctype = Tables<'doctypes'>;

/**
 * A document type that links to a restrictable doctype through one of its columns, and so follows a User
 * Permission on it (supabase/migrations/20261012131350_access_for_documents.sql §1).
 */
export type DoctypeLink = Tables<'doctype_links'>;

// The registry is written only by migrations, so it is reference data: fetched once, never refetched.
const doctypesKey = { all: ['doctypes'], links: () => [...doctypesKey.all, 'links'] };

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

export function useDoctypeLinksQuery() {
  return useQuery({
    queryKey: doctypesKey.links(),
    queryFn: async () => {
      const { data } = await supabase.from('doctype_links').select('*').order('doctype').throwOnError();
      return data;
    },
    staleTime: STALE.STATIC,
  });
}
