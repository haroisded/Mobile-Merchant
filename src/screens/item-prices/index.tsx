import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import { TextInput } from '../../components/text-input';
import { useCurrencyQuery } from '../../features/currencies/queries';
import { useItemPricesQuery } from '../../features/item-prices/queries';
import type { ItemPrice } from '../../features/item-prices/queries';
import { itemLabel, useItemsQuery } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { usePriceListsQuery } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSystemSettingsQuery } from '../../features/system-settings/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { displayDate } from '../../lib/dates';
import { asRoundingMethod, formatMoney } from '../../lib/money';
import { spacing } from '../../themes';

const openForm = (merchantId: string, priceId?: string) =>
  router.push({ pathname: '/forms/item-price', params: priceId ? { merchantId, priceId } : { merchantId } });

// "From Dec 1, 2026 to Dec 31, 2026", "From Dec 1, 2026", "Until Dec 31, 2026", or "Always".
const validity = (price: ItemPrice) =>
  [price.valid_from ? `From ${displayDate(price.valid_from)}` : null, price.valid_upto ? `${price.valid_from ? 'to' : 'Until'} ${displayDate(price.valid_upto)}` : null]
    .filter(Boolean)
    .join(' ') || 'Always';

/**
 * Item Prices (docs.frappe.io/erpnext/item-price): the rate of one item in one price list for one unit,
 * found by the item's code or name.
 */
export function ItemPrices({ merchant }: { merchant: Merchant }) {
  const prices = useItemPricesQuery({ merchantId: merchant.id });
  const items = useItemsQuery({ merchantId: merchant.id }).data;
  const priceLists = usePriceListsQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const currency = useCurrencyQuery({ merchantId: merchant.id, code: merchant.default_currency }).data;
  const settings = useSystemSettingsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const [search, setSearch] = useState('');

  const item = (price: ItemPrice) => {
    const found = items?.find((candidate) => candidate.id === price.item_id);
    return found ? itemLabel(found) : '';
  };
  const priceList = (price: ItemPrice) => priceLists?.find((candidate) => candidate.id === price.price_list_id)?.price_list_name ?? '';
  const uom = (price: ItemPrice) => uoms?.find((candidate) => candidate.id === price.uom_id)?.uom_name ?? '';
  // The amount as the Currency page writes it; the bare number until the currency and precision have loaded.
  const rate = (price: ItemPrice) =>
    currency && settings
      ? formatMoney(price.price_list_rate, currency, settings.currency_precision, asRoundingMethod(settings.rounding_method))
      : String(price.price_list_rate);
  const needle = search.trim().toLowerCase();
  const found = prices.data?.filter((price) => item(price).toLowerCase().includes(needle));

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Stock"
        title="Item Prices"
        meta={prices.data ? `${prices.data.length} ${prices.data.length === 1 ? 'price' : 'prices'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Item Price', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Item Price
            </Button>
          ) : null
        }
      />
      <View style={styles.search}>
        <TextInput
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          placeholder="Search by item code or name"
          accessibilityLabel="Search item prices"
          left={<TextInput.Icon icon="search" />}
        />
      </View>
      <RecordList
        query={{ ...prices, data: found }}
        keyOf={(price) => price.id}
        columns={[
          { label: 'Item', flex: 3, cell: item },
          { label: 'Price List', flex: 2, cell: priceList },
          { label: 'UOM', flex: 1, cell: uom },
          { label: 'Rate', flex: 2, cell: rate },
          { label: 'Valid', flex: 3, cell: validity },
        ]}
        title={item}
        subtitle={(price) => `${rate(price)} per ${uom(price)} · ${priceList(price)} · ${validity(price)}`}
        accessibilityLabel={(price) => `Price of ${item(price)} in ${priceList(price)} per ${uom(price)}`}
        onPress={can(permissions, 'Item Price', 'write') ? (price) => openForm(merchant.id, price.id) : undefined}
        empty={needle ? 'No price matches that search.' : 'No item prices yet.'}
        offline="You're offline. Item prices will load when you reconnect."
        failure="Couldn't load item prices. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  search: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
});
