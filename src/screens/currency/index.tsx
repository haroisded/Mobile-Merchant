import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ControlledSwitch, ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { useCurrencyQuery, useUpdateCurrencyMutation } from '../../features/currencies/queries';
import type { Currency } from '../../features/currencies/queries';
import { currencySchema } from '../../features/currencies/schema';
import type { CurrencyValues } from '../../features/currencies/schema';
import { useGlobalDefaultsQuery } from '../../features/global-defaults/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { asRoundingMethod, cashRound, formatMoney, moneyInWords, NUMBER_FORMAT_OPTIONS, roundTo } from '../../lib/money';
import type { CurrencyFormat } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

// A sample total with a half in its last place, so the rounding method shows.
const SAMPLE = 1234.565;

/**
 * Currency (docs.frappe.io/erpnext/currency): how the base currency looks — symbol and its side, the fraction
 * named in words, the smallest coin for cash rounding, the number format — with a sample receipt total
 * that follows every change. Multi-currency is out of scope, so this is the company's own currency.
 */
export function CurrencyScreen({ merchant }: { merchant: Merchant }) {
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency });

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Currency" meta={merchant.default_currency} onBack={() => router.back()} />
      {currency.data ? (
        <CurrencyForm merchantId={merchant.id} saved={currency.data} />
      ) : (
        <View style={styles.state}>
          <QueryState query={currency} offline="You're offline. The currency will load when you reconnect." failure="Couldn't load the currency. Try again.">
            <Text variant="bodyMedium">This currency has no settings yet. Save the Company again to create them.</Text>
          </QueryState>
        </View>
      )}
    </View>
  );
}

const defaults = (saved: Currency): CurrencyValues => ({
  symbol: saved.symbol ?? '',
  symbol_on_right: saved.symbol_on_right,
  fraction: saved.fraction ?? '',
  fraction_units: saved.fraction_units === null ? '' : String(saved.fraction_units),
  smallest_currency_fraction_value: saved.smallest_currency_fraction_value === null ? '' : String(saved.smallest_currency_fraction_value),
  number_format: saved.number_format,
});

function CurrencyForm({ merchantId, saved }: { merchantId: string; saved: Currency }) {
  const update = useUpdateCurrencyMutation({ currencyId: saved.id });
  const editable = can(usePermissions({ merchantId }).data, 'Currency', 'write');
  const notice = mutationNotice(update, failureMessage("Couldn't save the currency. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<CurrencyValues>({
    resolver: zodResolver(currencySchema),
    defaultValues: defaults(saved),
    mode: 'onTouched',
  });


  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs Currency write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      <FieldGrid>
        <ControlledText control={control} name="symbol" label="Symbol" placeholder="e.g. ₱" maxLength={10} disabled={!editable} />
        <ControlledSwitch
          control={control}
          name="symbol_on_right"
          label="Show Currency Symbol on Right Side"
          on="1,234.50 ₱"
          off="₱ 1,234.50"
          disabled={!editable}
        />
        <ControlledText control={control} name="fraction" label="Fraction" hint="The sub-unit, in words" placeholder="e.g. Centavo" maxLength={40} disabled={!editable} />
        <ControlledText control={control} name="fraction_units" label="Fraction Units" hint="How many make one" placeholder="e.g. 100" maxLength={6} disabled={!editable} />
        <ControlledText
          control={control}
          name="smallest_currency_fraction_value"
          label="Smallest Currency Fraction Value"
          hint="The smallest coin, for cash rounding"
          placeholder="e.g. 0.05"
          maxLength={12}
          disabled={!editable}
        />
        <ControlledSelect control={control} name="number_format" label="Number Format" required title="Number Format" options={NUMBER_FORMAT_OPTIONS} disabled={!editable} />
      </FieldGrid>
      <Sample merchantId={merchantId} code={saved.code} control={control} />
    </PageForm>
  );
}

/**
 * The sample total as a receipt would show it, from the form's unsaved values: formatted at the System
 * Settings' Currency Precision and Rounding Method, cash-rounded, and in words — each line hidden by its
 * Global Defaults switch, as ERPNext's print formats are.
 */
function Sample({ merchantId, code, control }: { merchantId: string; code: string; control: Control<CurrencyValues> }) {
  const { colors } = useAppTheme();
  const settings = useSystemSettingsQuery({ merchantId }).data;
  const globals = useGlobalDefaultsQuery({ merchantId }).data;
  const values = useWatch({ control });
  if (!settings || !globals) return null;

  const method = asRoundingMethod(settings.rounding_method);
  const currency = sampleCurrency(code, values);
  // As ERPNext stores it: the Grand Total at the currency precision, and the Rounded Total made from that.
  const total = roundTo(SAMPLE, settings.currency_precision, method);
  const rounded = cashRound(total, Number(values.smallest_currency_fraction_value) || null, settings.currency_precision, method);

  return (
    <Field label="Sample receipt total" hint={`${settings.currency_precision} decimals, ${method}`} span="full">
      <SampleBox>
        <SampleLine label="Grand Total" value={formatMoney(total, currency, settings.currency_precision, method)} />
        {globals.disable_rounded_total ? null : <SampleLine label="Rounded Total" value={formatMoney(rounded, currency, settings.currency_precision, method)} />}
        {globals.disable_in_words ? null : (
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {moneyInWords(globals.disable_rounded_total ? total : rounded, currency)}
          </Text>
        )}
      </SampleBox>
    </Field>
  );
}

/** The form's unsaved values as the display rules money.ts takes; blanks fall back as the table's would. */
function sampleCurrency(code: string, values: Partial<CurrencyValues>): CurrencyFormat {
  return {
    code,
    symbol: values.symbol || null,
    symbol_on_right: values.symbol_on_right ?? false,
    fraction: values.fraction || null,
    number_format: values.number_format ?? '#,###.##',
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
