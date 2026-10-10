import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';

const openForm = (merchantId: string, priceListId?: string) =>
  router.push({ pathname: '/forms/price-list', params: priceListId ? { merchantId, priceListId } : { merchantId } });

const priceListStatus = (priceList: PriceList) =>
  [priceList.enabled ? 'Enabled' : 'Disabled', priceList.price_not_uom_dependent ? 'Price not UOM dependent' : null].filter((word) => word !== null);

/**
 * Price Lists (docs.frappe.io/erpnext/price-lists): the books selling prices will be kept in — Standard
 * Selling, and any other the shop sells at (wholesale, happy hour). Selling only: buying needs a Supplier.
 */
export function PriceLists({ merchant }: { merchant: Merchant }) {
  const priceLists = usePriceListsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'Price List', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="Price Lists"
        meta={priceLists.data ? `${priceLists.data.length} ${priceLists.data.length === 1 ? 'price list' : 'price lists'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Price List', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Price List
            </Button>
          ) : null
        }
      />
      <RecordList
        query={priceLists}
        keyOf={(priceList) => priceList.id}
        columns={[
          { label: 'Price List', flex: 2, cell: (priceList) => priceList.price_list_name },
          { label: 'Currency', flex: 1, cell: (priceList) => priceList.currency },
          {
            label: 'Status',
            flex: 2,
            cell: () => '',
            node: (priceList) => <StatusText words={priceListStatus(priceList)} faint={!priceList.enabled} />,
          },
        ]}
        title={(priceList) => priceList.price_list_name}
        subtitle={(priceList) => `Selling · ${priceList.currency}`}
        status={(priceList) => <StatusText words={priceListStatus(priceList)} faint={!priceList.enabled} />}
        accessibilityLabel={(priceList) => `Price list ${priceList.price_list_name}`}
        onPress={editable ? (priceList) => openForm(merchant.id, priceList.id) : undefined}
        empty="No price lists yet."
        offline="You're offline. Price lists will load when you reconnect."
        failure="Couldn't load price lists. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
