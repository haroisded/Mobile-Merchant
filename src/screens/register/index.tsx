import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { FormFooter } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { SessionState, useRegisterSession } from '../../components/pos-session';
import { Text } from '../../components/text';
import { TextInput } from '../../components/text-input';
import { useBinsQuery } from '../../features/bins/queries';
import { useMoney } from '../../features/currencies/queries';
import type { Item } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { buildSale, listPrice, offeredItems } from '../../features/pos-invoices/cart';
import { useSaleSetup } from '../../features/pos-invoices/setup';
import type { PosOpeningEntry } from '../../features/pos-opening-entries/queries';
import type { PosProfile } from '../../features/pos-profiles/queries';
import { useAppTheme } from '../../lib/theme';
import { addToCart, useCart } from '../../Store/cart';
import { spacing } from '../../themes';

/**
 * The Register (docs.frappe.io/erpnext/point-of-sale): the items the session's POS Profile offers, each a tap
 * away from the cart. Narrow at every width for now — the items here, the cart a page further
 * (./cart.tsx); a tablet's two panes wait for the tablet pass.
 */
export function Register({ merchant }: { merchant: Merchant }) {
  const { query, session, profile } = useRegisterSession(merchant.id);
  if (!session || !profile) return <SessionState title="Register" query={query} />;

  return <Counter merchant={merchant} session={session} profile={profile} />;
}

function Counter({ merchant, session, profile }: { merchant: Merchant; session: PosOpeningEntry; profile: PosProfile }) {
  const { colors } = useAppTheme();
  const sale = useSaleSetup(merchant, profile);
  const bins = useBinsQuery({ merchantId: merchant.id, item: '', warehouse: profile.warehouse }).data;
  const lines = useCart(session.id);
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
  const offered = offeredItems(sale.items, setup, {
    groupIds: profile.pos_profile_item_groups.map((row) => row.item_group_id),
    hideUnavailable: profile.hide_unavailable_items,
    onHand,
    search,
  });
  const inCart = new Map<string, number>();
  for (const line of lines) inCart.set(line.itemId, (inCart.get(line.itemId) ?? 0) + line.qty);
  const total = buildSale(lines, setup, engines).roundedTotal;
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  // What a row says under the name: its code, its price in the unit it sells in, and what is on hand.
  const facts = (item: Item) => {
    const price = listPrice(item, item.sales_uom ?? item.stock_uom, setup, engines);
    return [item.item_code, price ? money(price.rate) : 'No price', item.is_stock_item ? `${onHand.get(item.id) ?? 0} on hand` : null].filter(Boolean).join(' · ');
  };

  return (
    <View style={styles.fill}>
      {header}
      <View style={styles.search}>
        <TextInput
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
      <FormFooter notice={null}>
        <Button
          mode="contained"
          disabled={lines.length === 0}
          onPress={() => router.push({ pathname: '/systems/[id]/sell/cart', params: { id: merchant.id } })}
          contentStyle={styles.leading}
        >
          {lines.length === 0 ? 'Cart is empty' : `Cart · ${count} ${count === 1 ? 'item' : 'items'} · ${money(total)}`}
        </Button>
      </FormFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
  search: { paddingHorizontal: spacing.md, paddingTop: spacing.ms, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.ms, borderBottomWidth: 1 },
  rowText: { flex: 1, gap: spacing.xs },
  // Full-width buttons put their label at the left edge (.claude/instruction_mds/frontend.md §5).
  leading: { justifyContent: 'flex-start' },
});
