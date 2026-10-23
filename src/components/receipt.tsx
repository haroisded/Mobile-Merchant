import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTotalsSettings } from '../features/currencies/queries';
import type { Currency } from '../features/currencies/queries';
import type { GlobalDefaults } from '../features/global-defaults/queries';
import { useLetterHeadsQuery } from '../features/letter-heads/queries';
import type { LetterHead } from '../features/letter-heads/queries';
import type { Merchant } from '../features/merchants/queries';
import { itemColumns, printedTaxes } from '../features/print-formats/receipt';
import type { ReceiptColumn } from '../features/print-formats/receipt';
import { usePrintSettingsQuery } from '../features/print-settings/queries';
import type { PrintSettings } from '../features/print-settings/queries';
import type { SystemSettings } from '../features/system-settings/queries';
import { fontScaled, RECEIPT_58MM, RECEIPT_80MM } from '../lib/columns';
import { asRoundingMethod, formatMoney, formatNumber, moneyInWords } from '../lib/money';
import { useAppTheme } from '../lib/theme';
import { radius, spacing } from '../themes';
import { Icon } from './icon';
import { SampleLine } from './sample-box';
import { Text } from './text';

// The receipt, drawn on screen — what stands in for a printer (the human's decision of 2026-10-11: reprint is
// reopening the sale from Orders). Two screens draw one: a Print Format's sample of a made-up sale
// (src/screens/print-formats/receipt-sample.tsx) and a POS Invoice (src/screens/pos-orders/pos-invoice.tsx).

export type ReceiptRecords = { settings: PrintSettings; letterHeads: LetterHead[]; globals: GlobalDefaults; system: SystemSettings; currency: Currency };

/**
 * What every receipt reads as saved: Print Settings, the letter heads, Global Defaults' rounded total and
 * amount in words, and the company currency at System Settings' precision. Undefined until all have loaded.
 */
export function useReceiptRecords(merchant: Pick<Merchant, 'id' | 'default_currency'>): ReceiptRecords | undefined {
  const settings = usePrintSettingsQuery({ merchantId: merchant.id }).data;
  const letterHeads = useLetterHeadsQuery({ merchantId: merchant.id }).data;
  const totals = useTotalsSettings(merchant);

  return settings && letterHeads && totals ? { settings, letterHeads, ...totals } : undefined;
}

/** The letter head a receipt prints under: the one named, else the default — none when Print Settings prints none. */
export const receiptLetterHead = (records: ReceiptRecords, letterHeadId?: string | null) =>
  records.settings.with_letterhead
    ? (records.letterHeads.find((head) => head.id === letterHeadId && !head.disabled) ?? records.letterHeads.find((head) => head.is_default && !head.disabled))
    : undefined;

type Props = {
  records: ReceiptRecords;
  /** The print format: saved for a sale, a form's unsaved values for its sample. */
  format: { paper?: string; print_heading?: string; footer_note?: string; show_item_code?: boolean };
  /** The letter head a POS Profile names. */
  letterHeadId?: string | null;
  /** Lines under the heading: the sale's number, its date. */
  meta?: string[];
  /** `rate` as entered — the price the customer was told, tax included when a row includes it. */
  items: { code: string; name: string; uom: string; qty: number; rate: number; amount: number }[];
  taxes: { description: string; amount: number }[];
  /** Above the Net Total, which is already less them: what the lines' own discounts and the additional one took. */
  discounts?: { label: string; amount: number }[];
  netTotal: number;
  grandTotal: number;
  /** The grand total at the smallest coin; printed unless Global Defaults disables it. */
  roundedTotal: number;
  /** After the totals: what was paid by each method, and the change. */
  payments?: { label: string; amount: number }[];
  /** Over everything, under a success check: the store, and what just happened ("Refund successful"). A sale's page only. */
  banner?: { title: string; subtitle?: string };
};

/** A line of the receipt, printed only when it has something to say. */
export function Printed({ text, variant, muted }: { text: string | undefined; variant: 'titleMedium' | 'bodyMedium' | 'bodySmall'; muted?: boolean }) {
  const { colors } = useAppTheme();
  if (!text) return null;

  return (
    <Text variant={variant} style={muted ? { color: colors.onSurfaceMuted } : undefined}>
      {text}
    </Text>
  );
}

