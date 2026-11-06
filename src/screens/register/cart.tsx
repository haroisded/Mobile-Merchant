import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { AdaptiveDialog, sendOnce } from '../../components/adaptive-dialog';
import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { useConfirm } from '../../components/confirm-dialog';
import { Field, FieldGrid } from '../../components/form-fields';
import { useRegisterSession } from '../../components/pos-session';
import { SuccessMark } from '../../components/receipt';
import { SampleBox, SampleLine } from '../../components/sample-box';
import { SegmentedButtons } from '../../components/segmented-buttons';
import { Text } from '../../components/text';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { useModesOfPaymentQuery } from '../../features/modes-of-payment/queries';
import type { ModeOfPayment } from '../../features/modes-of-payment/queries';
import { additionalDiscount, buildSale, checkoutPayload, settle, tenderedAmounts } from '../../features/pos-invoices/cart';
import type { CartDiscount, CartLine, Sale, SaleSetup } from '../../features/pos-invoices/cart';
import { useCheckoutMutation, usePosInvoiceQuery } from '../../features/pos-invoices/queries';
import { useSaleSetup } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { APPLY_DISCOUNT_ON } from '../../features/pos-profiles/schema';
import { useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postingRefusal } from '../../lib/errors';
import type { Notice } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { clearCart, setCartDiscount, useCart, useCartDiscount } from '../../Store/cart';
import { radius, spacing } from '../../themes';
import { CartLineRow, NumberField } from './cart-line';

type SaleData = NonNullable<ReturnType<typeof useSaleSetup>>;
type Settled = ReturnType<typeof settle>;
type Money = (value: number) => string;

/** "2 lines · 5 items": the Register's footer and the payment's subtitle. */
export function countOf(lines: CartLine[]) {
  const items = Number(lines.reduce((sum, line) => sum + line.qty, 0).toFixed(3));
  return `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${items} ${items === 1 ? 'item' : 'items'}`;
}

/** A rate or a discount is typed where the POS Profile allows it and the cashier holds Apply Discounts (setup.typedPrices). */
const typing = (profile: PosProfile, setup: SaleSetup) => ({
  typesRates: profile.allow_rate_change && setup.typedPrices,
  typesDiscounts: profile.allow_discount_change && setup.typedPrices,
});

type PaneProps = { merchant: Merchant; session: PosOpeningEntry; profile: PosProfile; sale: SaleData };

/**
 * The Register's cart (docs.frappe.io/erpnext/point-of-sale): "Cart", its line count and Clear all, then a card per
 * line (./cart-line.tsx) — the right pane wide, the Cart tab narrow. The payment is CheckoutDialog's.
 */
export function CartPane({ merchant, session, profile, sale }: PaneProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const lines = useCart(session.id);
  const discount = useCartDiscount(session.id);
  const money = useMoney(merchant);
  const { ask, dialog } = useConfirm();
  const { setup, engines } = sale;
  const { typesRates, typesDiscounts } = typing(profile, setup);
  const built = buildSale(lines, setup, engines, additionalDiscount(discount, profile));

  const clear = () =>
    ask({
      kicker: 'Cart',
      title: 'Clear the cart?',
      body: `${countOf(lines)} come out of the cart. Nothing is sold or saved.`,
      confirmLabel: 'Clear all',
      run: async () => clearCart(session.id),
      failure: () => "Couldn't clear the cart. Try again.",
      // Wide, useConfirm closes its own Dialog; narrow, the confirm is a sheet to close.
      onDone: () => {
        if (!wide) router.back();
      },
    });

  return (
    <View style={styles.fill}>
      <View style={styles.cartHead}>
        <View style={styles.fill}>
          <Text variant="headlineSmall">Cart</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {`${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`}
          </Text>
        </View>
        <Button mode="text" textColor={colors.accent} disabled={lines.length === 0} onPress={clear}>
          Clear all
        </Button>
      </View>
      <ScrollView contentContainerStyle={styles.lines} keyboardShouldPersistTaps="handled">
        {built.lines.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
            <Text variant="titleMedium">Cart is empty</Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
              Tap a product to add it here.
            </Text>
          </View>
        ) : uoms ? (
          built.lines.map((line) => (
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
          ))
        ) : (
          <ActivityIndicator />
        )}
      </ScrollView>
      {dialog}
    </View>
  );
}

