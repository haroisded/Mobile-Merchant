import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { Chip } from '../../../components/chip';
import { Field, FieldGrid } from '../../../components/form-fields';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { NoteCallout } from '../../../components/note-callout';
import { PageHeader } from '../../../components/page-header';
import { paperWidth, SuccessMark } from '../../../components/receipt';
import { SampleBox, SampleLine } from '../../../components/sample-box';
import { SectionHeading } from '../../../components/section-heading';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { TextInput } from '../../../components/text-input';
import { useBottomInset, useShellWide } from '../../../lib/columns';
import { displayDate } from '../../../lib/dates';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { DiscountChip, NumberField, Stepper } from '../../register/cart-line';
import { PaneTabs, ProductRow, usePane } from '../../register/index';
import { FigureStrip, StatusPill } from '../../sell/index';
import { SandboxContext, useSandbox } from '../sandbox/context';
import { GuideButton, GuideTarget } from '../sandbox/guide-target';
import {
  addToCart,
  cartLines,
  closeSession,
  completeOrder,
  expectedCash,
  openSession,
  refundLines,
  removeFromCart,
  returnable,
  returnSale,
  setDiscount,
  setQty,
  takeFromCart,
  TODAY,
  totals,
  voidRefusal,
  voidSale,
} from '../sandbox-state';
import { ME } from '../sandbox-state';
import type { Order, OrderLine } from '../sandbox-state';
import { T } from '../tasks';
import type { Target } from '../tasks';
import { Frame, IndexBoxes, ListRow, peso, ReadOut, STORE_NAME } from './frame';

// Sell in the practice store: src/screens/sell/, register/, pos-orders/, pos-opening-entries/ and pos-closing-entries/
// drawn again over the mock store — the same headers, cards and buttons (the Register's rows, tabs, stepper and
// Discount chip are the real ones), with no query behind them. One simplification: Open and Close Session stay pages
// on a tablet, where the real Sell page opens them as Dialogs.

/** A typed amount: blank or not a number is null. */
const amount = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text));

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

/** "2 lines · 5 items", as the Register's footer and the payment say it. */
const countOf = (lines: OrderLine[]) => `${plural(lines.length, 'line')} · ${plural(lines.reduce((sum, line) => sum + line.qty, 0), 'item')}`;

/** The step's ring on the first of several cards only: one control is pointed at, not every card's. */
function Ring({ target, on, children }: { target: Target; on: boolean; children: ReactNode }) {
  return on ? <GuideTarget target={target}>{children}</GuideTarget> : children;
}

/** Return to Register: Sell's stack back to the Register — or to Sell, for a refund desk that does not sell. */
function useToRegister() {
  const { reset, go, holds } = useSandbox();
  return () => {
    reset('sell');
    if (holds('process_sales')) go('register');
  };
}

export function SellPage() {
  const { holds } = useSandbox();

  return (
    <Frame title="Sell" meta="Open a session, sell at the Register, close the session">
      {holds('open_close_register') ? <SessionCard /> : null}
      <IndexBoxes
        sections={[
          {
            title: 'Orders & Sessions',
            rows: [
              {
                label: 'Orders',
                hint: 'Every sale, newest first: reopen its receipt',
                show: holds('view_sales') || holds('process_refunds') || holds('void_sales'),
                page: 'orders',
                target: T.sellOrders,
              },
              {
                label: 'POS Opening Entries',
                hint: 'Each session, and what its drawer started with',
                show: holds('view_shift_totals') || holds('close_any_register'),
                page: 'opening-entries',
                target: T.sellOpenings,
              },
              { label: 'POS Closing Entries', hint: 'Each closed session: expected against counted', show: holds('view_shift_totals'), page: 'closing-entries', target: T.sellClosings },
            ],
          },
        ]}
      />
    </Frame>
  );
}

/** The cashier's session card (src/screens/sell/index.tsx): its number and pill, the register and since when, its figures. */
function SessionCard() {
  const { store, go, holds } = useSandbox();
  const { colors } = useAppTheme();
  const mine = store.sessions.find((session) => session.id === store.mine);
  // The figures add up the session's sales, which only who may look them up reads.
  const seesSales = holds('process_sales') || holds('process_refunds') || holds('void_sales') || holds('view_sales');

  return (
    <View style={[styles.card, { borderColor: colors.outlineVariant }]}>
      <View style={styles.cardText}>
        <View style={styles.cardTitle}>
          <Text variant="titleMedium">{mine ? `Session ${mine.number}` : 'No session is open'}</Text>
          <StatusPill open={!!mine} />
        </View>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {mine ? `${mine.register} · Open since ${displayDate(mine.date)}` : "A session is one cashier's shift on one POS Profile: sales are rung up inside it."}
        </Text>
      </View>
      {mine && seesSales ? <SessionFigures sessionId={mine.id} opening={mine.opening} /> : null}
      <View style={styles.buttons}>
        {mine && holds('process_sales') ? (
          <GuideButton target={T.sellRegister} mode="contained" onPress={() => go('register')}>
            Register
          </GuideButton>
        ) : null}
        {mine ? (
          <GuideButton target={T.sellClose} mode="outlined" onPress={() => go('close-session', { sessionId: mine.id })}>
            Close Session
          </GuideButton>
        ) : (
          <GuideButton target={T.sellOpen} mode="contained" onPress={() => go('open-session')}>
            Open Session
          </GuideButton>
        )}
      </View>
    </View>
  );
}

