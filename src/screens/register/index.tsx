import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Icon } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { useBinsQuery } from '../../features/bins/queries';
import { useMoney } from '../../features/currencies/queries';
import type { Item } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { additionalDiscount, buildSale, listPrice, offeredItems } from '../../features/pos-invoices/cart';
import { useSaleSetup } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { useBottomInset, useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { addToCart, cartQty, dropFromCart, takeFromCart, useCart, useCartDiscount } from '../../Store/cart';
import { openScan } from '../../Store/scan';
import type { ScanAnswer } from '../../Store/scan';
import { spacing } from '../../themes';
import { CartPane, CheckoutDialog, countOf } from './cart';

/**
 * The Register (docs.frappe.io/erpnext/point-of-sale): the items the session's POS Profile offers and the cart they
 * go into, with the sale's total and Complete Order under both. Wide, the two side by side; narrow, a Products and a
 * Cart tab. Complete Order opens the payment over the Register: a Dialog wide, the native sheet `sheets/checkout`
 * narrow (./cart.tsx).
 */
export function Register({ merchant }: { merchant: Merchant }) {
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!session || !profile) return <SessionState title="Register" query={query} />;

  return <Counter merchant={merchant} session={session} profile={profile} />;
}

export type Pane = 'items' | 'cart';

