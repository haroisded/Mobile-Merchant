import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { BottomSpacer } from '../../components/bottom-spacer';
import { Button } from '../../components/button';
import { DocumentState, useDocumentActions } from '../../components/document-page';
import { useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { paperWidth, Receipt, useReceiptRecords } from '../../components/receipt';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { useBackAs } from '../../components/use-back-as';
import { useMoney } from '../../features/currencies/queries';
import { DOCSTATUS } from '../../features/documents/queries';
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
import { FORM_MEASURE } from '../../lib/columns';
import { displayDate } from '../../lib/dates';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/**
 * One POS Invoice: its receipt, as the sale's POS Profile prints it — the profile's Print Format and Letter
 * Head, else the default ones. Opened from Orders, by a sale that prints its receipt, and by a ledger row.
 * From here a sale is refunded, voided (Cancel) and, once cancelled, deleted (POS-System-Added-Features 19.1–19.2).
 *
 * `after`: opened by the sale just made (src/screens/register/cart.tsx). There is nothing to go back to — the payment
 * is gone — so no back arrow: Return to Register instead, and Back does the same. Opened from Orders or a ledger, the
 * page keeps its back arrow and has no Return to Register (the human, 2026-10-23).
 */
export function PosInvoicePage({ merchant, docId, after = false }: { merchant: Merchant; docId: string; after?: boolean }) {
  const invoice = usePosInvoiceQuery({ id: docId });
  if (!invoice.data) return <DocumentState doctype="POS Invoice" query={invoice} />;

  return <Invoice merchant={merchant} invoice={invoice.data} after={after} />;
}

/** The header's line: the sale's status, and for a refund the sale it refunds. */
const statusLine = (invoice: PosInvoiceDocument) =>
  invoice.is_return ? `${DOCSTATUS[invoice.docstatus]} · Return against ${invoice.return_against_name ?? 'a sale'}` : DOCSTATUS[invoice.docstatus];

/** The check over a receipt that stands: a voided sale is not a success. */
const bannerOf = (invoice: PosInvoiceDocument, store: string) =>
  invoice.docstatus === 1 ? { title: store, subtitle: invoice.is_return ? 'Refund successful' : undefined } : undefined;

function Invoice({ merchant, invoice, after }: { merchant: Merchant; invoice: PosInvoiceDocument; after: boolean }) {
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const routes = useVoucherRoutes(merchant.id);
  // The refunds made against a sale; a refund has none.
  const returns = usePosInvoiceReturnsQuery({ returnAgainst: invoice.id }).data ?? [];
  // A submitted sale with something left of it, for someone who may take refunds.
  const returnable =
    invoice.docstatus === 1 && !invoice.is_return && has(permissions, 'process_refunds') && returnableLines(invoice, returns).some((row) => row.left > 0);
  const { allow, ask, reports } = useDocumentActions({
    merchantId: merchant.id,
    doctype: 'POS Invoice',
    document: invoice,
    invalidate: invalidatePosInvoices,
    cancelBody: invoice.is_return
      ? 'The refund is undone: the stock leaves again and the ledgers are reversed. It cannot be submitted again.'
      : 'The sale is voided: the stock comes back and the ledgers are reversed. It cannot be submitted again.',
  });
  useBackAs(after ? routes.toRegister : null);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="POS Invoice"
        title={invoice.name}
        meta={statusLine(invoice)}
        onBack={after ? undefined : () => router.back()}
        // A cancelled sale's Delete, where Accounts Settings let its entries go: the one action left in the header.
        actions={allow.remove ? <DeleteButton onPress={ask.remove} /> : null}
      />
      {ask.dialog}
      <ScrollView contentContainerStyle={styles.body}>
        <InvoiceReceipt
          merchant={merchant}
          source={invoice}
          banner={bannerOf(invoice, merchant.name)}
          above={
            <View style={styles.heading}>
              <Text variant="headlineSmall" style={styles.title}>
                {invoice.is_return ? 'Refund' : 'Receipt'}
              </Text>
              {reports}
            </View>
          }
        >
          <SaleButtons onRefund={returnable ? () => routes.openReturn(invoice.id) : undefined} onCancel={allow.cancel ? ask.cancel : undefined} />
          {after ? (
            <Button mode="outlined" onPress={routes.toRegister}>
              Return to Register
            </Button>
          ) : null}
          <Refunds merchant={merchant} returns={returns} onOpen={(id) => routes.openDocument('POS Invoice', id)} />
        </InvoiceReceipt>
        <BottomSpacer />
      </ScrollView>
    </View>
  );
}

/** A cancelled sale's Delete, in the error colour. */
function DeleteButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Button mode="outlined" textColor={colors.error} icon="delete" onPress={onPress}>
      Delete
    </Button>
  );
}

/** Under the receipt, side by side: Refund where something is left to take back, Cancel where the sale may be voided. */
function SaleButtons({ onRefund, onCancel }: { onRefund: (() => void) | undefined; onCancel: (() => void) | undefined }) {
  const { colors } = useAppTheme();
  if (!onRefund && !onCancel) return null;

  return (
    <View style={styles.pair}>
      {onRefund ? (
        <Button mode="contained" style={styles.half} onPress={onRefund}>
          Refund
        </Button>
      ) : null}
      {onCancel ? (
        <Button mode="contained" buttonColor={colors.error} textColor={colors.onError} style={styles.half} onPress={onCancel}>
          Cancel
        </Button>
      ) : null}
    </View>
  );
}

type Returns = NonNullable<ReturnType<typeof usePosInvoiceReturnsQuery>['data']>;