/** Orders (sales, not refunds), the cash the drawer holds now, and what it opened with. */
function SessionFigures({ sessionId, opening }: { sessionId: string; opening: number }) {
  const { store } = useSandbox();
  const orders = store.sales.filter((sale) => sale.sessionId === sessionId && sale.status === 'Submitted' && !sale.returnAgainst).length;

  return (
    <FigureStrip
      figures={[
        { label: 'Orders', value: String(orders) },
        { label: 'Cash in drawer', value: peso(expectedCash(store, sessionId)) },
        { label: 'Opening cash', value: peso(opening) },
      ]}
    />
  );
}

export function OpenSession() {
  const { act, back, did } = useSandbox();
  const [cash, setCash] = useState('');
  const value = amount(cash);

  return (
    <Frame
      title="Open Session"
      meta="Main Register"
      onBack={back}
      footer={
        <GuideTarget target={T.openSubmit}>
          <Button
            mode="contained"
            disabled={value === null || value < 0}
            onPress={() => {
              act((store) => openSession(store, value ?? 0));
              did(T.openSubmit);
              back();
            }}
            contentStyle={styles.leading}
          >
            Open Session
          </Button>
        </GuideTarget>
      }
    >
      <ReadOut label="POS Profile" value="Main Register — the only register, picked already" />
      <Text variant="bodyMedium">The cash in the drawer as the shift starts, for each payment method.</Text>
      <GuideTarget target={T.openAmount}>
        <FieldGrid>
          <Field label="Cash" required>
            <TextInput
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              value={cash}
              onChangeText={(text) => {
                setCash(text);
                if ((amount(text) ?? 0) > 0) did(T.openAmount);
              }}
              accessibilityLabel="Cash"
            />
          </Field>
        </FieldGrid>
      </GuideTarget>
    </Frame>
  );
}

/**
 * The Register, as src/screens/register/ lays it out: Products and Cart as tabs on a phone, two panes on a tablet, and
 * one footer under both with the total and Complete Order, which opens the payment.
 */
export function RegisterPage() {
  const { store, back } = useSandbox();
  const session = store.sessions.find((candidate) => candidate.id === store.mine);
  if (!session) {
    return (
      <Frame title="Register" onBack={back}>
        <NoteCallout>Open a session first: a sale is rung up only inside an open session.</NoteCallout>
      </Frame>
    );
  }

  return <Counter number={session.number} />;
}

function Counter({ number }: { number: string }) {
  const { store, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [pane, setPane] = usePane(store.cart.length === 0);
  const [paying, setPaying] = useState(false);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <PageHeader kicker="Main Register" title="Register" meta={`Session ${number}`} onBack={back} />
      {wide ? (
        <View style={styles.panes}>
          <View style={[styles.fill, styles.divided, { borderRightColor: colors.outlineVariant }]}>
            <Products />
          </View>
          <View style={styles.fill}>
            <CartPane />
          </View>
        </View>
      ) : (
        <>
          <GuideTarget target={T.registerCart}>
            <PaneTabs
              pane={pane}
              count={store.cart.length}
              onPane={(next) => {
                if (next === 'cart') did(T.registerCart);
                setPane(next);
              }}
            />
          </GuideTarget>
          <View style={styles.fill}>{pane === 'items' ? <Products /> : <CartPane />}</View>
        </>
      )}
      <OrderBar onPay={() => setPaying(true)} />
      {paying ? <Checkout onClose={() => setPaying(false)} /> : null}
    </KeyboardAvoidingView>
  );
}

/** The products: search, the scan button, and a row per item that toggles it in and out of the cart. */
function Products() {
  const { store, act, go, did } = useSandbox();
  const [search, setSearch] = useState('');
  const typed = search.trim();
  const shown = store.items.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(typed.toLowerCase()));

  return (
    <View style={styles.fill}>
      <View style={styles.search}>
        <TextInput mode="outlined" placeholder="Search by name or code" value={search} onChangeText={setSearch} left={<TextInput.Icon icon="search" />} style={styles.fill} />
        <GuideTarget target={T.registerScan}>
          <IconButton icon="scan" mode="outlined" size={26} style={styles.scan} accessibilityLabel="Scan a barcode" onPress={() => { did(T.registerScan); go('scan-sell'); }} />
        </GuideTarget>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <GuideTarget target={T.registerItem}>
          {shown.length === 0 ? <Text variant="bodyMedium" style={styles.page}>{`No item matches “${typed}”.`}</Text> : null}
          {shown.map((item) => {
            const picked = store.cart.some((entry) => entry.code === item.code);
            return (
              <ProductRow
                key={item.code}
                name={item.name}
                facts={`${item.code} · ${peso(item.price)} · ${item.stock} on hand`}
                picked={picked}
                onPress={() => {
                  act((current) => (picked ? removeFromCart(current, item.code) : addToCart(current, item.code)));
                  did(T.registerItem);
                }}
              />
            );
          })}
        </GuideTarget>
      </ScrollView>
    </View>
  );
}