type DialogProps = {
  merchant: Merchant;
  onDismiss: () => void;
  /** The body of the narrow formSheet route src/app/(app)/sheets/checkout.tsx; a Dialog over the Register otherwise. */
  inSheet?: boolean;
};

/**
 * Complete order: the sale's lines, its Additional Discount, its totals, an amount per payment method and what that settles —
 * then Complete Order, which sends the sale as calculated here and lets the database check and post it
 * (public.pos_checkout). A Dialog over the Register wide, the native sheet narrow. Paid, the profile's receipt opens
 * as the sale's page (`after=sale`); with none, "Order completed" takes the payment's place.
 */
export function CheckoutDialog({ merchant, onDismiss, inSheet }: DialogProps) {
  const { session, profile } = useRegisterSession(merchant.id);
  const [sold, setSold] = useState<{ invoiceId: string; total: number; change: number } | null>(null);

  if (sold) return <Completed merchant={merchant} sold={sold} inSheet={inSheet} onDismiss={onDismiss} />;
  if (!session || !profile) return <Loading inSheet={inSheet} onDismiss={onDismiss} />;

  return <Payment merchant={merchant} session={session} profile={profile} inSheet={inSheet} onDismiss={onDismiss} onSold={setSold} />;
}

function Loading({ inSheet, onDismiss }: Pick<DialogProps, 'inSheet' | 'onDismiss'>) {
  return (
    <AdaptiveDialog inSheet={inSheet} title="Complete order" onDismiss={onDismiss} onClose={onDismiss}>
      <ActivityIndicator />
    </AdaptiveDialog>
  );
}

type PaymentProps = Omit<DialogProps, 'merchant'> & {
  merchant: Merchant;
  session: PosOpeningEntry;
  profile: PosProfile;
  onSold: (sold: { invoiceId: string; total: number; change: number }) => void;
};

function Payment(props: PaymentProps) {
  const sale = useSaleSetup(props.merchant, props.profile);
  const modes = useModesOfPaymentQuery({ merchantId: props.merchant.id }).data;
  // Read here, not in OrderLines: a Dialog's content is drawn at Paper's root Portal, above the QueryClient's provider.
  const uoms = useUomsQuery({ merchantId: props.merchant.id }).data;

  return sale && modes ? <PaymentForm {...props} sale={sale} modes={modes} uoms={uoms} /> : <Loading inSheet={props.inSheet} onDismiss={props.onDismiss} />;
}

/** What stands between the cart and Complete Order, in words; null when it can be paid. */
function whatStops(sale: Sale, settled: Settled, profile: PosProfile, typesRates: boolean, money: Money) {
  if (sale.lines.length === 0) return 'The cart is empty. Tap an item to add it.';
  const unpriced = sale.lines.find((line) => !line.priced);
  if (unpriced) return `${unpriced.itemName} has no price. ${typesRates ? 'Enter its rate, or add' : 'Add'} an Item Price for it.`;
  return settled.shortfall > profile.write_off_limit ? `${money(settled.shortfall)} is still to pay.` : null;
}

// The quick amounts under the default method: the exact total, then the notes a customer hands over that cover it.
const NOTES = [100, 200, 500, 1000];
const quickMethod = (profile: PosProfile) => (profile.pos_profile_payments.find((method) => method.is_default) ?? profile.pos_profile_payments[0])?.mode_of_payment_id;

