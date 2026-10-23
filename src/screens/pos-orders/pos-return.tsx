import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { sendOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { DocumentState } from '../../components/document-page';
import { FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { HelperText } from '../../components/helper-text';
import { useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { buildReturn, refundMethod, returnableLines, returnPayload } from '../../features/pos-invoices/cart';
import { useCheckoutMutation, usePosInvoiceQuery, usePosInvoiceReturnsQuery } from '../../features/pos-invoices/queries';
import type { PosInvoiceDocument } from '../../features/pos-invoices/queries';
import { useReturnRounding } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { useBottomInset } from '../../lib/columns';
import { todayDate } from '../../lib/dates';
import { failureMessage, mutationNotice, postingRefusal } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { radius, spacing } from '../../themes';
import { NumberField } from '../register/cart-line';
import { InvoiceReceipt, useBackAs } from './pos-invoice';

/**
 * The refund of a sale (docs.frappe.io/erpnext/sales-return; POS-System-Added-Features 19.1): what to take back of
 * each line and what that refunds — rung in the cashier's own open session, so the refund comes out of the drawer
 * that session counts. Approve Refund shows the refund's receipt; nothing is saved until Return to Register sends it
 * as calculated from the sale's stored figures and the database checks and posts it (public.pos_checkout). Cancel
 * goes back to the quantities as they were left (the human, 2026-10-23).
 */
export function PosReturnPage({ merchant, docId }: { merchant: Merchant; docId: string }) {
  const invoice = usePosInvoiceQuery({ id: docId });
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!invoice.data) return <DocumentState doctype="POS Invoice" query={invoice} />;
  if (!session || !profile) return <SessionState title="Refund" query={query} />;

  return <Return merchant={merchant} invoice={invoice.data} session={session} profile={profile} />;
}

type Props = { merchant: Merchant; invoice: PosInvoiceDocument; session: PosOpeningEntry; profile: PosProfile };

function Return(props: Props) {
  const { merchant, invoice, session } = props;
  const returns = usePosInvoiceReturnsQuery({ returnAgainst: invoice.id }).data;
  const rounding = useReturnRounding(merchant);
  if (returns && rounding) return <ReturnForm {...props} returns={returns} rounding={rounding} />;

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Refund" title={invoice.name} meta={`Session ${session.name}`} onBack={() => router.back()} form />
      <View style={styles.state}>
        <ActivityIndicator />
      </View>
    </View>
  );
}

type FormProps = Props & {
  returns: NonNullable<ReturnType<typeof usePosInvoiceReturnsQuery>['data']>;
  rounding: NonNullable<ReturnType<typeof useReturnRounding>>;
};

type Left = ReturnType<typeof returnableLines>;

/** What stands between the form and Approve Refund, in words; null when it can be approved. */
function whatStops(left: Left, taking: ReadonlyMap<string, number>, total: number, method: string | undefined) {
  if (left.every((row) => row.left <= 0)) return 'Everything on this sale has already been refunded.';
  const over = left.find((row) => (taking.get(row.line.id) ?? 0) > row.left);
  if (over) return `Only ${over.left} of ${over.line.item_name ?? 'that item'} is left to return.`;
  if (total <= 0) return 'Enter a quantity to return.';
  return method ? null : 'The POS Profile allows no payment method in returns. Tick Allow in Returns on one in its Payment Methods.';
}

function ReturnForm({ merchant, invoice, session, profile, returns, rounding }: FormProps) {
  const { colors } = useAppTheme();
  const money = useMoney(merchant);
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  // What the cashier typed, by line; a line not in here returns all that is left of it.
  const [quantities, setQuantities] = useState<Record<string, number | null>>({});
  // Approved: the refund's receipt, not yet sent. Cancel comes back here with the quantities kept.
  const [approved, setApproved] = useState(false);

  const left = returnableLines(invoice, returns);
  const taking = new Map(left.map((row) => [row.line.id, row.line.id in quantities ? (quantities[row.line.id] ?? 0) : row.left]));
  // A quantity over what is left is said by whatStops, which keeps it from being approved.
  const made = buildReturn(invoice, taking, rounding);
  const total = -made.roundedTotal;
  // All of it goes back by one method (refundMethod, src/features/pos-invoices/cart.ts): nothing to split by hand.
  const method = refundMethod(invoice.pos_invoice_payments, profile.pos_profile_payments);
  const methodName = modes?.find((mode) => mode.id === method)?.mode_of_payment ?? 'Payment method';
  const gap = whatStops(left, taking, total, method);
  const unitName = (id: string) => uoms?.find((uom) => uom.id === id)?.uom_name ?? 'Unit';

  if (approved) {
    const payload = returnPayload(invoice, made, session, method ? [{ mode_of_payment_id: method, amount: total }] : []);
    return <RefundReceipt merchant={merchant} invoice={invoice} session={session} payload={payload} onCancel={() => setApproved(false)} />;
  }

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Refund" title={invoice.name} meta={`Session ${session.name}`} onBack={() => router.back()} form />
      <PageForm
        editable
        readOnly=""
        notice={gap === null ? null : { type: 'error', text: gap }}
        mutation={IDLE}
        dirty={gap === null}
        onSave={() => setApproved(true)}
        saveLabel="Approve Refund"
      >
        <SectionHeading title="Items" hint="How many of each to take back" />
        <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
          {left
            .filter((row) => row.left > 0)
            .map(({ line, left: remaining }, index) => (
              <ReturnLine
                key={line.id}
                first={index === 0}
                name={line.item_name ?? ''}
                price={`${money(line.rate)} per ${unitName(line.uom_id)}`}
                counts={`${line.qty} sold, ${remaining} left to return`}
                unit={unitName(line.uom_id)}
                value={line.id in quantities ? quantities[line.id] : remaining}
                onChange={(qty) => setQuantities({ ...quantities, [line.id]: qty })}
              />
            ))}
        </View>
        <SectionHeading title="Refund" hint={method ? `All of it goes back by ${methodName}` : 'What the customer gets back for what is returned'} />
        <RefundTotals made={made} rounded={!rounding.roundedTotalDisabled} methodName={method ? methodName : undefined} money={money} />
      </PageForm>
    </View>
  );
}