/** "Cart", its line count and Clear all, then a card per line — the right pane wide, the Cart tab narrow. */
function CartPane() {
  const sandbox = useSandbox();
  const { store, act } = sandbox;
  const { colors } = useAppTheme();
  const [clearing, setClearing] = useState(false);
  const lines = cartLines(store);

  return (
    <View style={styles.fill}>
      <View style={styles.cartHead}>
        <View style={styles.fill}>
          <Text variant="headlineSmall">Cart</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {plural(lines.length, 'line')}
          </Text>
        </View>
        <Button mode="text" textColor={colors.accent} disabled={lines.length === 0} onPress={() => setClearing(true)}>
          Clear all
        </Button>
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {lines.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
            <Text variant="titleMedium">Cart is empty</Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
              Tap a product to add it here.
            </Text>
          </View>
        ) : (
          lines.map((line, index) => <CartCard key={line.code} line={line} first={index === 0} />)
        )}
      </ScrollView>
      {clearing ? (
        <AdaptiveDialog
          kicker="Cart"
          title="Clear the cart?"
          onDismiss={() => setClearing(false)}
          actions={
            <SandboxContext value={sandbox}>
              <Button onPress={() => setClearing(false)}>Keep it</Button>
              <Button
                textColor={colors.error}
                onPress={() => {
                  act((current) => ({ ...current, cart: [] }));
                  setClearing(false);
                }}
              >
                Clear all
              </Button>
            </SandboxContext>
          }
        >
          <Text variant="bodyMedium">{`${countOf(lines)} come out of the cart. Nothing is sold or saved.`}</Text>
        </AdaptiveDialog>
      ) : null}
    </View>
  );
}

/** One line, a card (src/screens/register/cart-line.tsx): the item, the stepper, the Discount chip and the amount. */
function CartCard({ line, first }: { line: OrderLine; first: boolean }) {
  const { act, holds, did } = useSandbox();
  const { colors } = useAppTheme();
  const [pricing, setPricing] = useState(false);
  const discount = line.discount ?? 0;

  return (
    <View style={[styles.lineCard, { borderColor: colors.outlineVariant }]}>
      <View style={styles.lineHead}>
        <View style={styles.fill}>
          <Text variant="titleMedium">{line.name}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
            {[`${peso(line.rate)} per Nos`, discount > 0 ? `${discount}% off` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <IconButton icon="delete" style={styles.trash} accessibilityLabel={`Remove ${line.name} from the cart`} onPress={() => act((current) => removeFromCart(current, line.code))} />
      </View>
      <View style={styles.controls}>
        <Ring target={T.cartMore} on={first}>
          <Stepper
            value={line.qty}
            unit="Nos"
            onChange={(qty) => {
              if (qty > line.qty) did(T.cartMore);
              act((current) => setQty(current, line.code, qty));
            }}
          />
        </Ring>
        {holds('apply_discounts') ? (
          <Ring target={T.cartChip} on={first}>
            <DiscountChip
              open={pricing}
              on={discount > 0}
              onPress={() => {
                did(T.cartChip);
                setPricing(!pricing);
              }}
            />
          </Ring>
        ) : null}
        <Text variant="amount" style={styles.amount}>
          {peso(line.qty * line.rate * (1 - discount / 100))}
        </Text>
      </View>
      {pricing ? (
        <Ring target={T.cartDiscount} on={first}>
          <FieldGrid>
            <NumberField
              label="Discount (%)"
              hint="Off the price list's rate"
              value={discount > 0 ? discount : null}
              placeholder="0"
              blank
              min={0}
              onChange={(value) => {
                act((current) => setDiscount(current, line.code, value ?? 0));
                if ((value ?? 0) > 0) did(T.cartDiscount);
              }}
            />
          </FieldGrid>
        </Ring>
      ) : null}
    </View>
  );
}

/** Under both panes: the cart's count and total, and Complete Order. */
function OrderBar({ onPay }: { onPay: () => void }) {
  const { store } = useSandbox();
  const { colors } = useAppTheme();
  const bottom = useBottomInset();
  const lines = cartLines(store);

  return (
    <View style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface, paddingBottom: spacing.ms + bottom }]}>
      <View style={styles.fill}>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {countOf(lines)}
        </Text>
        <Text variant="titleLarge">{peso(totals(lines).rounded)}</Text>
      </View>
      <GuideButton target={T.registerPay} mode="contained" disabled={lines.length === 0} onPress={onPay}>
        Complete Order
      </GuideButton>
    </View>
  );
}

