import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { sendOnce } from '../../components/adaptive-dialog';
import { DocumentState } from '../../components/document-page';
import { FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SectionHeading } from '../../components/section-heading';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import { buildReturn, returnableLines, returnPayload, tenderedAmounts } from '../../features/pos-invoices/cart';
import { useCheckoutMutation, usePosInvoiceQuery, usePosInvoiceReturnsQuery } from '../../features/pos-invoices/queries';
import type { PosInvoiceDocument } from '../../features/pos-invoices/queries';
import { useReturnRounding } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { failureMessage, mutationNotice, postingRefusal } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';
import { NumberField } from '../register/cart-line';

/**
 * The return of a sale (docs.frappe.io/erpnext/sales-return; POS-System-Added-Features 19.1): what to take
 * back of each line, what that refunds, and how it is handed back — rung in the cashier's own open session,
 * so the refund comes out of the drawer that session counts. Complete Return sends the return as calculated
 * from the sale's stored figures and lets the database check and post it (public.pos_checkout).
 */
export function PosReturnPage({ merchant, docId }: { merchant: Merchant; docId: string }) {
  const invoice = usePosInvoiceQuery({ id: docId });
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!invoice.data) return <DocumentState doctype="POS Invoice" query={invoice} />;
  if (!session || !profile) return <SessionState title="Return" query={query} />;

  return <Return merchant={merchant} invoice={invoice.data} session={session} profile={profile} />;
}

type Props = { merchant: Merchant; invoice: PosInvoiceDocument; session: PosOpeningEntry; profile: PosProfile };

function Return(props: Props) {
  const { merchant, invoice, session } = props;
  const returns = usePosInvoiceReturnsQuery({ returnAgainst: invoice.id }).data;
  const rounding = useReturnRounding(merchant);

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Return" title={invoice.name} meta={`Session ${session.name}`} onBack={() => router.back()} />
      {returns && rounding ? (
        <ReturnForm {...props} returns={returns} rounding={rounding} />
      ) : (
        <View style={styles.state}>
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

type FormProps = Props & {
  returns: NonNullable<ReturnType<typeof usePosInvoiceReturnsQuery>['data']>;
  rounding: NonNullable<ReturnType<typeof useReturnRounding>>;
};

type Left = ReturnType<typeof returnableLines>;

/** What stands between the form and Complete Return, in words; null when it can be sent. */
function whatStops(left: Left, taking: ReadonlyMap<string, number>, refund: { total: number; handed: number; methods: number }, money: (value: number) => string) {
  if (left.every((row) => row.left <= 0)) return 'Everything on this sale has already been returned.';
  const over = left.find((row) => (taking.get(row.line.id) ?? 0) > row.left);
  if (over) return `Only ${over.left} of ${over.line.item_name ?? 'that item'} is left to return.`;
  if (refund.total <= 0) return 'Enter a quantity to return.';
  if (refund.methods === 0) return 'The POS Profile allows no payment method in returns. Tick Allow in Returns on one in its Payment Methods.';
  if (refund.handed < refund.total) return `${money(refund.total - refund.handed)} is still to hand back.`;
  return refund.handed > refund.total ? `That is ${money(refund.handed - refund.total)} more than the refund.` : null;
}

function ReturnForm({ merchant, invoice, session, profile, returns, rounding }: FormProps) {
  const { colors } = useAppTheme();
  const money = useMoney(merchant);
  const routes = useVoucherRoutes(merchant.id);
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const checkout = useCheckoutMutation({ merchantId: merchant.id });
  // What the cashier typed, by line and by payment method; a line not in here returns all that is left of it.
  const [quantities, setQuantities] = useState<Record<string, number | null>>({});
  const [typed, setTyped] = useState<Record<string, number | null>>({});

  const left = returnableLines(invoice, returns);
  const taking = new Map(left.map((row) => [row.line.id, row.line.id in quantities ? (quantities[row.line.id] ?? 0) : row.left]));
  // A quantity over what is left is said by whatStops, which keeps it from being sent.
  const made = buildReturn(invoice, taking, rounding);
  const total = -made.roundedTotal;

  // The register's default method takes the refund where returns may use it; otherwise the first that may.
  const allowed = profile.pos_profile_payments.filter((method) => method.allow_in_returns);
  const first = allowed.find((method) => method.is_default) ?? allowed[0];
  const refunds = tenderedAmounts(
    allowed.map((method) => ({ mode_of_payment_id: method.mode_of_payment_id, is_default: method === first })),
    typed,
    total > 0 ? total : null
  );
  const handed = rounding.round(refunds.reduce((sum, refund) => sum + refund.amount, 0));
  const gap = whatStops(left, taking, { total, handed, methods: allowed.length }, money);
  const unitName = (id: string) => uoms?.find((uom) => uom.id === id)?.uom_name ?? 'Unit';

  // Made per render, not per tap: sendOnce's guard is the handler two quick taps share.
  const send = sendOnce(checkout, (returnId: string) => routes.showReturn(returnId));

  return (
    <PageForm
      editable
      readOnly=""
      // What stops the return now is said over what the database refused before: that refusal was about other figures.
      notice={gap === null ? mutationNotice(checkout, postingRefusal(checkout.error) ?? failureMessage("Couldn't complete the return. Try again.")) : { type: 'error', text: gap }}
      mutation={checkout}
      dirty={gap === null}
      onSave={() => send(returnPayload(invoice, made, session, refunds))}
      saveLabel="Complete Return"
    >
      {left
        .filter((row) => row.left > 0)
        .map(({ line, left: remaining }) => (
          <View key={line.id} style={[styles.line, { borderColor: colors.outlineVariant }]}>
            <Text variant="titleMedium">{line.item_name ?? ''}</Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {`${money(line.rate)} per ${unitName(line.uom_id)} · ${line.qty} sold, ${remaining} left to return`}
            </Text>
            <FieldGrid>
              <NumberField
                label="Quantity to Return"
                hint={unitName(line.uom_id)}
                value={line.id in quantities ? quantities[line.id] : remaining}
                placeholder="0"
                blank
                min={0}
                onChange={(qty) => setQuantities({ ...quantities, [line.id]: qty })}
              />
            </FieldGrid>
          </View>
        ))}
      <SectionHeading title="Refund" hint="What the customer gets back for what is returned" />
      <SampleBox>
        <SampleLine label="Net Total" value={money(-made.netTotal)} />
        {made.taxes.map((tax, index) => (
          <SampleLine key={`${index}:${tax.account_head}`} label={tax.description} value={money(-tax.tax_amount)} />
        ))}
        <SampleLine label="Grand Total" value={money(-made.grandTotal)} />
        {rounding.roundedTotalDisabled ? null : <SampleLine label="Rounded Total" value={money(total)} />}
      </SampleBox>
      <SectionHeading title="Handed Back" hint="By payment method — the ones the POS Profile allows in returns" />
      <FieldGrid>
        {refunds.map((refund) => (
          <NumberField
            key={refund.mode_of_payment_id}
            label={modes?.find((mode) => mode.id === refund.mode_of_payment_id)?.mode_of_payment ?? 'Payment method'}
            value={refund.shown}
            placeholder="0"
            blank
            min={0}
            onChange={(amount) => setTyped({ ...typed, [refund.mode_of_payment_id]: amount })}
          />
        ))}
      </FieldGrid>
    </PageForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  line: { gap: spacing.sm, paddingBottom: spacing.ms, borderBottomWidth: 1 },
});
