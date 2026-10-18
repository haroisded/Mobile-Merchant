import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { FormFooter } from '../../components/form-footer';
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
import { useShellWide } from '../../lib/columns';
import { useAppTheme } from '../../lib/theme';
import { addToCart, cartQty, useCart, useCartDiscount } from '../../Store/cart';
import { openScan } from '../../Store/scan';
import { spacing } from '../../themes';
import { CartPane } from './cart';

/**
 * The Register (docs.frappe.io/erpnext/point-of-sale): the items the session's POS Profile offers, each a tap
 * away from the cart. Narrow, the cart is a page further (./cart.tsx), reached from the bar at the bottom; wide,
 * it is the right pane beside the items (CartPane), so a tap shows in the cart at once.
 */
export function Register({ merchant }: { merchant: Merchant }) {
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!session || !profile) return <SessionState title="Register" query={query} />;

  return <Counter merchant={merchant} session={session} profile={profile} />;
}

function Counter({ merchant, session, profile }: { merchant: Merchant; session: PosOpeningEntry; profile: PosProfile }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const sale = useSaleSetup(merchant, profile);
  const bins = useBinsQuery({ merchantId: merchant.id, item: '', warehouse: profile.warehouse }).data;
  const lines = useCart(session.id);
  const discount = useCartDiscount(session.id);
  const money = useMoney(merchant);
  const [search, setSearch] = useState('');

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

  const { setup, engines } = sale;
  const onHand = new Map(bins.map((bin) => [bin.item_id, bin.actual_qty]));
  const offer = { groupIds: profile.pos_profile_item_groups.map((row) => row.item_group_id), hideUnavailable: profile.hide_unavailable_items, onHand };
  const offered = offeredItems(sale.items, setup, { ...offer, search });
  const inCart = new Map<string, number>();
  for (const line of lines) inCart.set(line.itemId, (inCart.get(line.itemId) ?? 0) + line.qty);
  // The bar's total is the Cart's: less the additional discount typed there.
  const total = buildSale(lines, setup, engines, additionalDiscount(discount, profile)).roundedTotal;
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  // What a row says under the name: its code, its price in the unit it sells in, and what is on hand.
  const facts = (item: Item) => {
    const price = listPrice(item, item.sales_uom ?? item.stock_uom, setup, engines);
    return [item.item_code, price ? money(price.rate) : 'No price', item.is_stock_item ? `${onHand.get(item.id) ?? 0} on hand` : null].filter(Boolean).join(' · ');
  };

  // The scan adds what a tap on its row would: one, in the unit it sells in. A barcode first, then an Item Code
  // printed as one (a shop's own Code 128 labels); an item this profile doesn't offer is refused, as its row is
  // missing here.
  const scan = () => {
    openScan({
      title: 'Scan to Sell',
      mode: 'register',
      onBarcode: (code) => {
        const item = sale.items.find((candidate) => candidate.barcode === code) ?? sale.items.find((candidate) => candidate.item_code === code);
        if (!item) return { type: 'error', text: `No item has the barcode ${code}.` };
        if (offeredItems([item], setup, { ...offer, search: '' }).length === 0) return { type: 'error', text: `${item.item_name} isn't sold at this register.` };
        const uom = item.sales_uom ?? item.stock_uom;
        addToCart(session.id, item.id, uom);
        return { type: 'info', text: `Added ${item.item_name} · ${cartQty(session.id, item.id, uom)} in the cart` };
      },
    });
    router.push('/scan');
  };

  const items = (
    <View style={styles.fill}>
      <View style={styles.search}>
        <TextInput
          style={styles.grow}
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or code"
          autoCapitalize="none"
          autoCorrect={false}
          left={<TextInput.Icon icon="search" />}
          accessibilityLabel="Search items"
        />
        <IconButton icon="scan" mode="outlined" onPress={scan} accessibilityLabel="Scan a barcode" />
      </View>
      {/* Every item of the system can be here, so FlashList (.claude/instruction_mds/frontend.md §4.2); one row type, one pool. */}
      <FlashList
        data={offered}
        keyExtractor={(item) => item.id}
        // The quantities in the cart are drawn on the rows.
        extraData={lines}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.state}>
            <Text variant="bodyMedium">{search.trim() ? 'No item matches that search.' : 'This POS Profile has no item to sell yet. Add items in Stock, or check its item groups.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => addToCart(session.id, item.id, item.sales_uom ?? item.stock_uom)}
            // Pressable reads no theme, so the press colour is passed every time (.claude/instruction_mds/frontend.md §5).
            android_ripple={{ color: colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.item_name} to the cart${inCart.has(item.id) ? `, ${inCart.get(item.id)} in the cart` : ''}`}
            style={[styles.row, { borderBottomColor: colors.surfaceVariant }]}
          >
            <View style={styles.rowText}>
              <Text variant="titleMedium">{item.item_name}</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
                {facts(item)}
              </Text>
            </View>
            {inCart.has(item.id) ? (
              <Text variant="titleMedium" style={{ color: colors.accent }}>
                {`× ${inCart.get(item.id)}`}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <View style={styles.fill}>
      {header}
      {/* Two panes of the shell's pane, flex shares rather than a measured width (rule 15): the items, then the cart
          behind a 1px rule (.claude/instruction_mds/frontend.md §5, Register and Cart). */}
      {wide ? (
        <View style={styles.panes}>
          <View style={styles.itemsPane}>{items}</View>
          <View style={[styles.cartPane, { borderLeftColor: colors.outlineVariant }]}>
            <CartPane merchant={merchant} session={session} profile={profile} />
          </View>
        </View>
      ) : (
        <>
          {items}
          <CartBar merchantId={merchant.id} count={count} total={money(total)} />
        </>
      )}
    </View>
  );
}

/** Narrow only, the bar to the cart's page: wide, the cart is beside the list, and a full-width bar across a tablet reads as a banner. */
function CartBar({ merchantId, count, total }: { merchantId: string; count: number; total: string }) {
  return (
    <FormFooter notice={null}>
      <Button
        mode="contained"
        disabled={count === 0}
        onPress={() => router.push({ pathname: '/systems/[id]/sell/cart', params: { id: merchantId } })}
        contentStyle={styles.leading}
      >
        {count === 0 ? 'Cart is empty' : `Cart · ${count} ${count === 1 ? 'item' : 'items'} · ${total}`}
      </Button>
    </FormFooter>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panes: { flex: 1, flexDirection: 'row' },
  // The cart has more to lay out than the item list: three parts in five.
  itemsPane: { flex: 2 },
  cartPane: { flex: 3, borderLeftWidth: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.ms, paddingBottom: spacing.sm },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  rowText: { flex: 1, gap: spacing.xs },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
});