// The quick amounts under Cash: the exact total, then the notes a customer hands over that cover it.
const NOTES = [100, 200, 500, 1000];

/** Complete order (src/screens/register/cart.tsx): the totals, the cash handed over with its quick amounts, the change. */
function Checkout({ onClose }: { onClose: () => void }) {
  const sandbox = useSandbox();
  const { store, act, go } = sandbox;
  const { colors } = useAppTheme();
  const lines = cartLines(store);
  const figures = totals(lines);
  const [cash, setCash] = useState<number | null>(figures.rounded);
  const paid = cash ?? 0;
  const short = paid < figures.rounded;

  const complete = () => {
    const result = completeOrder(store);
    if (!result) return;
    act(() => result.store);
    onClose();
    // Main Register prints a receipt on each sale: the sale's page, opened after it.
    go('receipt', { saleId: result.id });
  };

  return (
    <AdaptiveDialog
      title="Complete order"
      onDismiss={onClose}
      notice={short ? { type: 'error', text: `${peso(figures.rounded - paid)} is still to pay.` } : null}
      // A Dialog is drawn in Paper's Portal, outside the sandbox's tree: its body and buttons get the sandbox again.
      actions={
        <SandboxContext value={sandbox}>
          <Button mode="outlined" onPress={onClose} contentStyle={styles.leading}>
            Back to cart
          </Button>
          <GuideButton target={T.cartComplete} mode="contained" disabled={short} onPress={complete} contentStyle={styles.leading}>
            Complete Order
          </GuideButton>
        </SandboxContext>
      }
    >
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {countOf(lines)}
      </Text>
      <SampleBox>
        <SampleLine label="Net Total" value={peso(figures.net)} />
        <SampleLine label="VAT @ 12" value={peso(figures.tax)} />
        <SampleLine label="Grand Total" value={peso(figures.total)} />
        <SampleLine label="Rounded Total" value={peso(figures.rounded)} />
      </SampleBox>
      <View style={styles.heading}>
        <Text variant="titleMedium">Payment</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          What the customer hands over, by payment method
        </Text>
      </View>
      <FieldGrid>
        <NumberField label="Cash" value={cash} placeholder="0" blank min={0} onChange={setCash} />
      </FieldGrid>
      <View style={styles.quick}>
        {[figures.rounded, ...NOTES.filter((note) => note > figures.rounded)].map((note, index) => (
          <Chip key={note} mode="outlined" compact onPress={() => setCash(note)}>
            {index === 0 ? `Exact ${peso(note)}` : peso(note)}
          </Chip>
        ))}
      </View>
      <SampleBox>
        <SampleLine label="Paid" value={peso(paid)} />
        {short ? <SampleLine label="To Pay" value={peso(figures.rounded - paid)} /> : <SampleLine label="Change" value={peso(paid - figures.rounded)} />}
      </SampleBox>
    </AdaptiveDialog>
  );
}

type Scanned = { key: number; code: string; name: string; price: number };

/** The practice camera: no camera, a button that "shows" it a barcode, and the Scanned list of what each one added. */
export function ScanSell() {
  const { store, act, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [line, setLine] = useState('Ready to scan');
  const [scanned, setScanned] = useState<Scanned[]>([]);
  const coffee = store.items[0];

  const show = () => {
    const next = addToCart(store, coffee.code);
    act(() => next);
    setLine(`Added ${coffee.name} · ${next.cart.find((entry) => entry.code === coffee.code)?.qty ?? 1} in the cart`);
    setScanned([{ key: Date.now(), code: coffee.code, name: coffee.name, price: coffee.price }, ...scanned]);
    did(T.scanBarcode);
  };
  // A row's ✕, and Clear: each takes its one back out of the cart.
  const undo = (rows: Scanned[]) => {
    act((current) => rows.reduce((next, row) => takeFromCart(next, row.code), current));
    setScanned(scanned.filter((row) => !rows.includes(row)));
  };

  return (
    <Frame
      title="Scan to Sell"
      onBack={back}
      footer={
        <View style={styles.buttons}>
          <GuideButton target={T.scanDone} mode="text" onPress={back}>
            Done
          </GuideButton>
          <Button mode="text" textColor={colors.error} disabled={scanned.length === 0} onPress={() => undo(scanned)}>
            Clear
          </Button>
        </View>
      }
    >
      {/* Wide, the Scanned list beside the camera, as the real scan page's side panel. */}
      <View style={wide ? styles.scanRow : styles.scanColumn}>
        <View style={[styles.camera, wide ? styles.fill : null, { backgroundColor: colors.surfaceVariant }]}>
          <Icon source="camera" size={48} color={colors.onSurfaceMuted} />
          <Text variant="bodyMedium">{`Practice camera · barcode ${coffee.barcode}`}</Text>
          <Text variant="titleMedium" accessibilityLiveRegion="polite">
            {line}
          </Text>
          <GuideButton target={T.scanBarcode} mode="contained" icon="scan" onPress={show}>
            Show a Barcode
          </GuideButton>
        </View>
        <View style={wide ? [styles.fill, styles.scanColumn] : styles.scanColumn}>
          <ScannedList scanned={scanned} onUndo={undo} />
        </View>
      </View>
    </Frame>
  );
}

/** "Scanned" and its count, then a row per scan with its ✕ — or the dashed box before the first. */
function ScannedList({ scanned, onUndo }: { scanned: Scanned[]; onUndo: (rows: Scanned[]) => void }) {
  const { colors } = useAppTheme();

  return (
    <>
      <SectionHeading title="Scanned" hint={plural(scanned.length, 'product')} />
      {scanned.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceMuted }}>
            {'Nothing scanned yet.\nPoint at a barcode to add it to the cart.'}
          </Text>
        </View>
      ) : (
        <RowBox empty="">
          {scanned.map((row, index) => (
            <View key={row.key} style={[styles.scannedRow, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
              <View style={styles.fill}>
                <Text variant="titleMedium">{row.name}</Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                  {`${row.code} · ${peso(row.price)}`}
                </Text>
              </View>
              <IconButton icon="close" accessibilityLabel={`Take ${row.name} back out`} onPress={() => onUndo([row])} />
            </View>
          ))}
        </RowBox>
      )}
    </>
  );
}

