import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { sendOnce } from '../../components/adaptive-dialog';
import { FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SearchSelect } from '../../components/search-select';
import { SectionHeading } from '../../components/section-heading';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import type { ModeOfPayment } from '../../features/modes-of-payment/queries';
import { additionalDiscount, buildSale, checkoutPayload, settle, tenderedAmounts } from '../../features/pos-invoices/cart';
import type { CartDiscount, Sale, SaleSetup } from '../../features/pos-invoices/cart';
import { useCheckoutMutation } from '../../features/pos-invoices/queries';
import { useSaleSetup } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { APPLY_DISCOUNT_ON } from '../../features/pos-profiles/schema';
import { useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { failureMessage, mutationNotice, postingRefusal } from '../../lib/errors';
import { clearCart, setCartDiscount, useCart, useCartDiscount } from '../../Store/cart';
import { spacing } from '../../themes';
import { CartLineRow, NumberField } from './cart-line';

/**
 * The Cart and its payment (docs.frappe.io/erpnext/point-of-sale): the lines, the totals with their taxes, an
 * amount per payment method, and Complete Order — which sends the sale as calculated here and lets the
 * database check and post it (public.pos_checkout).
 */
export function Cart({ merchant }: { merchant: Merchant }) {
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!session || !profile) return <SessionState title="Cart" query={query} />;

  return <Checkout merchant={merchant} session={session} profile={profile} />;
}

type Settled = ReturnType<typeof settle>;

/** A rate or a discount is typed where the POS Profile allows it and the cashier holds Apply Discounts (setup.typedPrices). */
const typing = (profile: PosProfile, setup: SaleSetup) => ({
  typesRates: profile.allow_rate_change && setup.typedPrices,
  typesDiscounts: profile.allow_discount_change && setup.typedPrices,
});

/** What stands between the cart and Complete Order, in words; null when it can be paid. */
function whatStops(sale: Sale, settled: Settled, profile: PosProfile, typesRates: boolean, money: (value: number) => string) {
  if (sale.lines.length === 0) return 'The cart is empty. Go back to the Register and add an item.';
  const unpriced = sale.lines.find((line) => !line.priced);
  if (unpriced) return `${unpriced.itemName} has no price. ${typesRates ? 'Enter its rate, or add' : 'Add'} an Item Price for it.`;
  return settled.shortfall > profile.write_off_limit ? `${money(settled.shortfall)} is still to pay.` : null;
}