/** The refunds made against the sale, each opening its own receipt. Nothing for none. */
function Refunds({ merchant, returns, onOpen }: { merchant: Merchant; returns: Returns; onOpen: (id: string) => void }) {
  const money = useMoney(merchant);
  if (returns.length === 0) return null;

  return (
    <>
      <SectionHeading title="Refunds" hint="What has been refunded against this sale. Open one for its receipt." />
      {returns.map((made) => (
        <Button key={made.id} mode="outlined" contentStyle={styles.open} onPress={() => onOpen(made.id)}>
          {`${made.name} · ${money(made.rounded_total)}`}
        </Button>
      ))}
    </>
  );
}

type Line = PosInvoiceDocument['pos_invoice_items'][number];

/** What a receipt prints of a POS Invoice: a saved one, or a refund not sent yet (src/screens/pos-orders/pos-return.tsx). */
type ReceiptSource = Pick<
  PosInvoiceDocument,
  | 'pos_profile_id'
  | 'name'
  | 'posting_date'
  | 'is_return'
  | 'return_against_name'
  | 'net_total'
  | 'grand_total'
  | 'rounded_total'
  | 'change_amount'
  | 'write_off_amount'
  | 'additional_discount_percentage'
  | 'discount_amount'
> & {
  pos_invoice_items: Pick<Line, 'item_id' | 'item_name' | 'uom_id' | 'qty' | 'rate' | 'amount' | 'discount_amount'>[];
  pos_invoice_taxes: { description: string; tax_amount: number }[];
  pos_invoice_payments: { mode_of_payment_id: string; amount: number }[];
};

/** A name the invoice holds only the id of. Hidden from the reader's roles, it prints as `fallback`. */
const named = <T extends { id: string }>(rows: T[] | undefined, id: string, name: (row: T) => string, fallback: string) => {
  const row = rows?.find((candidate) => candidate.id === id);
  return row ? name(row) : fallback;
};

/**
 * The sale's payments as the receipt lists them: each method, then the change handed back and anything
 * written off. A return's are what was handed back, below zero as it stores them, each under "Refund".
 */
const paymentLines = (invoice: ReceiptSource, modeName: (id: string) => string) =>
  [
    ...invoice.pos_invoice_payments.map((payment) => ({ label: invoice.is_return ? `Refund · ${modeName(payment.mode_of_payment_id)}` : modeName(payment.mode_of_payment_id), amount: payment.amount })),
    { label: 'Change', amount: invoice.change_amount },
    { label: 'Write Off', amount: invoice.write_off_amount },
  ].filter((line) => line.amount !== 0);

/**
 * What the sale's discounts took (20.1, 20.2), as the receipt lists them above its Net Total: the lines' own
 * against their Price List Rates, then the additional one. Below zero on a sale; a return hands them back.
 */
const discountLines = (invoice: ReceiptSource) =>
  [
    { label: 'Item Discount', amount: -invoice.pos_invoice_items.reduce((sum, line) => sum + line.qty * line.discount_amount, 0) },
    {
      label: invoice.additional_discount_percentage ? `Additional Discount (${invoice.additional_discount_percentage}%)` : 'Additional Discount',
      amount: -invoice.discount_amount,
    },
  ].filter((line) => line.amount !== 0);

type ReceiptProps = {
  merchant: Merchant;
  source: ReceiptSource;
  banner?: { title: string; subtitle?: string };
  /** Over the receipt, at its width: the page's "Receipt" heading and the reports beside it. */
  above?: ReactNode;
  /** Under it, at its width: the sale's buttons. */
  children?: ReactNode;
};

/** The receipt with what goes over and under it, all held to the paper's width and centred — a roll's, or a form's for A4. */
export function InvoiceReceipt({ merchant, source, banner, above, children }: ReceiptProps) {
  const args = { merchantId: merchant.id };
  const records = useReceiptRecords(merchant);
  const items = useItemsQuery(args).data;
  const uoms = useUomsQuery(args).data;
  const modes = useModesOfPaymentQuery(args).data;
  const profile = usePosProfilesQuery(args).data?.find((candidate) => candidate.id === source.pos_profile_id);
  const formats = usePrintFormatsQuery(args).data?.filter((candidate) => !candidate.disabled);
  const format = formats?.find((candidate) => candidate.id === profile?.print_format) ?? formats?.find((candidate) => candidate.is_default);
  if (!records) return <ActivityIndicator />;

  return (
    <View style={[styles.column, paperWidth(format?.paper)]}>
      {above}
      <Receipt
        records={records}
        format={format ?? {}}
        letterHeadId={profile?.letter_head}
        banner={banner}
        meta={[source.name, displayDate(source.posting_date), ...(source.is_return ? [`Return against ${source.return_against_name ?? 'a sale'}`] : [])]}
        items={source.pos_invoice_items.map((line) => ({
          code: named(items, line.item_id, (item) => item.item_code, ''),
          name: line.item_name ?? '',
          uom: named(uoms, line.uom_id, (uom) => uom.uom_name, ''),
          qty: line.qty,
          rate: line.rate,
          amount: line.amount,
        }))}
        taxes={source.pos_invoice_taxes.map((tax) => ({ description: tax.description, amount: tax.tax_amount }))}
        discounts={discountLines(source)}
        netTotal={source.net_total}
        grandTotal={source.grand_total}
        roundedTotal={source.rounded_total}
        payments={paymentLines(source, (id) => named(modes, id, (mode) => mode.mode_of_payment, 'Paid'))}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: spacing.md },
  column: { gap: spacing.ms, width: '100%', maxWidth: FORM_MEASURE, alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  title: { flexGrow: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  open: { justifyContent: 'flex-start' },
});