/** The success check over a receipt that stands, with the store and a line. */
function Banner({ subtitle }: { subtitle?: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.banner}>
      <SuccessMark />
      <Text variant="titleMedium">{STORE_NAME}</Text>
      {subtitle ? (
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** A sale or a refund as its receipt prints it; the check over it while it stands. */
function ReceiptBody({ sale, banner }: { sale: Order; banner?: string | null }) {
  const { store } = useSandbox();
  const original = sale.returnAgainst ? store.sales.find((candidate) => candidate.id === sale.returnAgainst) : undefined;
  const figures = totals(sale.lines);

  return (
    <SampleBox>
      {banner !== null && sale.status === 'Submitted' ? <Banner subtitle={banner ?? (original ? 'Refund successful' : undefined)} /> : null}
      <Text variant="bodySmall">{[sale.number, displayDate(sale.date), sale.cashier].filter(Boolean).join(' · ')}</Text>
      {original ? <Text variant="bodySmall">{`Return against ${original.number}`}</Text> : null}
      {sale.lines.map((line) => (
        <SampleLine key={line.code} label={line.name} sub={`${line.qty} × ${peso(line.rate)}`} value={peso(line.qty * line.rate)} />
      ))}
      {figures.off !== 0 ? <SampleLine label="Item Discount" value={peso(-figures.off)} /> : null}
      <SampleLine label="Net Total" value={peso(sale.net)} />
      <SampleLine label="VAT @ 12" value={peso(sale.tax)} />
      <SampleLine label="Rounded Total" value={peso(sale.total)} />
      <SampleLine label={sale.total < 0 ? 'Refund · Cash' : 'Cash'} value={peso(sale.total)} />
    </SampleBox>
  );
}

const saleStatus = (sale: Order) => (sale.status === 'Cancelled' ? 'CANCELLED' : sale.returnAgainst ? 'RETURN' : 'SUBMITTED');

export function Orders() {
  const { store, go, back, did } = useSandbox();
  const sales = [...store.sales].reverse();

  return (
    <Frame title="Orders" meta={`${sales.length} sales`} onBack={back}>
      <GuideTarget target={T.ordersSale}>
        <RowBox empty="No sales yet.">
          {sales.map((sale, index) => (
            <ListRow
              key={sale.id}
              first={index === 0}
              title={sale.number}
              sub={`${displayDate(sale.date)} · ${sale.cashier}`}
              figure={peso(sale.total)}
              status={saleStatus(sale)}
              alert={sale.status === 'Cancelled'}
              onPress={() => {
                did(T.ordersSale);
                go('sale', { saleId: sale.id });
              }}
            />
          ))}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

const statusLine = (sale: Order, original: Order | undefined) =>
  [sale.status, original ? `Return against ${original.number}` : null].filter(Boolean).join(' · ');

/**
 * A sale's page (src/screens/pos-orders/pos-invoice.tsx): its receipt with Refund and Cancel under it. `after`, opened
 * by the sale just made: no back arrow, and Return to Register — Android's back walks the practice pages back to it.
 */
export function SalePage({ after = false }: { after?: boolean }) {
  const { store, params, back, did } = useSandbox();
  const toRegister = useToRegister();
  const [confirming, setConfirming] = useState(false);
  const bottom = useBottomInset();
  const sale = store.sales.find((candidate) => candidate.id === params.saleId);
  if (!sale) {
    return (
      <Frame title="Sale" onBack={back}>
        <Text variant="bodyMedium">This sale is gone.</Text>
      </Frame>
    );
  }
  const original = sale.returnAgainst ? store.sales.find((candidate) => candidate.id === sale.returnAgainst) : undefined;

  return (
    <View style={styles.fill}>
      <GuideTarget target={T.saleBack}>
        <PageHeader
          kicker="POS Invoice"
          title={sale.number}
          meta={statusLine(sale, original)}
          onBack={
            after
              ? undefined
              : () => {
                  did(T.saleBack);
                  back();
                }
          }
        />
      </GuideTarget>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: spacing.md + bottom }]}>
        <View style={[styles.column, paperWidth('80mm')]}>
          <Text variant="headlineSmall">{sale.returnAgainst ? 'Refund' : 'Receipt'}</Text>
          <ReceiptBody sale={sale} />
          <SaleButtons sale={sale} onCancel={() => setConfirming(true)} />
          {after ? (
            <GuideButton target={T.receiptDone} mode="outlined" onPress={toRegister}>
              Return to Register
            </GuideButton>
          ) : null}
        </View>
      </ScrollView>
      {confirming ? <VoidDialog sale={sale} onClose={() => setConfirming(false)} /> : null}
    </View>
  );
}

/** Under the receipt, side by side: Refund (Process Refunds) and the red Cancel (Void Transactions). */
function SaleButtons({ sale, onCancel }: { sale: Order; onCancel: () => void }) {
  const { store, go, holds, did } = useSandbox();
  const { colors } = useAppTheme();
  const submitted = sale.status === 'Submitted';
  const canRefund = holds('process_refunds') && submitted && !sale.returnAgainst && returnable(store, sale.id).length > 0;
  const canCancel = holds('void_sales') && submitted;
  if (!canRefund && !canCancel) return null;

  return (
    <View style={styles.pair}>
      {canRefund ? (
        <View style={styles.fill}>
          <GuideButton target={T.saleReturn} mode="contained" onPress={() => go('return', { saleId: sale.id })}>
            Refund
          </GuideButton>
        </View>
      ) : null}
      {canCancel ? (
        <View style={styles.fill}>
          <GuideTarget target={T.saleCancel}>
            {/* The step moves on only for a sale that may be voided; a refused one just says why. */}
            <Button
              mode="contained"
              buttonColor={colors.error}
              textColor={colors.onError}
              onPress={() => {
                if (!voidRefusal(store, sale.id)) did(T.saleCancel);
                onCancel();
              }}
            >
              Cancel
            </Button>
          </GuideTarget>
        </View>
      ) : null}
    </View>
  );
}

/** Cancel's confirm: what a void does, or why this sale cannot be voided. */
function VoidDialog({ sale, onClose }: { sale: Order; onClose: () => void }) {
  const sandbox = useSandbox();
  const { store, act } = sandbox;
  const { colors } = useAppTheme();
  const refusal = voidRefusal(store, sale.id);

  return (
    <AdaptiveDialog
      kicker="Cancel"
      kickerTone="error"
      title={`Cancel ${sale.number}?`}
      onDismiss={onClose}
      // A Dialog is drawn in Paper's Portal, outside the sandbox's tree: its buttons get the sandbox again.
      actions={
        <SandboxContext value={sandbox}>
          <Button onPress={onClose}>Keep it</Button>
          {refusal ? null : (
            <GuideButton
              target={T.confirmYes}
              textColor={colors.error}
              onPress={() => {
                act((current) => voidSale(current, sale.id));
                onClose();
              }}
            >
              Cancel Sale
            </GuideButton>
          )}
        </SandboxContext>
      }
    >
      <Text variant="bodyMedium">{refusal ?? 'The sale stays in Orders as Cancelled, and its stock comes back.'}</Text>
    </AdaptiveDialog>
  );
}

/**
 * A sale's refund (src/screens/pos-orders/pos-return.tsx): how many of each to take back, then Approve Refund shows the
 * refund's receipt — nothing is saved until Return to Register. Cancel goes back to the quantities as they were left.
 */
export function ReturnPage() {
  const { store, params, back } = useSandbox();
  const [taking, setTaking] = useState<Record<string, number>>({});
  const [approved, setApproved] = useState(false);
  const sale = store.sales.find((candidate) => candidate.id === params.saleId);
  if (!sale) {
    return (
      <Frame title="Refund" onBack={back}>
        <Text variant="bodyMedium">This sale is gone.</Text>
      </Frame>
    );
  }
  if (approved) return <RefundReceipt sale={sale} taking={taking} onCancel={() => setApproved(false)} />;

  return <RefundForm sale={sale} taking={taking} onTake={(code, qty) => setTaking({ ...taking, [code]: qty })} onApprove={() => setApproved(true)} />;
}

/** What stands between the refund and Approve Refund, in words; null when it can be approved. */
function refundStops(mine: string | null, left: OrderLine[], taking: Record<string, number>) {
  if (!mine) return 'Open a session first: a refund comes out of your own drawer.';
  if (left.length === 0) return 'Everything on this sale has already been refunded.';
  const over = left.find((line) => (taking[line.code] ?? 0) > line.qty);
  if (over) return `Only ${over.qty} of ${over.name} is left to return.`;
  return left.some((line) => (taking[line.code] ?? line.qty) > 0) ? null : 'Enter a quantity to return.';
}

type FormProps = { sale: Order; taking: Record<string, number>; onTake: (code: string, qty: number) => void; onApprove: () => void };

function RefundForm({ sale, taking, onTake, onApprove }: FormProps) {
  const { store, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const session = store.sessions.find((candidate) => candidate.id === store.mine);
  const left = returnable(store, sale.id);
  const refund = totals(refundLines(store, sale.id, taking));
  const gap = refundStops(store.mine, left, taking);

  return (
    <Frame
      kicker="Refund"
      title={sale.number}
      meta={session ? `Session ${session.number}` : undefined}
      onBack={back}
      footer={
        <GuideButton
          target={T.returnComplete}
          mode="contained"
          disabled={gap !== null}
          onPress={() => {
            did(T.returnComplete);
            onApprove();
          }}
          contentStyle={styles.leading}
        >
          Approve Refund
        </GuideButton>
      }
    >
      {gap ? <NoteCallout tone="error">{gap}</NoteCallout> : null}
      <SectionHeading title="Items" hint="How many of each to take back" />
      <RowBox empty="Everything on this sale was refunded already.">
        {left.map((line, index) => (
          <View key={line.code} style={[styles.returnLine, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.outlineVariant }]}>
            <View style={styles.returnHead}>
              <Text variant="titleMedium" style={styles.fill}>
                {line.name}
              </Text>
              <Text variant="bodyMedium">{`${peso(line.rate)} per Nos`}</Text>
            </View>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {`${sale.lines.find((sold) => sold.code === line.code)?.qty ?? line.qty} sold, ${line.qty} left to return`}
            </Text>
            <FieldGrid>
              <NumberField label="Quantity to Return" hint="Nos" value={taking[line.code] ?? line.qty} placeholder="0" blank min={0} onChange={(qty) => onTake(line.code, qty ?? 0)} />
            </FieldGrid>
          </View>
        ))}
      </RowBox>
      <SectionHeading title="Refund" hint="All of it goes back by Cash" />
      <SampleBox>
        <SampleLine label="Net Total" value={peso(refund.net)} />
        <SampleLine label="VAT @ 12" value={peso(refund.tax)} />
        <SampleLine label="Grand Total" value={peso(refund.total)} />
        <SampleLine label="Rounded Total" value={peso(refund.rounded)} />
        <SampleLine label="Refund · Cash" value={peso(refund.rounded)} />
      </SampleBox>
    </Frame>
  );
}

/** The approved refund's receipt, not saved yet: Cancel (and Back) to the quantities, Return to Register to save it. */
function RefundReceipt({ sale, taking, onCancel }: { sale: Order; taking: Record<string, number>; onCancel: () => void }) {
  const { store, act, did } = useSandbox();
  const { colors } = useAppTheme();
  const toRegister = useToRegister();
  const bottom = useBottomInset();
  const session = store.sessions.find((candidate) => candidate.id === store.mine);
  const lines = refundLines(store, sale.id, taking).map((line) => ({ ...line, qty: -line.qty }));
  const figures = totals(lines);
  const preview: Order = { id: 'preview', number: '', date: TODAY, cashier: ME, sessionId: store.mine ?? '', lines, net: figures.net, tax: figures.tax, total: figures.rounded, status: 'Submitted', returnAgainst: sale.id };

  // Back cancels, as the real preview's does: registered after the practice store's own, so it is asked first.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  const save = () => {
    const result = returnSale(store, sale.id, taking);
    if (!result) return;
    act(() => result.store);
    did(T.returnSave);
    toRegister();
  };

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Refund" title={sale.number} meta={`Not saved yet · Session ${session?.number ?? ''}`} />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: spacing.md + bottom }]}>
        <View style={[styles.column, paperWidth('80mm')]}>
          <Text variant="headlineSmall">Refund</Text>
          <ReceiptBody sale={preview} banner="Refund approved · saved when you return to the Register" />
          <Button mode="contained" buttonColor={colors.error} textColor={colors.onError} onPress={onCancel}>
            Cancel
          </Button>
          <GuideButton target={T.returnSave} mode="outlined" onPress={save}>
            Return to Register
          </GuideButton>
        </View>
      </ScrollView>
    </View>
  );
}