function Counter({ merchant, session, profile }: { merchant: Merchant; session: PosOpeningEntry; profile: PosProfile }) {
  const wide = useShellWide();
  const sale = useSaleSetup(merchant, profile);
  const bins = useBinsQuery({ merchantId: merchant.id, item: '', warehouse: profile.warehouse }).data;
  const lines = useCart(session.id);
  const money = useMoney(merchant);
  const [search, setSearch] = useState('');
  const [pane, setPane] = usePane(lines.length === 0);
  const payment = usePayment(merchant.id, wide);

  const header = <PageHeader kicker={profile.pos_profile_name} title="Register" meta={`Session ${session.name}`} onBack={() => router.back()} />;
  if (!sale || !bins) {
    return (
      <View style={styles.fill}>
        {header}
        <View style={styles.state}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  const onHand = new Map(bins.map((bin) => [bin.item_id, bin.actual_qty]));
  const offer = { groupIds: profile.pos_profile_item_groups.map((row) => row.item_group_id), hideUnavailable: profile.hide_unavailable_items, onHand };
  const offered = offeredItems(sale.items, sale.setup, { ...offer, search });
  const inCart = new Set(lines.map((line) => line.itemId));

  const facts = (item: Item) => itemFacts(item, sale, onHand, money);

  // A row toggles its item (the human, 2026-10-23): in at one, in the unit it sells in, or out whatever its quantity.
  // The quantity is the cart's stepper.
  const toggle = (item: Item) => (inCart.has(item.id) ? dropFromCart(session.id, item.id) : addToCart(session.id, item.id, item.sales_uom ?? item.stock_uom));

  const scan = () => {
    openScan({ title: 'Scan to Sell', mode: 'register', onBarcode: (code) => scanIntoCart(code, session.id, sale, offer, facts) });
    router.push('/scan');
  };

  const products = (
    <View style={styles.fill}>
      <View style={styles.search}>
        <TextInput
          style={styles.grow}
          mode="outlined"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or code"
          autoCapitalize="none"
          autoCorrect={false}
          left={<TextInput.Icon icon="search" />}
          accessibilityLabel="Search items"
        />
        <IconButton icon="scan" mode="outlined" size={26} style={styles.scan} onPress={scan} accessibilityLabel="Scan a barcode" />
      </View>
      {/* Every item of the system can be here, so FlashList (.claude/instruction_mds/frontend.md §4.2); one row type, one pool. */}
      <FlashList
        data={offered}
        keyExtractor={(item) => item.id}
        // Which items are in the cart is drawn on the rows.
        extraData={lines}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<NoProducts search={search} />}
        renderItem={({ item }) => <ProductRow name={item.item_name} facts={facts(item)} picked={inCart.has(item.id)} onPress={() => toggle(item)} />}
      />
    </View>
  );

  const cart = <CartPane merchant={merchant} session={session} profile={profile} sale={sale} />;

  return (
    // The Android build is edge-to-edge, so the window does not resize for the keyboard: without this a quantity or a
    // discount typed in the cart's lower cards is under it (src/components/form-footer.tsx, PageForm).
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      {header}
      {wide ? (
        <WidePanes products={products} cart={cart} />
      ) : (
        <>
          <PaneTabs pane={pane} count={lines.length} onPane={setPane} />
          <View style={styles.fill}>{pane === 'items' ? products : cart}</View>
        </>
      )}
      <OrderBar session={session} profile={profile} sale={sale} money={money} onPay={payment.open} />
      {payment.paying ? <CheckoutDialog merchant={merchant} onDismiss={payment.close} /> : null}
    </KeyboardAvoidingView>
  );
}

type SaleData = NonNullable<ReturnType<typeof useSaleSetup>>;
type Offer = Omit<Parameters<typeof offeredItems>[2], 'search'>;

/** What a row says under the name: its code, its price in the unit it sells in, and what is on hand. */
function itemFacts(item: Item, { setup, engines }: SaleData, onHand: Map<string, number>, money: (value: number) => string) {
  const price = listPrice(item, item.sales_uom ?? item.stock_uom, setup, engines);
  return [item.item_code, price ? money(price.rate) : 'No price', item.is_stock_item ? `${onHand.get(item.id) ?? 0} on hand` : null].filter(Boolean).join(' · ');
}

/**
 * A code the scan read, into the cart: one more each time, as a tap on a row out of the cart would. A barcode first,
 * then an Item Code printed as one (a shop's own Code 128 labels); an item this profile doesn't offer is refused, as
 * its row is missing here. Its Scanned row takes that one back out.
 */
function scanIntoCart(code: string, sessionId: string, sale: SaleData, offer: Offer, facts: (item: Item) => string): ScanAnswer {
  const item = sale.items.find((candidate) => candidate.barcode === code) ?? sale.items.find((candidate) => candidate.item_code === code);
  if (!item) return { notice: { type: 'error', text: `No item has the barcode ${code}.` } };
  if (offeredItems([item], sale.setup, { ...offer, search: '' }).length === 0) return { notice: { type: 'error', text: `${item.item_name} isn't sold at this register.` } };
  const uom = item.sales_uom ?? item.stock_uom;
  addToCart(sessionId, item.id, uom);
  return {
    notice: { type: 'info', text: `Added ${item.item_name} · ${cartQty(sessionId, item.id, uom)} in the cart` },
    entry: { title: item.item_name, sub: facts(item), undo: () => takeFromCart(sessionId, item.id, uom) },
  };
}

/**
 * Which pane a phone shows. A sale completed or the cart cleared: the next sale starts from the products — adjusted
 * while rendering, as React has a changed prop adjust state, not in an effect a frame later.
 */
export function usePane(empty: boolean) {
  const [pane, setPane] = useState<Pane>('items');
  const [wasEmpty, setWasEmpty] = useState(empty);
  if (empty !== wasEmpty) {
    setWasEmpty(empty);
    if (empty) setPane('items');
  }

  return [pane, setPane] as const;
}

/** Complete Order's payment: wide, a Dialog of this page's own; narrow, the native sheet route. */
function usePayment(merchantId: string, wide: boolean) {
  const [paying, setPaying] = useState(false);

  return {
    paying,
    open: () => (wide ? setPaying(true) : router.push({ pathname: '/sheets/checkout', params: { id: merchantId } })),
    close: () => setPaying(false),
  };
}

/** Wide: two equal panes of the shell's pane, flex shares rather than a measured width (rule 15), a 1px rule between. */
function WidePanes({ products, cart }: { products: ReactNode; cart: ReactNode }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.panes}>
      <View style={[styles.fill, styles.divided, { borderRightColor: colors.outlineVariant }]}>{products}</View>
      <View style={styles.fill}>{cart}</View>
    </View>
  );
}

/** No product to show: none matches what is typed, or the profile offers none yet. */
function NoProducts({ search }: { search: string }) {
  const typed = search.trim();

  return (
    <View style={styles.state}>
      <Text variant="bodyMedium">{typed ? `No item matches “${typed}”.` : 'This POS Profile has no item to sell yet. Add items in Stock, or check its item groups.'}</Text>
    </View>
  );
}

