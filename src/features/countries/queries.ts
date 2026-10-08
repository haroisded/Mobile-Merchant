import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type Country = Tables<'countries'>;

// Reference data: seeded by a migration from frappe's country list and read-only to every client, so one
// key and no arguments.
const countriesKey = { all: ['countries'] };

export function useCountriesQuery() {
  return useQuery({
    queryKey: countriesKey.all,
    queryFn: async () => {
      const { data } = await supabase.from('countries').select('*').order('country_name').throwOnError();
      return data;
    },
    staleTime: STALE.STATIC,
  });
}

/**
 * The country a device is in, guessed from its time zone: the first country whose zones include it.
 * Create System's default, so a shop in Manila starts on the Philippines and the peso.
 */
export function countryForTimeZone(countries: Country[], timeZone: string) {
  return countries.find((country) => country.time_zones.includes(timeZone));
}
