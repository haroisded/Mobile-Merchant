import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { DocumentHeader, DocumentState } from '../../components/document-page';
import { useVoucherRoutes } from '../../components/ledger-filters';
import { Receipt, useReceiptRecords } from '../../components/receipt';
import { SectionHeading } from '../../components/section-heading';
import { useMoney } from '../../features/currencies/queries';
import { useItemsQuery } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { returnableLines } from '../../features/pos-invoices/cart';
import { invalidatePosInvoices, usePosInvoiceQuery, usePosInvoiceReturnsQuery } from '../../features/pos-invoices/queries';
import type { PosInvoiceDocument } from '../../features/pos-invoices/queries';
import { usePosProfilesQuery } from '../../features/pos-profiles/queries';
import { usePrintFormatsQuery } from '../../features/print-formats/queries';
import { has, usePermissions } from '../../features/role-permissions/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { displayDate } from '../../lib/dates';
import { FORM_MEASURE } from '../../lib/columns';
import { spacing } from '../../themes';

/**
 * One POS Invoice: its receipt, as the sale's POS Profile prints it — the profile's Print Format and Letter
 * Head, else the default ones. Opened from Orders, by a sale that prints its receipt, and by a ledger row.
 * From here a sale is returned, voided (Cancel) and, once cancelled, deleted
 * (POS-System-Added-Features 19.1–19.2).
 */
export function PosInvoicePage({ merchant, docId }: { merchant: Merchant; docId: string }) {
  const invoice = usePosInvoiceQuery({ id: docId });
  if (!invoice.data) return <DocumentState doctype="POS Invoice" query={invoice} />;

  return <Invoice merchant={merchant} invoice={invoice.data} />;
}

function Invoice({ merchant, invoice }: { merchant: Merchant; invoice: PosInvoiceDocument }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const routes = useVoucherRoutes(merchant.id);
  const money = useMoney(merchant);
  // The returns made against a sale; a return has none.
  const returns = usePosInvoiceReturnsQuery({ returnAgainst: invoice.id }).data ?? [];
  // A submitted sale with something left of it, for someone who may take returns.
  const returnable =
    invoice.docstatus === 1 && !invoice.is_return && has(permissions, 'process_refunds') && returnableLines(invoice, returns).some((row) => row.left > 0);

  return (
    <View style={styles.fill}>
      <DocumentHeader
        merchantId={merchant.id}
        doctype="POS Invoice"
        document={invoice}
        invalidate={invalidatePosInvoices}
        cancelBody={
          invoice.is_return
            ? 'The refund is undone: the stock leaves again and the ledgers are reversed. It cannot be submitted again.'
            : 'The sale is voided: the stock comes back and the ledgers are reversed. It cannot be submitted again.'
        }
        note={invoice.is_return ? `Return against ${invoice.return_against_name ?? 'a sale'}` : undefined}
        extra={
          returnable
            ? [
                <Button key="return" mode="outlined" onPress={() => routes.openReturn(invoice.id)}>
                  Return
                </Button>,
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <InvoiceReceipt merchant={merchant} invoice={invoice} />
        {returns.length > 0 ? (
          <>
            <SectionHeading title="Returns" hint="What has been returned against this sale. Open one for its receipt." />
            {returns.map((made) => (
              <Button key={made.id} mode="outlined" style={styles.open} onPress={() => routes.openDocument('POS Invoice', made.id)}>
                {`${made.name} · ${money(made.rounded_total)}`}
              </Button>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A name the invoice holds only the id of. Hidden from the reader's roles, it prints as `fallback`. */
const named = <T extends { id: string }>(rows: T[] | undefined, id: string, name: (row: T) => string, fallback: string) => {
  const row = rows?.find((candidate) => candidate.id === id);
  return row ? name(row) : fallback;
};

/**
 * The sale's payments as the receipt lists them: each method, then the change handed back and anything
 * written off. A return's are what was handed back, below zero as it stores them, each under "Refund".
 */
const paymentLines = (invoice: PosInvoiceDocument, modeName: (id: string) => string) =>
  [
    ...invoice.pos_invoice_payments.map((payment) => ({ label: invoice.is_return ? `Refund · ${modeName(payment.mode_of_payment_id)}` : modeName(payment.mode_of_payment_id), amount: payment.amount })),
    { label: 'Change', amount: invoice.change_amount },
    { label: 'Write Off', amount: invoice.write_off_amount },
  ].filter((line) => line.amount !== 0);

/**
 * What the sale's discounts took (20.1, 20.2), as the receipt lists them above its Net Total: the lines' own
 * against their Price List Rates, then the additional one. Below zero on a sale; a return hands them back.
 */
const discountLines = (invoice: PosInvoiceDocument) =>
  [
    { label: 'Item Discount', amount: -invoice.pos_invoice_items.reduce((sum, line) => sum + line.qty * line.discount_amount, 0) },
    {
      label: invoice.additional_discount_percentage ? `Additional Discount (${invoice.additional_discount_percentage}%)` : 'Additional Discount',
      amount: -invoice.discount_amount,
    },
  ].filter((line) => line.amount !== 0);

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
      meta={[invoice.name, displayDate(invoice.posting_date), ...(invoice.is_return ? [`Return against ${invoice.return_against_name ?? 'a sale'}`] : [])]}
      items={invoice.pos_invoice_items.map((line) => ({
        code: named(items, line.item_id, (item) => item.item_code, ''),
        name: line.item_name ?? '',
        uom: named(uoms, line.uom_id, (uom) => uom.uom_name, ''),
        qty: line.qty,
        rate: line.rate,
        amount: line.amount,
      }))}
      taxes={invoice.pos_invoice_taxes.map((tax) => ({ description: tax.description, amount: tax.tax_amount }))}
      discounts={discountLines(invoice)}
      netTotal={invoice.net_total}
      grandTotal={invoice.grand_total}
      roundedTotal={invoice.rounded_total}
      payments={paymentLines(invoice, (id) => named(modes, id, (mode) => mode.mode_of_payment, 'Paid'))}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: spacing.ms, padding: spacing.md, width: '100%', maxWidth: FORM_MEASURE },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  open: { justifyContent: 'flex-start' },
});
