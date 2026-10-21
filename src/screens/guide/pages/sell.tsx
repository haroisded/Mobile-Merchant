import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AdaptiveDialog } from '../../../components/adaptive-dialog';
import { Button } from '../../../components/button';
import { Field, FieldGrid } from '../../../components/form-fields';
import { FormFooter } from '../../../components/form-footer';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { NoteCallout } from '../../../components/note-callout';
import { PageHeader } from '../../../components/page-header';
import { SampleBox, SampleLine } from '../../../components/sample-box';
import { SectionHeading } from '../../../components/section-heading';
import { RowBox } from '../../../components/row-box';
import { Text } from '../../../components/text';
import { TextInput } from '../../../components/text-input';
import { useShellWide } from '../../../lib/columns';
import { displayDate } from '../../../lib/dates';
import { useAppTheme } from '../../../lib/theme';
import { radius, spacing } from '../../../themes';
import { SandboxContext, useSandbox } from '../sandbox/context';
import { GuideButton, GuideTarget } from '../sandbox/guide-target';
import {
  addToCart,
  cartLines,
  closeSession,
  completeOrder,
  expectedCash,
  openSession,
  removeFromCart,
  returnable,
  returnSale,
  setDiscount,
  totals,
  voidRefusal,
  voidSale,
} from '../sandbox-state';
import { ME } from '../sandbox-state';
import type { Order } from '../sandbox-state';
import { T } from '../tasks';
import { Frame, IndexBoxes, ListRow, peso, ReadOut, STORE_NAME } from './frame';

// Sell in the practice store: src/screens/sell/, register/, pos-orders/, pos-opening-entries/ and pos-closing-entries/
// drawn again over the mock store — the same headers, boxes and buttons, with no query behind them.

/** A typed amount: blank or not a number is null. */
const amount = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text));

export function SellIndex() {
  const { holds } = useSandbox();

  return (
    <Frame title="Sell" meta="Sessions, the Register and what was sold">
      {holds('open_close_register') ? <SessionBox /> : null}
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
              { label: 'POS Closing Entries', hint: 'Each closed session and its count', show: holds('view_shift_totals'), page: 'closing-entries', target: T.sellClosings },
            ],
          },
        ]}
      />
    </Frame>
  );
}