type TotalsProps = { made: ReturnType<typeof buildReturn>; rounded: boolean; methodName: string | undefined; money: (value: number) => string };

/** What the refund comes to, above zero as the customer sees it — and the one method it all goes back by. */
function RefundTotals({ made, rounded, methodName, money }: TotalsProps) {
  const total = Math.max(-made.roundedTotal, 0);

  return (
    <SampleBox>
      <SampleLine label="Net Total" value={money(-made.netTotal)} />
      {made.taxes.map((tax, index) => (
        <SampleLine key={`${index}:${tax.account_head}`} label={tax.description} value={money(-tax.tax_amount)} />
      ))}
      <SampleLine label="Grand Total" value={money(-made.grandTotal)} />
      {rounded ? <SampleLine label="Rounded Total" value={money(-made.roundedTotal)} /> : null}
      {methodName ? <SampleLine label={`Refund · ${methodName}`} value={money(total)} /> : null}
    </SampleBox>
  );
}

// Approve Refund only moves to the receipt: nothing is in flight on the form.
const IDLE = { isPending: false, isPaused: false };

type LineProps = { first: boolean; name: string; price: string; counts: string; unit: string; value: number | null; onChange: (qty: number | null) => void };

/** One line of the sale in the Items box: its name and price, what was sold and is left, and how many to take back. */
function ReturnLine({ first, name, price, counts, unit, value, onChange }: LineProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.line, first ? null : { borderTopWidth: 1, borderTopColor: colors.outlineVariant }]}>
      <View style={styles.lineHead}>
        <Text variant="titleMedium" style={styles.fill}>
          {name}
        </Text>
        <Text variant="bodyMedium">{price}</Text>
      </View>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {counts}
      </Text>
      <FieldGrid>
        <NumberField label="Quantity to Return" hint={unit} value={value} placeholder="0" blank min={0} onChange={onChange} />
      </FieldGrid>
    </View>
  );
}

type ReceiptProps = Pick<Props, 'merchant' | 'invoice' | 'session'> & { payload: ReturnType<typeof returnPayload>; onCancel: () => void };

/**
 * The approved refund's receipt, printed as the saved one will be — no number until the database gives it one. Cancel,
 * and Back, go back to the quantities; Return to Register sends it, and only then is it saved.
 */
function RefundReceipt({ merchant, invoice, session, payload, onCancel }: ReceiptProps) {
  const { colors } = useAppTheme();
  const routes = useVoucherRoutes(merchant.id);
  const bottom = useBottomInset();
  const checkout = useCheckoutMutation({ merchantId: merchant.id });
  // Made per render, not per tap: sendOnce's guard is the handler two quick taps share.
  const send = sendOnce(checkout, () => routes.toRegister());
  const cancel = () => {
    if (!checkout.isPending) onCancel();
  };
  useBackAs(cancel);
  const notice = mutationNotice(checkout, postingRefusal(checkout.error) ?? failureMessage("Couldn't save the refund. Try again."));

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Refund" title={invoice.name} meta={`Not saved yet · Session ${session.name}`} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: spacing.md + bottom }]}>
        <InvoiceReceipt
          merchant={merchant}
          source={{
            ...payload,
            name: '',
            posting_date: todayDate(),
            is_return: true,
            return_against_name: invoice.name,
            pos_invoice_items: payload.items,
            pos_invoice_taxes: payload.taxes,
            pos_invoice_payments: payload.payments,
          }}
          banner={{ title: merchant.name, subtitle: 'Refund approved · saved when you return to the Register' }}
          above={<Text variant="headlineSmall">Refund</Text>}
        >
          {notice ? (
            <HelperText type={notice.type} padding="none">
              {notice.text}
            </HelperText>
          ) : null}
          <Button mode="contained" buttonColor={colors.error} textColor={colors.onError} disabled={checkout.isPending} onPress={cancel}>
            Cancel
          </Button>
          <Button mode="outlined" loading={checkout.isPending && !checkout.isPaused} disabled={checkout.isPending} onPress={() => send(payload)}>
            Return to Register
          </Button>
        </InvoiceReceipt>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  body: { padding: spacing.md },
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  line: { gap: spacing.sm, padding: spacing.ms },
  lineHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