type BarProps = { session: PosOpeningEntry; profile: PosProfile; sale: SaleData; money: (value: number) => string; onPay: () => void };

/**
 * Under both panes: the cart's count and total, and Complete Order — clear of the system navigation bar. The total is
 * the payment's: less the additional discount typed there.
 */
function OrderBar({ session, profile, sale, money, onPay }: BarProps) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const bottom = useBottomInset();
  const lines = useCart(session.id);
  const discount = useCartDiscount(session.id);
  const total = buildSale(lines, sale.setup, sale.engines, additionalDiscount(discount, profile)).roundedTotal;

  return (
    <View style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface, paddingBottom: spacing.ms + bottom }]}>
      <View style={styles.grow}>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          {countOf(lines)}
        </Text>
        <Text variant="titleLarge">{money(total)}</Text>
      </View>
      <Button mode="contained" disabled={lines.length === 0} onPress={onPay} style={wide ? styles.payWide : styles.pay}>
        Complete Order
      </Button>
    </View>
  );
}

/** One item to sell: its name and facts, and the circle that says whether it is in the cart — + to add, ✓ once in. */
export function ProductRow({ name, facts, picked, onPress }: { name: string; facts: string; picked: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
      android_ripple={{ color: colors.ripple }}
      accessibilityRole="button"
      accessibilityState={{ selected: picked }}
      accessibilityLabel={picked ? `${name}, in the cart. Remove it` : `Add ${name} to the cart`}
      style={[styles.row, { borderBottomColor: colors.outlineVariant, backgroundColor: picked ? colors.surfaceMuted : colors.surface }]}
    >
      <View style={styles.rowText}>
        <Text variant="titleMedium" style={picked ? { color: colors.onSurfaceFaint } : null}>
          {name}
        </Text>
        <Text variant="bodySmall" style={{ color: picked ? colors.onSurfaceFaint : colors.onSurfaceMuted }}>
          {facts}
        </Text>
      </View>
      <View style={[styles.toggle, picked ? { backgroundColor: colors.onSurfaceFaint, borderColor: colors.onSurfaceFaint } : { borderColor: colors.accent }]}>
        <Icon source={picked ? 'check' : 'add'} size={20} color={picked ? colors.surface : colors.accent} />
      </View>
    </Pressable>
  );
}

/** Narrow: the Products and Cart tabs under the page header, the cart's line count on its own. */
export function PaneTabs({ pane, count, onPane }: { pane: Pane; count: number; onPane: (pane: Pane) => void }) {
  const { colors } = useAppTheme();
  const tabs: { value: Pane; label: string }[] = [
    { value: 'items', label: 'Products' },
    { value: 'cart', label: 'Cart' },
  ];

  return (
    <View style={[styles.tabs, { borderBottomColor: colors.outlineVariant }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const on = tab.value === pane;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onPane(tab.value)}
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.value === 'cart' ? `Cart, ${count} ${count === 1 ? 'line' : 'lines'}` : tab.label}
            style={[styles.tab, { borderBottomColor: on ? colors.accent : 'transparent' }]}
          >
            <Text variant="labelLarge" style={{ color: on ? colors.onSurface : colors.onSurfaceMuted }}>
              {tab.label}
            </Text>
            {tab.value === 'cart' && count > 0 ? <Badge style={{ backgroundColor: colors.accent, color: colors.onAccent }}>{count}</Badge> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  panes: { flex: 1, flexDirection: 'row' },
  divided: { borderRightWidth: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms, paddingBottom: spacing.sm },
  // As tall as the outlined search field beside it.
  scan: { margin: 0, width: 50, height: 50 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.ms, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  rowText: { flex: 1, gap: spacing.xs },
  // A fixed-size control (.claude/instruction_mds/frontend.md §4.6): the 32dp circle, ringed in accent or filled.
  toggle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 48, borderBottomWidth: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.ms, borderTopWidth: 1 },
  pay: { flex: 1, maxWidth: 220 },
  payWide: { minWidth: 200 },
});