export function CloseSession() {
  const { store, act, params, reset, back, holds, did } = useSandbox();
  const [counted, setCounted] = useState('');
  const session = store.sessions.find((candidate) => candidate.id === (params.sessionId ?? store.mine));
  const value = amount(counted);
  if (!session) return <Frame title="Close Session" onBack={back}><Text variant="bodyMedium">No session to close.</Text></Frame>;
  const expected = expectedCash(store, session.id);
  const theirs = session.cashier !== ME;

  return (
    <Frame
      title="Close Session"
      meta={`${session.register} · ${session.cashier}`}
      onBack={back}
      footer={
        <GuideTarget target={T.closeSubmit}>
          <Button
            mode="contained"
            disabled={value === null || session.status !== 'Open' || (theirs && !holds('close_any_register'))}
            onPress={() => {
              act((current) => closeSession(current, session.id, value ?? 0));
              did(T.closeSubmit);
              reset('sell');
            }}
            contentStyle={styles.leading}
          >
            Close Session
          </Button>
        </GuideTarget>
      }
    >
      {theirs ? <NoteCallout>{`This is ${session.cashier}'s session. Close Any Register lets you close it for them.`}</NoteCallout> : null}
      <ReadOut label="Opened" value={`${displayDate(session.date)} with ${peso(session.opening)}`} />
      <ReadOut label="Expected in the drawer" value={peso(expected)} />
      <GuideTarget target={T.closeCounted}>
        <FieldGrid>
          <Field label="Cash" required hint="Counted">
            <TextInput
              mode="outlined"
              dense
              keyboardType="decimal-pad"
              value={counted}
              onChangeText={(text) => {
                setCounted(text);
                if (amount(text) !== null) did(T.closeCounted);
              }}
              accessibilityLabel="Cash counted"
            />
          </Field>
        </FieldGrid>
      </GuideTarget>
      {value !== null ? <ReadOut label="Difference" value={peso(value - expected)} /> : null}
    </Frame>
  );
}

