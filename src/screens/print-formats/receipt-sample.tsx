import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { SampleLine } from '../../components/sample-box';
import { Text } from '../../components/text';
import { useCurrencyQuery } from '../../features/currencies/queries';
import type { Currency } from '../../features/currencies/queries';
import { useGlobalDefaultsQuery } from '../../features/global-defaults/queries';
import type { GlobalDefaults } from '../../features/global-defaults/queries';
import { useLetterHeadsQuery } from '../../features/letter-heads/queries';
import type { LetterHead } from '../../features/letter-heads/queries';
import type { Merchant } from '../../features/merchants/queries';
import { itemColumns, printedTaxes } from '../../features/print-formats/receipt';
import type { ReceiptColumn } from '../../features/print-formats/receipt';
import type { PrintFormatValues } from '../../features/print-formats/schema';
import { usePrintSettingsQuery } from '../../features/print-settings/queries';
import type { PrintSettings } from '../../features/print-settings/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { calculateTaxes } from '../../features/sales-tax-templates/calculate';
import type { TaxResult } from '../../features/sales-tax-templates/calculate';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import type { SalesTaxTemplate } from '../../features/sales-tax-templates/queries';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import type { SystemSettings } from '../../features/system-settings/queries';
import { fontScaled, RECEIPT_58MM, RECEIPT_80MM } from '../../lib/columns';
import { asRoundingMethod, cashRound, formatMoney, formatNumber, moneyInWords, roundTo } from '../../lib/money';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';

// A made-up sale: two items, so a tax spread over lines and a total that rounds both show.
const SAMPLE_ITEMS = [
  { code: 'ITEM-001', name: 'Notebook', uom: 'Nos', qty: 2, rate: 120 },
  { code: 'ITEM-002', name: 'Ballpen', uom: 'Nos', qty: 3, rate: 15.5 },
];

type Saved = {
  settings: PrintSettings;
  letterHead: LetterHead | undefined;
  globals: GlobalDefaults;
  system: SystemSettings;
  currency: Currency;
  template: SalesTaxTemplate | undefined;
  /** Why the sample carries no tax, when it does not. */
  taxNote: string | undefined;
};

/**
 * The print format's unsaved values drawn as a receipt of a made-up sale — what stands in for printing until
 * the POS Invoice brings a printer. Everything else is read as saved: Print Settings, the default letter head,
 * the default Sales Taxes and Charges Template, Global Defaults' rounded total and amount in words, and the
 * company currency at System Settings' precision.
 */
export function ReceiptSample({ merchant, control }: { merchant: Merchant; control: Control<PrintFormatValues> }) {
  const settings = usePrintSettingsQuery({ merchantId: merchant.id }).data;
  const letterHeads = useLetterHeadsQuery({ merchantId: merchant.id }).data;
  const globals = useGlobalDefaultsQuery({ merchantId: merchant.id }).data;
  const system = useSystemSettingsQuery({ merchantId: merchant.id }).data;
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency }).data;
  // Every member may select the templates; their rows need the template's read, so without it the sample has no tax.
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  if (!settings || !letterHeads || !globals || !system || !currency || !templates) return null;
  const template = templates.find((candidate) => candidate.is_default && !candidate.disabled);

  return (
    <Receipt
      control={control}
      saved={{
        settings,
        letterHead: letterHeads.find((head) => head.is_default && !head.disabled),
        globals,
        system,
        currency,
        template,
        taxNote: !template
          ? 'No Sales Taxes and Charges Template is the default, so the sample carries no tax.'
          : // Said only once the permissions are in: while they load, nothing is known to be missing.
            !permissions || can(permissions, 'Sales Taxes and Charges Template', 'read')
            ? undefined
            : "Your roles can't read the default tax template's rows, so the sample carries no tax.",
      }}
    />
  );
}

/** A line of the receipt, printed only when it has something to say. */
function Printed({ text, variant, muted }: { text: string | undefined; variant: 'titleMedium' | 'bodyMedium' | 'bodySmall'; muted?: boolean }) {
  const { colors } = useAppTheme();
  if (!text) return null;

  return (
    <Text variant={variant} style={muted ? { color: colors.onSurfaceMuted } : undefined}>
      {text}
    </Text>
  );
}

/** The sample's width on a roll; a page takes the form's own measure. */
const paperWidth = (paper: string | undefined) =>
  paper === '58mm' ? { maxWidth: fontScaled(RECEIPT_58MM) } : paper === '80mm' ? { maxWidth: fontScaled(RECEIPT_80MM) } : null;

