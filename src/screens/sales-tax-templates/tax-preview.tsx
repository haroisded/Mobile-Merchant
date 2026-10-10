import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Field, FieldGrid } from '../../components/form-fields';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SearchSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { useCurrencyQuery } from '../../features/currencies/queries';
import type { Currency } from '../../features/currencies/queries';
import { useGlobalDefaultsQuery } from '../../features/global-defaults/queries';
import { itemTaxRates, useItemTaxTemplatesQuery } from '../../features/item-tax-templates/queries';
import type { ItemTaxTemplate } from '../../features/item-tax-templates/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { calculateTaxes } from '../../features/sales-tax-templates/calculate';
import type { ItemLine } from '../../features/sales-tax-templates/calculate';
import { taxRow, taxRowsSchema } from '../../features/sales-tax-templates/schema';
import type { SalesTaxRowValues, SalesTaxTemplateValues } from '../../features/sales-tax-templates/schema';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { asRoundingMethod, cashRound, formatMoney, roundTo } from '../../lib/money';
import type { RoundingMethod } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/**
 * The template's unsaved rows applied to one sample item line — price, quantity, and an Item Tax Template —
 * the way a sale will compute them (calculate.ts). Amounts at the System Settings' Currency Precision and
 * Rounding Method, in the company currency.
 */
export function TaxPreview({ merchant, control }: { merchant: Merchant; control: Control<SalesTaxTemplateValues> }) {
  const settings = useSystemSettingsQuery({ merchantId: merchant.id }).data;
  const globals = useGlobalDefaultsQuery({ merchantId: merchant.id }).data;
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency }).data;
  if (!settings || !globals || !currency) return null;

  return (
    <Preview
      merchantId={merchant.id}
      control={control}
      money={{ currency, precision: settings.currency_precision, method: asRoundingMethod(settings.rounding_method), rounded: !globals.disable_rounded_total }}
    />
  );
}

type PreviewProps = { merchantId: string; control: Control<SalesTaxTemplateValues>; money: Omit<TotalsProps, 'rows' | 'sample'> };

function Preview({ merchantId, control, money }: PreviewProps) {
  const { colors } = useAppTheme();
  const [price, setPrice] = useState('100');
  const [qty, setQty] = useState('1');
  const [itemTemplateId, setItemTemplateId] = useState('');
  const rows = useWatch({ control, name: 'rows' });
  // An Item Tax Template's rates need its read; without it the sample has no item template to pick.
  const readsItemTemplates = can(usePermissions({ merchantId }).data, 'Item Tax Template', 'read');
  const itemTemplates = useItemTaxTemplatesQuery({ merchantId }).data ?? [];
  const itemTemplate = itemTemplates.find((template) => template.id === itemTemplateId);
  const sample = { rate: Number(price) || 0, qty: Number(qty) || 0, itemTaxRates: itemTemplate ? itemTaxRates(itemTemplate) : undefined };

  return (
    <View style={styles.section}>
      {/* Form section heading: headlineSmall and its bodySmall hint (.claude/instruction_mds/frontend.md §5). */}
      <View style={styles.heading}>
        <Text variant="headlineSmall">Preview</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          One sample item with these rows, before saving
        </Text>
      </View>
      <FieldGrid>
        <Field label="Price" hint={rows.some((row) => row.included_in_print_rate) ? 'As on the shelf, tax included' : 'Before tax'}>
          <TextInput mode="outlined" dense value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={12} accessibilityLabel="Sample price" />
        </Field>
        <Field label="Quantity">
          <TextInput mode="outlined" dense value={qty} onChangeText={setQty} keyboardType="decimal-pad" maxLength={8} accessibilityLabel="Sample quantity" />
        </Field>
        {readsItemTemplates ? <ItemTemplatePick templates={itemTemplates} value={itemTemplateId} onChange={setItemTemplateId} /> : null}
      </FieldGrid>
      <Totals rows={rows} sample={sample} {...money} />
    </View>
  );
}

/** The sample's Item Tax Template: None, or an enabled one. */
function ItemTemplatePick({ templates, value, onChange }: { templates: ItemTaxTemplate[]; value: string; onChange: (value: string) => void }) {
  return (
    <SearchSelect
      label="Item Tax Template"
      span="full"
      title="Item Tax Template"
      value={value}
      options={[{ value: '', label: 'None' }, ...templates.filter((template) => !template.disabled).map((template) => ({ value: template.id, label: template.title }))]}
      onChange={onChange}
    />
  );
}

type TotalsProps = {
  rows: SalesTaxRowValues[];
  sample: ItemLine;
  currency: Currency;
  precision: number;
  method: RoundingMethod;
  /** Global Defaults' Disable Rounded Total, inverted. */
  rounded: boolean;
};

/** Net total, each row's Amount and the running Total after it (ERPNext's two columns), the grand and rounded totals. */
function Totals({ rows, sample, currency, precision, method, rounded }: TotalsProps) {
  const parsed = taxRowsSchema.safeParse(rows);
  const amount = (value: number) => formatMoney(value, currency, precision, method);

  if (!parsed.success) {
    return (
      <SampleBox>
        <Text variant="bodyMedium">Fix the rows above to see the preview.</Text>
      </SampleBox>
    );
  }

  const result = calculateTaxes([sample], parsed.data.map(taxRow), precision, (value, places) => roundTo(value, places, method));

  return (
    <SampleBox>
      {parsed.data.some((row) => row.included_in_print_rate) ? <SampleLine label="Net Rate" value={amount(result.items[0].netRate)} /> : null}
      <SampleLine label="Net Total" value={amount(result.netTotal)} />
      {parsed.data.map((row, i) => (
        <SampleLine key={`${i}:${row.description}`} label={`${i + 1}. ${row.description}`} value={amount(result.rows[i].amount)} sub={`Total ${amount(result.rows[i].total)}`} />
      ))}
      <SampleLine label="Total Taxes and Charges" value={amount(result.totalTaxes)} />
      <SampleLine label="Grand Total" value={amount(result.grandTotal)} />
      {rounded ? <SampleLine label="Rounded Total" value={amount(cashRound(result.grandTotal, currency.smallest_currency_fraction_value, precision, method))} /> : null}
    </SampleBox>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.ms, paddingTop: spacing.sm },
  heading: { gap: spacing.xs },
});