/** The success check: a 56dp circle in `successContainer`, centred over what it confirms. */
export function SuccessMark() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.mark, { backgroundColor: colors.successContainer }]}>
      <Icon source="check" size={28} color={colors.success} />
    </View>
  );
}

/** The receipt's width on a roll; a page takes its container's own measure. */
export const paperWidth = (paper: string | undefined) =>
  paper === '58mm' ? { maxWidth: fontScaled(RECEIPT_58MM) } : paper === '80mm' ? { maxWidth: fontScaled(RECEIPT_80MM) } : null;

export function Receipt({ records, format, letterHeadId, meta, items, taxes, discounts, netTotal, grandTotal, roundedTotal, payments, banner }: Props) {
  const { colors } = useAppTheme();
  const { settings, globals, system, currency } = records;

  const method = asRoundingMethod(system.rounding_method);
  const money = (value: number) => formatMoney(value, currency, system.currency_precision, method);
  const header = receiptLetterHead(records, letterHeadId);
  const footerNote = format.footer_note?.trim();
  const rule = <View style={[styles.rule, { backgroundColor: colors.outlineVariant }]} />;

  return (
    <View style={[styles.paper, { borderColor: colors.outlineVariant }, paperWidth(format.paper)]}>
      <Banner banner={banner} />
      <Printed variant="bodyMedium" text={header?.content} />
      <Printed variant="titleMedium" text={format.print_heading?.trim()} />
      {meta?.map((line) => (
        <Printed key={line} muted variant="bodySmall" text={line} />
      ))}
      {rule}
      {items.map((item, index) => (
        <ItemLine
          key={`${index}:${item.code}`}
          compact={settings.compact_item_print}
          columns={itemColumns(
            { code: item.code, name: item.name, uom: item.uom, qty: formatNumber(item.qty, system.number_format, 0, method), rate: money(item.rate), amount: money(item.amount) },
            { compact: settings.compact_item_print, showItemCode: format.show_item_code ?? true }
          )}
        />
      ))}
      {rule}
      <AmountLines lines={discounts} money={money} />
      <SampleLine label="Net Total" value={money(netTotal)} />
      {printedTaxes(taxes, settings.print_taxes_with_zero_amount).map((tax, index) => (
        <SampleLine key={`${index}:${tax.description}`} label={tax.description} value={money(tax.amount)} />
      ))}
      <SampleLine label="Grand Total" value={money(grandTotal)} />
      {globals.disable_rounded_total ? null : <SampleLine label="Rounded Total" value={money(roundedTotal)} />}
      <Printed muted variant="bodySmall" text={globals.disable_in_words ? undefined : moneyInWords(globals.disable_rounded_total ? grandTotal : roundedTotal, currency)} />
      <AmountLines lines={payments} money={money} lead={rule} />
      {footerNote || header?.footer ? rule : null}
      <Printed variant="bodyMedium" text={footerNote} />
      <Printed variant="bodySmall" text={header?.footer} />
    </View>
  );
}

/** The success check over the receipt, with the store and what just happened under it. Nothing for none. */
function Banner({ banner }: { banner: Props['banner'] }) {
  if (!banner) return null;

  return (
    <View style={styles.banner}>
      <SuccessMark />
      <Printed variant="titleMedium" text={banner.title} />
      <Printed muted variant="bodySmall" text={banner.subtitle} />
    </View>
  );
}

type AmountLinesProps = {
  lines: { label: string; amount: number }[] | undefined;
  money: (value: number) => string;
  /** Drawn above the lines when there are any: the rule that sets the payments off from the totals. */
  lead?: ReactNode;
};

/** A run of label-and-amount lines: the discounts above the Net Total, the payments under the totals. Nothing for none. */
function AmountLines({ lines = [], money, lead }: AmountLinesProps) {
  if (lines.length === 0) return null;

  return (
    <>
      {lead}
      {lines.map((line, index) => (
        <SampleLine key={`${index}:${line.label}`} label={line.label} value={money(line.amount)} />
      ))}
    </>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  paper: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.sm },
  rule: { height: 1 },
  banner: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  // A fixed-size control (.claude/instruction_mds/frontend.md §4.6): the check's circle.
  mark: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  label: { flexBasis: '34%' },
});
