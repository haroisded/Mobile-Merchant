import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '../../lib/database.types';
import { asRoundingMethod, formatMoney } from '../../lib/money';
import { STALE } from '../../lib/query';
import { supabase } from '../../lib/supabase';
import { useGlobalDefaultsQuery } from '../global-defaults/queries';
import type { Merchant } from '../merchants/queries';
import { useSystemSettingsQuery } from '../system-settings/queries';
import type { CurrencyValues } from './schema';

export type Currency = Tables<'currencies'>;

// The only file that knows the table is called `currencies` (.claude/instruction_mds/data-layer.md
// rules 2-3).
const currenciesKey = {
  all: ['currencies'],
  lists: () => [...currenciesKey.all, 'list'],
  list: (args: { merchantId: string }) => [...currenciesKey.lists(), args],
  details: () => [...currenciesKey.all, 'detail'],
  detail: (args: { merchantId: string; code: string }) => [...currenciesKey.details(), args],
};

/** The currencies a system has a row for — a Price List's choices. Today its base currency, plus any it had before. */
export function useCurrenciesQuery({ merchantId }: { merchantId: string }) {
  return useQuery({
    queryKey: currenciesKey.list({ merchantId }),
    queryFn: async () => {
      const { data } = await supabase.from('currencies').select('*').eq('merchant_id', merchantId).order('code').throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * One currency's display rules in one system — the base currency, which the merchants_company_currency
 * trigger keeps a row for. Null while that row does not exist yet.
 */
export function useCurrencyQuery({ merchantId, code }: { merchantId: string; code: string }) {
  return useQuery({
    queryKey: currenciesKey.detail({ merchantId, code }),
    queryFn: async () => {
      const { data } = await supabase.from('currencies').select('*').eq('merchant_id', merchantId).eq('code', code).maybeSingle().throwOnError();
      return data;
    },
    staleTime: STALE.MINUTES.FIVE,
  });
}

/**
 * A system's amounts as its Currency page writes them ("₱ 1,234.50"): the base currency's symbol and number
 * format at System Settings' precision and rounding. The bare number until both have loaded.
 */
export function useMoney(merchant: Pick<Merchant, 'id' | 'default_currency'>) {
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency }).data;
  const settings = useSystemSettingsQuery({ merchantId: merchant.id }).data;

  return (value: number) =>
    currency && settings ? formatMoney(value, currency, settings.currency_precision, asRoundingMethod(settings.rounding_method)) : String(value);
}

/**
 * What a total is rounded and worded by: Global Defaults' rounded total and amount in words, System Settings'
 * precision and method, and the base currency with its smallest coin — a receipt's and a sale's alike.
 * Undefined until all three have loaded.
 */
export function useTotalsSettings(merchant: Pick<Merchant, 'id' | 'default_currency'>) {
  const globals = useGlobalDefaultsQuery({ merchantId: merchant.id }).data;
  const system = useSystemSettingsQuery({ merchantId: merchant.id }).data;
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency }).data;

  return globals && system && currency ? { globals, system, currency } : undefined;
}

/** The row a form's strings become: blanks to null, numbers parsed. */
const row = (values: CurrencyValues) => ({
  symbol: values.symbol || null,
  fraction: values.fraction || null,
  fraction_units: values.fraction_units === '' ? null : Number(values.fraction_units),
  smallest_currency_fraction_value: values.smallest_currency_fraction_value === '' ? null : Number(values.smallest_currency_fraction_value),
  number_format: values.number_format,
  symbol_on_right: values.symbol_on_right,
});

export function useUpdateCurrencyMutation({ currencyId }: { currencyId: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: CurrencyValues) => {
      await supabase.from('currencies').update(row(values)).eq('id', currencyId).throwOnError();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currenciesKey.details() });
    },
  });
}
