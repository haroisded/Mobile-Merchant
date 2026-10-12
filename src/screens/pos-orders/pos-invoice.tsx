import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { DocumentState } from '../../components/document-page';
import { useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { Receipt, useReceiptRecords } from '../../components/receipt';
import { DOCSTATUS } from '../../features/documents/queries';
import { useItemsQuery } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { usePosInvoiceQuery } from '../../features/pos-invoices/queries';
import type { PosInvoiceDocument } from '../../features/pos-invoices/queries';
import { usePosProfilesQuery } from '../../features/pos-profiles/queries';
import { usePrintFormatsQuery } from '../../features/print-formats/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { displayDate } from '../../lib/dates';
import { spacing } from '../../themes';

/**
 * One POS Invoice: its receipt, as the sale's POS Profile prints it — the profile's Print Format and Letter
 * Head, else the default ones. Opened from Orders, by a sale that prints its receipt, and by a ledger row.
 */
export function PosInvoicePage({ merchant, docId }: { merchant: Merchant; docId: string }) {
  const invoice = usePosInvoiceQuery({ id: docId });
  if (!invoice.data) return <DocumentState doctype="POS Invoice" query={invoice} />;

  return <Invoice merchant={merchant} invoice={invoice.data} />;
}

function Invoice({ merchant, invoice }: { merchant: Merchant; invoice: PosInvoiceDocument }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const routes = useVoucherRoutes(merchant.id);
  // Each report opens narrowed to this sale.
  const voucher = { voucher: invoice.name };

  const actions = [
    can(permissions, 'Stock Ledger Entry', 'read') ? (
      <Button key="stock-ledger" mode="outlined" onPress={() => routes.openReport('stock-ledger', voucher)}>
        Stock Ledger
      </Button>
    ) : null,
    can(permissions, 'GL Entry', 'read') ? (
      <Button key="general-ledger" mode="outlined" onPress={() => routes.openReport('general-ledger', voucher)}>
        General Ledger
      </Button>
    ) : null,
  ].filter((action) => action !== null);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="POS Invoice" title={invoice.name} meta={DOCSTATUS[invoice.docstatus]} onBack={() => router.back()} actions={actions.length > 0 ? actions : null} />
      <ScrollView contentContainerStyle={styles.body}>
        <InvoiceReceipt merchant={merchant} invoice={invoice} />
      </ScrollView>
    </View>
  );
}

/** A name the invoice holds only the id of. Hidden from the reader's roles, it prints as `fallback`. */
const named = <T extends { id: string }>(rows: T[] | undefined, id: string, name: (row: T) => string, fallback: string) => {
  const row = rows?.find((candidate) => candidate.id === id);
  return row ? name(row) : fallback;
};

/** The sale's payments as the receipt lists them: each method, then the change handed back and anything written off. */
const paymentLines = (invoice: PosInvoiceDocument, modeName: (id: string) => string) =>
  [
    ...invoice.pos_invoice_payments.map((payment) => ({ label: modeName(payment.mode_of_payment_id), amount: payment.amount })),
    { label: 'Change', amount: invoice.change_amount },
    { label: 'Write Off', amount: invoice.write_off_amount },
  ].filter((line) => line.amount > 0);

function InvoiceReceipt({ merchant, invoice }: { merchant: Merchant; invoice: PosInvoiceDocument }) {
  const args = { merchantId: merchant.id };
  const records = useReceiptRecords(merchant);
  const items = useItemsQuery(args).data;
  const uoms = useUomsQuery(args).data;
  const modes = useModesOfPaymentQuery(args).data;
  const profile = usePosProfilesQuery(args).data?.find((candidate) => candidate.id === invoice.pos_profile_id);
  const formats = usePrintFormatsQuery(args).data?.filter((candidate) => !candidate.disabled);
  if (!records) return <ActivityIndicator />;

  return (
    <Receipt
      records={records}
      format={formats?.find((candidate) => candidate.id === profile?.print_format) ?? formats?.find((candidate) => candidate.is_default) ?? {}}
      letterHeadId={profile?.letter_head}
      meta={[invoice.name, displayDate(invoice.posting_date)]}
      items={invoice.pos_invoice_items.map((line) => ({
        code: named(items, line.item_id, (item) => item.item_code, ''),
        name: line.item_name ?? '',
        uom: named(uoms, line.uom_id, (uom) => uom.uom_name, ''),
        qty: line.qty,
        rate: line.rate,
        amount: line.amount,
      }))}
      taxes={invoice.pos_invoice_taxes.map((tax) => ({ description: tax.description, amount: tax.tax_amount }))}
      netTotal={invoice.net_total}
      grandTotal={invoice.grand_total}
      roundedTotal={invoice.rounded_total}
      payments={paymentLines(invoice, (id) => named(modes, id, (mode) => mode.mode_of_payment, 'Paid'))}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: 720 },
});