export function OpeningEntries() {
  const { store, go, back, holds, did } = useSandbox();
  const sessions = [...store.sessions].reverse();

  return (
    <Frame title="POS Opening Entries" meta={`${sessions.length} sessions`} onBack={back}>
      <GuideTarget target={T.openingsOpenRow}>
        <RowBox empty="No sessions yet.">
          {sessions.map((session, index) => {
            const closable = session.status === 'Open' && (session.id === store.mine || holds('close_any_register'));
            return (
              <ListRow
                key={session.id}
                first={index === 0}
                title={session.number}
                sub={`${session.cashier} · ${session.register} · ${displayDate(session.date)}`}
                figure={peso(session.opening)}
                status={session.status === 'Open' ? 'OPEN' : 'CLOSED'}
                onPress={
                  closable
                    ? () => {
                        did(T.openingsOpenRow);
                        go('close-session', { sessionId: session.id });
                      }
                    : undefined
                }
              />
            );
          })}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

export function ClosingEntries() {
  const { store, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState<string | null>(null);
  const closed = store.sessions.filter((session) => session.status === 'Closed').reverse();

  return (
    <Frame title="POS Closing Entries" meta={`${closed.length} closed sessions`} onBack={back}>
      <GuideTarget target={T.closingsRow}>
        <RowBox empty="No session has closed yet.">
          {closed.map((session, index) => {
            const expected = expectedCash(store, session.id);
            const counted = session.counted ?? expected;
            return (
              <View key={session.id}>
                <ListRow
                  first={index === 0}
                  title={session.number.replace('OPE', 'CLO')}
                  sub={`${session.cashier} · ${displayDate(session.date)}`}
                  figure={peso(expected - session.opening)}
                  onPress={() => {
                    did(T.closingsRow);
                    setOpen(open === session.id ? null : session.id);
                  }}
                />
                {open === session.id ? (
                  <View style={[styles.details, { borderTopColor: colors.surfaceVariant }]}>
                    <SampleLine label="Opening" value={peso(session.opening)} />
                    <SampleLine label="Expected" value={peso(expected)} />
                    <SampleLine label="Counted" value={peso(counted)} />
                    <SampleLine label="Difference" value={peso(counted - expected)} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </RowBox>
      </GuideTarget>
    </Frame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  card: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  cardText: { gap: spacing.xs },
  cardTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms, paddingBottom: spacing.sm },
  // As tall as the outlined search field beside it.
  scan: { margin: 0, width: 50, height: 50 },
  list: { gap: spacing.ms, padding: spacing.md },
  page: { gap: spacing.ms, padding: spacing.md },
  panes: { flex: 1, flexDirection: 'row' },
  divided: { borderRightWidth: 1 },
  cartHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  empty: { gap: spacing.xs, alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, borderCurve: 'continuous' },
  lineCard: { gap: spacing.ms, padding: spacing.ms, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous' },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  trash: { margin: 0 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.ms },
  amount: { marginLeft: 'auto' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.ms, borderTopWidth: 1 },
  heading: { gap: spacing.xs, paddingTop: spacing.sm },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  camera: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous' },
  scanRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  scanColumn: { gap: spacing.ms },
  scannedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.ms, minHeight: 56 },
  banner: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  column: { gap: spacing.ms, width: '100%', alignSelf: 'center' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  returnLine: { gap: spacing.sm, padding: spacing.ms },
  returnHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  details: { gap: spacing.xs, padding: spacing.ms, borderTopWidth: 1 },
});