/** The box above Sell's index (src/components/pos-session.tsx): the person's open session, or the way to open one. */
function SessionBox() {
  const { store, go, holds } = useSandbox();
  const { colors } = useAppTheme();
  const mine = store.sessions.find((session) => session.id === store.mine);

  return (
    <View style={[styles.box, { borderColor: colors.outlineVariant }]}>
      <Text variant="titleMedium">{mine ? 'Your session is open' : 'No session is open'}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
        {mine ? `${mine.register} · since ${displayDate(mine.date)} · opened with ${peso(mine.opening)}` : 'Open a session to start selling.'}
      </Text>
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

/** The Register: the items, and — on a tablet — the cart beside them, as src/screens/register/ lays them out. */
export function Register() {
  const { store, act, go, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const [search, setSearch] = useState('');
  const lines = cartLines(store);
  const figures = totals(lines, store.discount);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const shown = store.items.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(search.trim().toLowerCase()));

  if (!store.mine) {
    return (
      <Frame title="Register" onBack={back}>
        <NoteCallout>Open a session first: a sale is rung up only inside an open session.</NoteCallout>
      </Frame>
    );
  }

  const items = (
    <View style={styles.fill}>
      <View style={styles.search}>
        <TextInput mode="outlined" dense placeholder="Search by name or code" value={search} onChangeText={setSearch} left={<TextInput.Icon icon="search" />} style={styles.fill} />
        <GuideTarget target={T.registerScan}>
          <IconButton icon="scan" mode="outlined" accessibilityLabel="Scan to sell" onPress={() => { did(T.registerScan); go('scan-sell'); }} />
        </GuideTarget>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <GuideTarget target={T.registerItem}>
          <RowBox empty="No item matches the search.">
            {shown.map((item, index) => {
              const inCart = store.cart.find((entry) => entry.code === item.code)?.qty ?? 0;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    act((current) => addToCart(current, item.code));
                    did(T.registerItem);
                  }}
                  android_ripple={{ color: colors.ripple }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name}`}
                  style={[styles.itemRow, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}
                >
                  <View style={styles.fill}>
                    <Text variant="titleMedium">{item.name}</Text>
                    <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                      {`${item.code} · ${peso(item.price)} · ${item.stock} on hand`}
                    </Text>
                  </View>
                  {inCart > 0 ? (
                    <Text variant="titleMedium" style={{ color: colors.accent }}>
                      {inCart}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </RowBox>
        </GuideTarget>
      </ScrollView>
    </View>
  );

  if (wide) {
    return (
      <View style={styles.fill}>
        <PageHeader kicker="Main Register" title="Register" onBack={back} />
        <View style={styles.panes}>
          <View style={styles.itemsPane}>{items}</View>
          <View style={[styles.paneRule, { backgroundColor: colors.outlineVariant }]} />
          <View style={styles.cartPane}>
            <CartBody />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Main Register" title="Register" onBack={back} />
      {items}
      <FormFooter notice={null}>
        <GuideTarget target={T.registerCart}>
          <Button mode="contained" disabled={count === 0} onPress={() => { did(T.registerCart); go('cart'); }} contentStyle={styles.leading}>
            {`Cart · ${count} ${count === 1 ? 'item' : 'items'} · ${peso(figures.rounded)}`}
          </Button>
        </GuideTarget>
      </FormFooter>
    </View>
  );
}

/** The cart and its payment: its own page on a phone, the Register's right pane on a tablet. */
function CartBody() {
  const { store, act, go, did } = useSandbox();
  const lines = cartLines(store);

  const complete = () => {
    const result = completeOrder(store);
    if (!result) return;
    act(() => result.store);
    did(T.cartComplete);
    go('receipt', { saleId: result.id });
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <CartLines />
        {lines.length > 0 ? <CartTotals /> : null}
      </ScrollView>
      <FormFooter notice={null}>
        <GuideTarget target={T.cartComplete}>
          <Button mode="contained" disabled={lines.length === 0} onPress={complete} contentStyle={styles.leading}>
            Complete Order
          </Button>
        </GuideTarget>
      </FormFooter>
    </View>
  );
}

/** The cart's lines, each with its remove button; on a tablet under the pane's own heading. */
function CartLines() {
  const { store, act } = useSandbox();
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const lines = cartLines(store);

  return (
    <>
      {wide ? <SectionHeading title="Cart" hint={lines.length === 0 ? 'Nothing yet' : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`} /> : null}
      {lines.length === 0 ? <Text variant="bodyMedium">{wide ? 'The cart is empty. Tap an item to add it.' : 'The cart is empty. Go back to the Register and add an item.'}</Text> : null}
      {lines.map((line, index) => (
        <View key={line.code} style={[styles.cartLine, index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.surfaceVariant }]}>
          <View style={styles.fill}>
            <Text variant="titleMedium">{line.name}</Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
              {`${line.qty} × ${peso(line.rate)} = ${peso(line.qty * line.rate)}`}
            </Text>
          </View>
          <IconButton icon="delete" accessibilityLabel={`Remove ${line.name}`} onPress={() => act((current) => removeFromCart(current, line.code))} />
        </View>
      ))}
    </>
  );
}

/** The discount (with Apply Discounts), the totals and the payment. */
function CartTotals() {
  const { store, act, holds, did } = useSandbox();
  const [discount, setDiscountText] = useState(store.discount > 0 ? String(store.discount) : '');
  const figures = totals(cartLines(store), store.discount);

  return (
    <>
      {holds('apply_discounts') ? (
        <GuideTarget target={T.cartDiscount}>
          <FieldGrid>
            <Field label="Discount (%)" hint="Apply Discounts">
              <TextInput
                mode="outlined"
                dense
                keyboardType="decimal-pad"
                value={discount}
                onChangeText={(text) => {
                  setDiscountText(text);
                  const value = amount(text) ?? 0;
                  act((current) => setDiscount(current, value));
                  if (value > 0) did(T.cartDiscount);
                }}
                accessibilityLabel="Discount (%)"
              />
            </Field>
          </FieldGrid>
        </GuideTarget>
      ) : null}
      <SampleBox>
        <SampleLine label="Total" value={peso(figures.gross)} />
        {figures.off > 0 ? <SampleLine label={`Item Discount (${store.discount}%)`} value={peso(-figures.off)} /> : null}
        <SampleLine label="Net Total" value={peso(figures.net)} />
        <SampleLine label="VAT @ 12" value={peso(figures.tax)} />
        <SampleLine label="Grand Total" value={peso(figures.total)} />
        <SampleLine label="Rounded Total" value={peso(figures.rounded)} />
      </SampleBox>
      <SectionHeading title="Payment" hint="Cash is filled with the total" />
      <SampleBox>
        <SampleLine label="Cash" value={peso(figures.rounded)} />
        <SampleLine label="Change" value={peso(0)} />
      </SampleBox>
    </>
  );
}