function PaymentForm({ merchant, session, profile, sale, modes, uoms, inSheet, onDismiss, onSold }: PaymentProps & { sale: SaleData; modes: ModeOfPayment[]; uoms: Uom[] | undefined }) {
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
  const inFlight = checkout.isPending && !checkout.isPaused;
  const quick = quickMethod(profile);

  // Made per render, not per tap: sendOnce's guard is the handler two quick taps share. The total and change are this
  // render's, the one the tap was made in.
  const send = sendOnce(checkout, (invoiceId: string) => {
    clearCart(session.id);
    if (!profile.print_receipt_on_order_complete) {
      onSold({ invoiceId, total: built.roundedTotal, change: settled.change });
      return;
    }
    // The receipt is the sale's page, opened after the sale: Return to Register instead of a back arrow.
    onDismiss();
    router.push({ pathname: '/systems/[id]/sell/pos-invoice', params: { id: merchant.id, docId: invoiceId, after: 'sale' } });
  });

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      title="Complete order"
      notice={paymentNotice(gap, checkout)}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Back to cart
          </Button>
          <Button
            mode="contained"
            onPress={() => send(checkoutPayload(built, session, payments, settled))}
            loading={inFlight}
            disabled={gap !== null || checkout.isPending}
            contentStyle={styles.action}
          >
            Complete Order
          </Button>
        </>
      }
    >
      <Muted text={countOf(lines)} />
      <OrderLines lines={built.lines} uoms={uoms} money={money} />
      {typesDiscounts ? <AdditionalDiscount sessionId={session.id} discount={discount} applyOn={built.applyDiscountOn} /> : null}
      <Totals sale={built} rounded={!setup.roundedTotalDisabled} money={money} />
      <Heading title="Payment" hint="What the customer hands over, by payment method" />
      <PaymentFields
        payments={payments}
        modes={modes}
        quick={quick}
        total={built.roundedTotal}
        money={money}
        onType={(modeId, amount) => setTyped({ ...typed, [modeId]: amount })}
      />
      <Settlement settled={settled} writtenOff={gap === null} money={money} />
    </AdaptiveDialog>
  );
}

/** What stops the cart now, said over what the database refused before: that refusal was about another cart. */
const paymentNotice = (gap: string | null, checkout: { isPaused: boolean; isError: boolean; error: Error | null }): Notice | null =>
  gap === null ? mutationNotice(checkout, postingRefusal(checkout.error) ?? failureMessage("Couldn't complete the order. Try again.")) : { type: 'error', text: gap };

/** A bodySmall line in the muted colour: the cart's count over the payment. */
function Muted({ text }: { text: string }) {
  const { colors } = useAppTheme();

  return (
    <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
      {text}
    </Text>
  );
}

type PaymentFieldsProps = {
  payments: ReturnType<typeof tenderedAmounts>;
  modes: ModeOfPayment[];
  /** The default method: what the quick amounts fill. */
  quick: string | undefined;
  total: number;
  money: (value: number) => string;
  onType: (modeId: string, amount: number | null) => void;
};

