import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';

export type CurrencyPreset = Tables<'currency_presets'>;

// Reference data, like countries: seeded by a migration, read-only to every client.
const currencyPresetsKey = { all: ['currency-presets'] };

export function useCurrencyPresetsQuery() {
  return useQuery({
    queryKey: currencyPresetsKey.all,
    queryFn: async () => {
      const { data } = await supabase.from('currency_presets').select('*').order('code').throwOnError();
      return data;
    },
    staleTime: STALE.STATIC,
  });
}