export function CartPage() {
  const { back } = useSandbox();
  return (
    <View style={styles.fill}>
      <PageHeader kicker="Main Register" title="Cart" onBack={back} />
      <CartBody />
    </View>
  );
}

/** The practice camera: no camera, a button that "shows" it a barcode. */
export function ScanSell() {
  const { store, act, back, did } = useSandbox();
  const { colors } = useAppTheme();
  const [line, setLine] = useState('Point at a barcode to add it to the cart.');
  const coffee = store.items[0];

  return (
    <Frame
      title="Scan to Sell"
      onBack={back}
      footer={
        <View style={styles.buttons}>
          <GuideTarget target={T.scanBarcode}>
            <Button
              mode="contained"
              icon="scan"
              onPress={() => {
                const next = addToCart(store, coffee.code);
                act(() => next);
                setLine(`Added ${coffee.name} · ${next.cart.find((entry) => entry.code === coffee.code)?.qty ?? 1} in the cart`);
                did(T.scanBarcode);
              }}
            >
              Show a Barcode
            </Button>
          </GuideTarget>
          <GuideTarget target={T.scanDone}>
            <Button mode="outlined" onPress={() => { did(T.scanDone); back(); }}>
              Done
            </Button>
          </GuideTarget>
        </View>
      }
    >
      {/* The scan's line first: under a camera as wide as a tablet's pane it would sit below the fold. */}
      <Text variant="bodyMedium" accessibilityLiveRegion="polite">
        {line}
      </Text>
      <View style={[styles.camera, { backgroundColor: colors.surfaceVariant }]}>
        <Icon source="camera" size={48} color={colors.onSurfaceMuted} />
        <Text variant="bodyMedium">{`Practice camera · barcode ${coffee.barcode}`}</Text>
      </View>
    </Frame>
  );
}

/** A sale or a return as its receipt prints it. */
function ReceiptBody({ sale }: { sale: Order }) {
  const { store } = useSandbox();
  const original = sale.returnAgainst ? store.sales.find((candidate) => candidate.id === sale.returnAgainst) : undefined;
  const figures = totals(sale.lines, sale.discount);

  return (
    <SampleBox>
      <Text variant="titleMedium">{STORE_NAME}</Text>
      <Text variant="bodySmall">{`${sale.number} · ${displayDate(sale.date)} · ${sale.cashier}`}</Text>
      {original ? <Text variant="bodySmall">{`Return against ${original.number}`}</Text> : null}
      {sale.lines.map((line) => (
        <SampleLine key={line.code} label={line.name} sub={`${line.qty} × ${peso(line.rate)}`} value={peso(line.qty * line.rate)} />
      ))}
      {figures.off !== 0 ? <SampleLine label={`Item Discount (${sale.discount}%)`} value={peso(-figures.off)} /> : null}
      <SampleLine label="Net Total" value={peso(sale.net)} />
      <SampleLine label="VAT @ 12" value={peso(sale.tax)} />
      <SampleLine label="Rounded Total" value={peso(sale.total)} />
      <SampleLine label={sale.total < 0 ? 'Refund · Cash' : 'Cash'} value={peso(sale.total)} />
    </SampleBox>
  );
}

