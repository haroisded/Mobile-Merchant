import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { AdaptiveDialog } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { ControlledText, Field, FieldGrid } from '../../components/form-fields';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { ControlledSelect } from '../../components/search-select';
import { Text } from '../../components/text';
import { useCurrencyQuery } from '../../features/currencies/queries';
import type { Currency } from '../../features/currencies/queries';
import { useGlobalDefaultsQuery } from '../../features/global-defaults/queries';
import { itemTaxRates, useItemTaxTemplatesQuery } from '../../features/item-tax-templates/queries';
import { useMerchantsQuery } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { calculateTaxes } from '../../features/sales-tax-templates/calculate';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { formRows, taxRow, taxRowsSchema } from '../../features/sales-tax-templates/schema';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { asRoundingMethod, cashRound, formatMoney, roundTo } from '../../lib/money';
import type { RoundingMethod } from '../../lib/money';

type Sample = { template_id: string; price: string; qty: string; item_template_id: string };

type Money = {
  currency: Currency;
  precision: number;
  method: RoundingMethod;
  /** Global Defaults' Disable Rounded Total, inverted. */
  rounded: boolean;
};

/**
 * Test Template: a saved Sales Taxes and Charges Template applied to one sample item line — price, quantity, and
 * an Item Tax Template — the way a sale computes it (calculate.ts), at the System Settings' Currency Precision
 * and Rounding Method. Nothing is saved: the fields are a local form. The body of
 * src/app/(app)/forms/test-sales-tax-template.tsx (page narrow, Dialog wide), opened from the templates' list —
 * Tax Rules' Which Template? is the same shape. Rejected: the preview inside the template's own page, where it
 * was until 2026-10-19 — the human asked for it on its own, beside New Template.
 */
export function TestTemplate({ merchantId, onDismiss }: { merchantId: string; onDismiss: () => void }) {
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === merchantId);
  const settings = useSystemSettingsQuery({ merchantId }).data;
  const globals = useGlobalDefaultsQuery({ merchantId }).data;
  const currency = useCurrencyQuery({ merchantId, code: merchant?.default_currency ?? '' }).data;
  const templates = useSalesTaxTemplatesQuery({ merchantId }).data;
  if (!settings || !globals || !currency || !templates) return null;

  const money = { currency, precision: settings.currency_precision, method: asRoundingMethod(settings.rounding_method), rounded: !globals.disable_rounded_total };
  return <Check merchantId={merchantId} templates={templates} money={money} onDismiss={onDismiss} />;
}

type CheckProps = { merchantId: string; templates: SalesTaxTemplate[]; money: Money; onDismiss: () => void };

function Check({ merchantId, templates, money, onDismiss }: CheckProps) {
  // The default first: what a new sale starts with.
  const offered = [...templates].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  const { control } = useForm<Sample>({ defaultValues: { template_id: offered[0]?.id ?? '', price: '100', qty: '1', item_template_id: '' } });
  const sample = useWatch({ control });
  // An Item Tax Template's rates are its rows, which a lookup of it reads; without one the sample has no item template to pick.
  const readsItemTemplates = can(usePermissions({ merchantId }).data, 'Item Tax Template', 'select');
  const itemTemplates = useItemTaxTemplatesQuery({ merchantId }).data ?? [];

  const template = templates.find((candidate) => candidate.id === sample.template_id);
  const itemTemplate = itemTemplates.find((candidate) => candidate.id === sample.item_template_id);
  const rows = template ? formRows(template.sales_tax_template_rows) : [];
  const included = rows.some((row) => row.included_in_print_rate);

  return (
    <AdaptiveDialog
      asPage
      onDismiss={onDismiss}
      kicker="Sales Taxes and Charges Templates"
      title="Test Template"
      actions={
        <Button mode="outlined" onPress={onDismiss} contentStyle={styles.action}>
          Close
        </Button>
      }
    >
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="template_id"
          label="Template"
          span="full"
          title="Template"
          options={offered.map((candidate) => ({
            value: candidate.id,
            label: candidate.title,
            hint: [candidate.is_default ? 'Default' : null, candidate.disabled ? 'Disabled' : null].filter(Boolean).join(' · ') || undefined,
          }))}
        />
        <ControlledText control={control} name="price" label="Price" hint={included ? 'As on the shelf, tax included' : 'Before tax'} keyboardType="decimal-pad" maxLength={12} />
        <ControlledText control={control} name="qty" label="Quantity" keyboardType="decimal-pad" maxLength={8} />
        {readsItemTemplates ? (
          <ControlledSelect
            control={control}
            name="item_template_id"
            label="Item Tax Template"
            span="full"
            title="Item Tax Template"
            options={[{ value: '', label: 'None' }, ...itemTemplates.filter((candidate) => !candidate.disabled).map((candidate) => ({ value: candidate.id, label: candidate.title }))]}
          />
        ) : null}
        <Field label="The sale gets" span="full">
          {template ? (
            <Totals
              rows={rows}
              line={{ rate: Number(sample.price) || 0, qty: Number(sample.qty) || 0, itemTaxRates: itemTemplate ? itemTaxRates(itemTemplate) : undefined }}
              {...money}
            />
          ) : (
            <Text variant="bodyMedium">No template yet. Make one with New Template.</Text>
          )}
        </Field>
      </FieldGrid>
    </AdaptiveDialog>
  );
}

type TotalsProps = Money & { rows: ReturnType<typeof formRows>; line: Parameters<typeof calculateTaxes>[0][number] };

/** Net total, each row's Amount and the running Total after it (ERPNext's two columns), the grand and rounded totals. */
function Totals({ rows, line, currency, precision, method, rounded }: TotalsProps) {
  const parsed = taxRowsSchema.safeParse(rows);
  const amount = (value: number) => formatMoney(value, currency, precision, method);

  if (!parsed.success) {
    return (
      <SampleBox>
        <Text variant="bodyMedium">This template&apos;s rows don&apos;t add up as saved. Open it and fix its rows.</Text>
      </SampleBox>
    );
  }
  if (parsed.data.length === 0) {
    return (
      <SampleBox>
        <Text variant="bodyMedium">This template has no rows: a sale with it pays no tax.</Text>
      </SampleBox>
    );
  }

  const result = calculateTaxes([line], parsed.data.map(taxRow), precision, (value, places) => roundTo(value, places, method));

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
  action: { justifyContent: 'flex-start' },
});