function Checkout({ merchant, session, profile }: { merchant: Merchant; session: PosOpeningEntry; profile: PosProfile }) {
  const sale = useSaleSetup(merchant, profile);
  const modes = useModesOfPaymentQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;

  return (
    <View style={styles.fill}>
      <PageHeader kicker={profile.pos_profile_name} title="Cart" meta={`Session ${session.name}`} onBack={() => router.back()} />
      {sale && modes && uoms ? (
        <CheckoutForm merchant={merchant} session={session} profile={profile} sale={sale} modes={modes} uoms={uoms} />
      ) : (
        <View style={styles.state}>
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

type FormProps = {
  merchant: Merchant;
  session: PosOpeningEntry;
  profile: PosProfile;
  sale: NonNullable<ReturnType<typeof useSaleSetup>>;
  modes: ModeOfPayment[];
  uoms: Uom[];
};

function CheckoutForm({ merchant, session, profile, sale, modes, uoms }: FormProps) {
  const { setup, engines } = sale;
  const { typesRates, typesDiscounts } = typing(profile, setup);
  const lines = useCart(session.id);
  const discount = useCartDiscount(session.id);
  const money = useMoney(merchant);
  const checkout = useCheckoutMutation({ merchantId: merchant.id });
  // What the cashier typed per payment method; a method not in here still shows its default.
  const [typed, setTyped] = useState<Record<string, number | null>>({});

  const built = buildSale(lines, setup, engines, additionalDiscount(discount, profile));
  const payments = tenderedAmounts(profile.pos_profile_payments, typed, profile.set_grand_total_to_default_mop && built.lines.length > 0 ? built.roundedTotal : null);
  const settled = settle(
    built.roundedTotal,
    payments.map((payment) => payment.amount),
    (value) => engines.round(value, setup.precision)
  );
  const gap = whatStops(built, settled, profile, typesRates, money);

  // Made per render, not per tap: sendOnce's guard is the handler two quick taps share.
  const send = sendOnce(checkout, (invoiceId: string) => {
    clearCart(session.id);
    // The receipt takes the cart's place where the profile prints one; Back from it is the Register.
    if (profile.print_receipt_on_order_complete) router.replace({ pathname: '/systems/[id]/sell/pos-invoice', params: { id: merchant.id, docId: invoiceId } });
    else router.back();
  });

  return (
    <PageForm
      editable
      readOnly=""
      // What stops the cart now is said over what the database refused before: that refusal was about another cart.
      notice={gap === null ? mutationNotice(checkout, postingRefusal(checkout.error) ?? failureMessage("Couldn't complete the order. Try again.")) : { type: 'error', text: gap }}
      mutation={checkout}
      dirty={gap === null}
      onSave={() => send(checkoutPayload(built, session, payments, settled))}
      saveLabel="Complete Order"
    >
      {built.lines.map((line) => (
        <CartLineRow
          key={`${line.cartIndex}:${line.itemId}`}
          sessionId={session.id}
          line={line}
          typed={lines[line.cartIndex]}
          item={sale.items.find((candidate) => candidate.id === line.itemId)}
          uoms={uoms}
          rateEditable={typesRates}
          discountEditable={typesDiscounts}
          money={money}
        />
      ))}
      {typesDiscounts ? <AdditionalDiscount sessionId={session.id} discount={discount} applyOn={built.applyDiscountOn} /> : null}
      <SampleBox>
        {built.discountAmount > 0 ? <SampleLine label="Additional Discount" value={money(-built.discountAmount)} sub={`Off the ${built.applyDiscountOn}`} /> : null}
        <SampleLine label="Net Total" value={money(built.netTotal)} />
        {built.taxes.map((tax, index) => (
          <SampleLine key={`${index}:${tax.account}`} label={tax.description} value={money(tax.tax_amount)} />
        ))}
        <SampleLine label="Grand Total" value={money(built.grandTotal)} />
        {setup.roundedTotalDisabled ? null : <SampleLine label="Rounded Total" value={money(built.roundedTotal)} />}
      </SampleBox>
      <SectionHeading title="Payment" hint="What the customer hands over, by payment method" />
      <FieldGrid>
        {payments.map((payment) => (
          <NumberField
            key={payment.mode_of_payment_id}
            label={modes.find((mode) => mode.id === payment.mode_of_payment_id)?.mode_of_payment ?? 'Payment method'}
            value={payment.shown}
            placeholder="0"
            blank
            min={0}
            onChange={(amount) => setTyped({ ...typed, [payment.mode_of_payment_id]: amount })}
          />
        ))}
      </FieldGrid>
      <Settlement settled={settled} writtenOff={gap === null} money={money} />
    </PageForm>
  );
}

/**
 * 20.2, the sale's Additional Discount: a percentage or an amount — typing one empties the other — taken from
 * the Grand Total or the Net Total, the POS Profile's Apply Discount On to start with.
 */
function AdditionalDiscount({ sessionId, discount, applyOn }: { sessionId: string; discount: CartDiscount; applyOn: string }) {
  return (
    <>
      <SectionHeading title="Additional Discount" hint="Off the whole sale, after each line's own discount" />
      <FieldGrid>
        <NumberField label="Discount (%)" value={discount.percentage} placeholder="0" blank min={0} onChange={(percentage) => setCartDiscount(sessionId, { percentage, amount: null })} />
        <NumberField label="Discount Amount" value={discount.amount} placeholder="0" blank min={0} onChange={(amount) => setCartDiscount(sessionId, { percentage: null, amount })} />
        <SearchSelect
          label="Apply Discount On"
          title="Apply Discount On"
          value={applyOn}
          options={APPLY_DISCOUNT_ON.map((basis) => ({ value: basis, label: basis }))}
          onChange={(picked) => setCartDiscount(sessionId, { applyOn: picked })}
        />
      </FieldGrid>
    </>
  );
}

/** What was handed over against the total: the change, or what is still to pay — a write-off when the POS Profile's limit covers it. */
function Settlement({ settled, writtenOff, money }: { settled: Settled; writtenOff: boolean; money: (value: number) => string }) {
  const short = settled.shortfall > 0;

  return (
    <SampleBox>
      <SampleLine label="Paid" value={money(settled.paid)} />
      {short ? (
        <SampleLine label={writtenOff ? 'Write Off' : 'To Pay'} value={money(settled.shortfall)} sub={writtenOff ? "Within the POS Profile's Write Off Limit" : undefined} />
      ) : (
        <SampleLine label="Change" value={money(settled.change)} />
      )}
    </SampleBox>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