export function ReceiptPage() {
  const { store, params, reset, did } = useSandbox();
  const sale = store.sales.find((candidate) => candidate.id === params.saleId);

  return (
    <Frame
      title={sale?.returnAgainst ? 'Return' : 'Receipt'}
      meta={sale ? `${sale.number} · Submitted` : undefined}
      footer={
        <GuideTarget target={T.receiptDone}>
          <Button mode="contained" onPress={() => { did(T.receiptDone); reset('sell'); }} contentStyle={styles.leading}>
            Done
          </Button>
        </GuideTarget>
      }
    >
      {sale ? <ReceiptBody sale={sale} /> : <Text variant="bodyMedium">This sale is gone.</Text>}
    </Frame>
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

export function SalePage() {
  const { store, params, back, did } = useSandbox();
  const [confirming, setConfirming] = useState(false);
  const sale = store.sales.find((candidate) => candidate.id === params.saleId);
  if (!sale) {
    return (
      <Frame title="Sale" onBack={back}>
        <Text variant="bodyMedium">This sale is gone.</Text>
      </Frame>
    );
  }

  return (
    <View style={styles.fill}>
      <GuideTarget target={T.saleBack}>
        <PageHeader
          kicker={STORE_NAME}
          title={sale.number}
          meta={sale.status === 'Cancelled' ? 'Cancelled' : sale.returnAgainst ? 'Submitted · Return' : 'Submitted'}
          onBack={() => {
            did(T.saleBack);
            back();
          }}
          actions={<SaleActions sale={sale} onCancel={() => setConfirming(true)} />}
        />
      </GuideTarget>
      <ScrollView contentContainerStyle={styles.page}>
        <ReceiptBody sale={sale} />
      </ScrollView>
      {confirming ? <VoidDialog sale={sale} onClose={() => setConfirming(false)} /> : null}
    </View>
  );
}

/** A sale's Return (Process Refunds) and red Cancel (Void Transactions), as DocumentHeader shows them. */
function SaleActions({ sale, onCancel }: { sale: Order; onCancel: () => void }) {
  const { store, go, holds, did } = useSandbox();
  const { colors } = useAppTheme();
  const submitted = sale.status === 'Submitted';
  const canReturn = holds('process_refunds') && submitted && !sale.returnAgainst && returnable(store, sale.id).length > 0;

  return (
    <>
      {canReturn ? (
        <GuideButton target={T.saleReturn} mode="outlined" onPress={() => go('return', { saleId: sale.id })}>
          Return
        </GuideButton>
      ) : null}
      {holds('void_sales') && submitted ? (
        <GuideTarget target={T.saleCancel}>
          {/* The step moves on only for a sale that may be voided; a refused one just says why. */}
          <Button
            mode="outlined"
            textColor={colors.error}
            onPress={() => {
              if (!voidRefusal(store, sale.id)) did(T.saleCancel);
              onCancel();
            }}
          >
            Cancel
          </Button>
        </GuideTarget>
      ) : null}
    </>
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

export function ReturnPage() {
  const { store, act, params, replace, back, did } = useSandbox();
  const sale = store.sales.find((candidate) => candidate.id === params.saleId);
  const left = sale ? returnable(store, sale.id) : [];
  const refund = totals(left, sale?.discount ?? 0);

  const complete = () => {
    if (!sale) return;
    const result = returnSale(store, sale.id);
    if (!result) return;
    act(() => result.store);
    did(T.returnComplete);
    replace('receipt', { saleId: result.id });
  };

  return (
    <Frame
      title="Return"
      meta={sale ? `Against ${sale.number}` : undefined}
      onBack={back}
      footer={
        <GuideTarget target={T.returnComplete}>
          <Button mode="contained" disabled={!store.mine || left.length === 0} onPress={complete} contentStyle={styles.leading}>
            Complete Return
          </Button>
        </GuideTarget>
      }
    >
      {store.mine ? null : <NoteCallout tone="error">Open a session first: a refund comes out of your own drawer.</NoteCallout>}
      <RowBox empty="Everything on this sale was returned already.">
        {left.map((line, index) => (
          <ListRow key={line.code} first={index === 0} title={line.name} sub={`${peso(line.rate)} · quantity to return ${line.qty}`} figure={peso(line.qty * line.rate)} />
        ))}
      </RowBox>
      {left.length > 0 ? (
        <SampleBox>
          <SampleLine label="Net Total" value={peso(refund.net)} />
          <SampleLine label="VAT @ 12" value={peso(refund.tax)} />
          <SampleLine label="Refund · Handed Back in Cash" value={peso(refund.rounded)} />
        </SampleBox>
      ) : null}
    </Frame>
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
  box: { borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.ms, gap: spacing.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms },
  list: { gap: spacing.ms, padding: spacing.md },
  page: { gap: spacing.ms, padding: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, padding: spacing.ms, minHeight: 56 },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  panes: { flex: 1, flexDirection: 'row' },
  itemsPane: { flex: 2 },
  cartPane: { flex: 3 },
  paneRule: { width: 1 },
  camera: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous' },
  details: { gap: spacing.xs, padding: spacing.ms, borderTopWidth: 1 },
});
