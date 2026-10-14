import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Printed, Receipt, receiptLetterHead, useReceiptRecords } from '../../components/receipt';
import type { Merchant } from '../../features/merchants/queries';
import type { PrintFormatValues } from '../../features/print-formats/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { calculateTaxes } from '../../features/sales-tax-templates/calculate';
import { useSalesTaxTemplatesQuery } from '../../features/sales-tax-templates/queries';
import { asRoundingMethod, cashRound, roundTo } from '../../lib/money';
import { spacing } from '../../themes';

// A made-up sale: two items, so a tax spread over lines and a total that rounds both show.
const SAMPLE_ITEMS = [
  { code: 'ITEM-001', name: 'Notebook', uom: 'Nos', qty: 2, rate: 120 },
  { code: 'ITEM-002', name: 'Ballpen', uom: 'Nos', qty: 3, rate: 15.5 },
];

/**
 * The print format's unsaved values drawn as a receipt of a made-up sale (src/components/receipt.tsx).
 * Everything else is read as saved: Print Settings, the default letter head, the default Sales Taxes and
 * Charges Template, Global Defaults' rounded total and amount in words, and the company currency at System
 * Settings' precision.
 */
export function ReceiptSample({ merchant, control }: { merchant: Merchant; control: Control<PrintFormatValues> }) {
  const records = useReceiptRecords(merchant);
  // Every member may select the templates; their rows need the template's read, so without it the sample has no tax.
  const templates = useSalesTaxTemplatesQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const format = useWatch({ control });
  if (!records || !templates) return null;

  const { settings, system, currency } = records;
  const template = templates.find((candidate) => candidate.is_default && !candidate.disabled);
  const rows = template?.sales_tax_template_rows ?? [];
  const precision = system.currency_precision;
  const method = asRoundingMethod(system.rounding_method);
  const sale = calculateTaxes(SAMPLE_ITEMS, rows, precision, (value, places) => roundTo(value, places, method));
  const taxNote = !template
    ? 'No Sales Taxes and Charges Template is the default, so the sample carries no tax.'
    : // Said only once the permissions are in: while they load, nothing is known to be missing.
      !permissions || can(permissions, 'Sales Taxes and Charges Template', 'select')
      ? undefined
      : "You can't look up the default tax template's rows, so the sample carries no tax.";

  return (
    <View style={styles.sample}>
      <Receipt
        records={records}
        format={format}
        items={SAMPLE_ITEMS.map((item, index) => ({ ...item, amount: sale.items[index].amount }))}
        taxes={rows.map((row, index) => ({ description: row.description, amount: sale.rows[index].amount }))}
        netTotal={sale.netTotal}
        grandTotal={sale.grandTotal}
        roundedTotal={cashRound(sale.grandTotal, currency.smallest_currency_fraction_value, precision, method)}
      />
      <Printed
        muted
        variant="bodySmall"
        text={
          settings.with_letterhead && !receiptLetterHead(records) ? 'Print Settings prints a letter head, but none is the default: the receipt starts without one.' : undefined
        }
      />
      <Printed muted variant="bodySmall" text={taxNote} />
    </View>
  );
}

const styles = StyleSheet.create({
  sample: { gap: spacing.sm },
});