function Receipt({ control, saved }: { control: Control<PrintFormatValues>; saved: Saved }) {
  const { colors } = useAppTheme();
  const { settings, letterHead, globals, system, currency, template, taxNote } = saved;
  const format = useWatch({ control });

  const precision = system.currency_precision;
  const method = asRoundingMethod(system.rounding_method);
  const money = (value: number) => formatMoney(value, currency, precision, method);
  const rows = template?.sales_tax_template_rows ?? [];
  const sale = calculateTaxes(SAMPLE_ITEMS, rows, precision, (value, places) => roundTo(value, places, method));
  const header = settings.with_letterhead ? letterHead : undefined;
  const footerNote = format.footer_note?.trim();
  const rule = <View style={[styles.rule, { backgroundColor: colors.outlineVariant }]} />;

  return (
    <View style={styles.sample}>
      <View style={[styles.paper, { borderColor: colors.outlineVariant }, paperWidth(format.paper)]}>
        <Printed variant="bodyMedium" text={header?.content} />
        <Printed variant="titleMedium" text={format.print_heading?.trim()} />
        {rule}
        {SAMPLE_ITEMS.map((item, index) => (
          <ItemLine
            key={item.code}
            compact={settings.compact_item_print}
            columns={itemColumns(
              {
                code: item.code,
                name: item.name,
                uom: item.uom,
                qty: formatNumber(item.qty, system.number_format, 0, method),
                // As entered — the price the customer was told, tax included when a row includes it.
                rate: money(item.rate),
                amount: money(sale.items[index].amount),
              },
              { compact: settings.compact_item_print, showItemCode: format.show_item_code ?? true }
            )}
          />
        ))}
        {rule}
        <Totals
          sale={sale}
          taxes={printedTaxes(
            rows.map((row, index) => ({ description: row.description, amount: sale.rows[index].amount })),
            settings.print_taxes_with_zero_amount
          )}
          rounded={cashRound(sale.grandTotal, currency.smallest_currency_fraction_value, precision, method)}
          money={money}
          globals={globals}
          currency={currency}
        />
        {footerNote || header?.footer ? rule : null}
        <Printed variant="bodyMedium" text={footerNote} />
        <Printed variant="bodySmall" text={header?.footer} />
      </View>
      <Printed
        muted
        variant="bodySmall"
        text={settings.with_letterhead && !letterHead ? 'Print Settings prints a letter head, but none is the default: the receipt starts without one.' : undefined}
      />
      <Printed muted variant="bodySmall" text={taxNote} />
    </View>
  );
}

/** One item: compact, its Description over Qty × Rate with the Amount at the end; otherwise a line per column. */
function ItemLine({ columns, compact }: { columns: ReceiptColumn[]; compact: boolean }) {
  const { colors } = useAppTheme();

  if (compact) {
    return (
      <View>
        <Text variant="bodyMedium">{columns[0].value}</Text>
        <SampleLine label={`${columns[1].value} × ${columns[2].value}`} value={columns[3].value} />
      </View>
    );
  }

  return (
    <View>
      {columns.map((column) => (
        <View key={column.label} style={styles.pair}>
          <Text variant="bodySmall" style={[styles.label, { color: colors.onSurfaceMuted }]}>
            {column.label}
          </Text>
          <Text variant="bodyMedium" style={styles.fill}>
            {column.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type TotalsProps = {
  sale: TaxResult;
  /** The tax rows that print (receipt.ts). */
  taxes: { description: string; amount: number }[];
  rounded: number;
  money: (value: number) => string;
  globals: GlobalDefaults;
  currency: Currency;
};

/** Net total, the taxes, the grand total, and Global Defaults' two lines: the rounded total and the amount in words. */
function Totals({ sale, taxes, rounded, money, globals, currency }: TotalsProps) {
  return (
    <>
      <SampleLine label="Net Total" value={money(sale.netTotal)} />
      {taxes.map((tax, index) => (
        <SampleLine key={`${index}:${tax.description}`} label={tax.description} value={money(tax.amount)} />
      ))}
      <SampleLine label="Grand Total" value={money(sale.grandTotal)} />
      {globals.disable_rounded_total ? null : <SampleLine label="Rounded Total" value={money(rounded)} />}
      <Printed
        muted
        variant="bodySmall"
        text={globals.disable_in_words ? undefined : moneyInWords(globals.disable_rounded_total ? sale.grandTotal : rounded, currency)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sample: { gap: spacing.sm },
  paper: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.sm },
  rule: { height: 1 },
  pair: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  label: { flexBasis: '34%' },
});