/** A field per payment method, then the quick amounts on the default one: the exact total, and each note above it. */
function PaymentFields({ payments, modes, quick, total, money, onType }: PaymentFieldsProps) {
  return (
    <>
      <FieldGrid>
        {payments.map((payment) => (
          <NumberField
            key={payment.mode_of_payment_id}
            label={modes.find((mode) => mode.id === payment.mode_of_payment_id)?.mode_of_payment ?? 'Payment method'}
            value={payment.shown}
            placeholder="0"
            blank
            min={0}
            onChange={(amount) => onType(payment.mode_of_payment_id, amount)}
          />
        ))}
      </FieldGrid>
      {quick && total > 0 ? (
        <View style={styles.quick}>
          {[total, ...NOTES.filter((note) => note > total)].map((amount, index) => (
            <Chip key={amount} mode="outlined" compact onPress={() => onType(quick, amount)}>
              {index === 0 ? `Exact ${money(amount)}` : money(amount)}
            </Chip>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** A heading inside the payment: titleMedium and its bodySmall hint — a Dialog's body is too small for headlineSmall. */
function Heading({ title, hint }: { title: string; hint: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.heading}>
      <Text variant="titleMedium">{title}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {hint}
      </Text>
    </View>
  );
}

/** What is being paid for, line by line: quantity, discount and amount. Read-only: a line changes on its cart card. */
function OrderLines({ lines, uoms, money }: { lines: Sale['lines']; uoms: Uom[] | undefined; money: Money }) {
  const unitName = (id: string) => uoms?.find((uom) => uom.id === id)?.uom_name;

  if (lines.length === 0) return null;

  return (
    <>
      <Heading title="Items" hint="Change a line in the cart" />
      <SampleBox>
        {lines.map((line) => (
          <SampleLine
            key={`${line.cartIndex}:${line.itemId}`}
            label={line.itemName}
            value={money(line.amount)}
            sub={[
              ['Qty', line.qty, unitName(line.uomId)].filter(Boolean).join(' '),
              line.discountAmount > 0 ? `${Number(line.discountPercentage.toFixed(2))}% off (${money(line.discountAmount * line.qty)})` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </SampleBox>
    </>
  );
}

/**
 * 20.2, the sale's Additional Discount: a percentage or an amount — typing one empties the other — taken from the
 * Grand Total or the Net Total, the POS Profile's Apply Discount On to start with.
 */
function AdditionalDiscount({ sessionId, discount, applyOn }: { sessionId: string; discount: CartDiscount; applyOn: string }) {
  return (
    <>
      <Heading title="Additional Discount" hint="Off the whole sale, after each line's own discount" />
      <FieldGrid>
        <NumberField label="Discount (%)" value={discount.percentage} placeholder="0" blank min={0} onChange={(percentage) => setCartDiscount(sessionId, { percentage, amount: null })} />
        <NumberField label="Discount Amount" value={discount.amount} placeholder="0" blank min={0} onChange={(amount) => setCartDiscount(sessionId, { percentage: null, amount })} />
        <Field label="Apply Discount On" span="full">
          <SegmentedButtons value={applyOn} onValueChange={(picked) => setCartDiscount(sessionId, { applyOn: picked })} buttons={APPLY_DISCOUNT_ON.map((basis) => ({ value: basis, label: basis }))} />
        </Field>
      </FieldGrid>
    </>
  );
}

/** The sale's totals: the additional discount first, below zero, then the net total, each tax, the grand and rounded totals. */
function Totals({ sale, rounded, money }: { sale: Sale; rounded: boolean; money: Money }) {
  return (
    <SampleBox>
      {sale.discountAmount > 0 ? <SampleLine label="Additional Discount" value={money(-sale.discountAmount)} sub={`Off the ${sale.applyDiscountOn}`} /> : null}
      <SampleLine label="Net Total" value={money(sale.netTotal)} />
      {sale.taxes.map((tax, index) => (
        <SampleLine key={`${index}:${tax.account}`} label={tax.description} value={money(tax.tax_amount)} />
      ))}
      <SampleLine label="Grand Total" value={money(sale.grandTotal)} />
      {rounded ? <SampleLine label="Rounded Total" value={money(sale.roundedTotal)} /> : null}
    </SampleBox>
  );
}

/** What was handed over against the total: the change, or what is still to pay — a write-off when the POS Profile's limit covers it. */
function Settlement({ settled, writtenOff, money }: { settled: Settled; writtenOff: boolean; money: Money }) {
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

/** A sale with no receipt to print: its number, total and change, and New sale back to the Register's products. */
function Completed({ merchant, sold, inSheet, onDismiss }: { merchant: Merchant; sold: { invoiceId: string; total: number; change: number }; inSheet?: boolean; onDismiss: () => void }) {
  const money = useMoney(merchant);
  // The number is the database's: read back by the id the checkout answered with.
  const invoice = usePosInvoiceQuery({ id: sold.invoiceId }).data;

  return (
    <AdaptiveDialog
      inSheet={inSheet}
      onDismiss={onDismiss}
      title="Order completed"
      actions={
        <Button mode="contained" onPress={onDismiss} contentStyle={styles.action}>
          New sale
        </Button>
      }
    >
      <View style={styles.done}>
        <SuccessMark />
      </View>
      <SampleBox>
        <SampleLine label="Order" value={invoice?.name ?? '…'} />
        <SampleLine label="Total" value={money(sold.total)} />
        <SampleLine label="Change" value={money(sold.change)} />
      </SampleBox>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  action: { justifyContent: 'flex-start' },
  cartHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  lines: { gap: spacing.ms, padding: spacing.md },
  empty: { gap: spacing.xs, alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous' },
  heading: { gap: spacing.xs, paddingTop: spacing.sm },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  done: { alignItems: 'center' },
});
