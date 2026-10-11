import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LedgerFilterBar, nameIn, useLedgerNames, useVoucherRoutes } from '../../components/ledger-filters';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { useBinsQuery } from '../../features/bins/queries';
import type { Bin } from '../../features/bins/queries';
import { useMoney } from '../../features/currencies/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useLedgerFilters } from '../../Store/ledger-filters';

/**
 * The Stock Balance (docs.frappe.io/erpnext/stock-level-report): the quantity, valuation rate and value of
 * each item in each warehouse, as the stock ledger left them. A row opens that item's movements in that
 * warehouse, for whoever may read the Stock Ledger.
 */
export function StockBalance({ merchant }: { merchant: Merchant }) {
  const { item, warehouse } = useLedgerFilters(merchant.id, 'stock-balance');
  const bins = useBinsQuery({ merchantId: merchant.id, item, warehouse });
  const names = useLedgerNames(merchant.id);
  const money = useMoney(merchant);
  const routes = useVoucherRoutes(merchant.id);
  const permissions = usePermissions({ merchantId: merchant.id }).data;

  const itemName = (bin: Bin) => nameIn(names.item, bin.item_id);
  const warehouseName = (bin: Bin) => nameIn(names.warehouse, bin.warehouse_id);
  // By item, then warehouse: a bin has no order of its own, and the names are not the database's to sort by.
  const sorted = bins.data && [...bins.data].sort((a, b) => itemName(a).localeCompare(itemName(b)) || warehouseName(a).localeCompare(warehouseName(b)));
  const total = sorted?.reduce((sum, bin) => sum + bin.stock_value, 0);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Stock"
        title="Stock Balance"
        meta={sorted && total !== undefined ? `${sorted.length} ${sorted.length === 1 ? 'balance' : 'balances'} · ${money(total)} in stock` : undefined}
        onBack={() => router.back()}
      />
      <LedgerFilterBar merchantId={merchant.id} report="stock-balance" names={names} />
      <RecordList
        query={{ ...bins, data: sorted }}
        keyOf={(bin) => `${bin.item_id}:${bin.warehouse_id}`}
        columns={[
          { label: 'Item', flex: 3, cell: itemName },
          { label: 'Warehouse', flex: 2, cell: warehouseName },
          { label: 'Qty', flex: 1, cell: (bin) => String(bin.actual_qty) },
          { label: 'Valuation Rate', flex: 2, cell: (bin) => money(bin.valuation_rate) },
          { label: 'Value', flex: 2, cell: (bin) => money(bin.stock_value) },
        ]}
        title={itemName}
        subtitle={warehouseName}
        status={(bin) => <StatusText words={[`Qty ${bin.actual_qty}`, `Valuation ${money(bin.valuation_rate)}`, `Value ${money(bin.stock_value)}`]} />}
        accessibilityLabel={(bin) => `${itemName(bin)} in ${warehouseName(bin)}`}
        onPress={
          can(permissions, 'Stock Ledger Entry', 'read') ? (bin) => routes.openReport('stock-ledger', { item: bin.item_id, warehouse: bin.warehouse_id }) : undefined
        }
        empty={item || warehouse ? 'No balance matches these filters.' : 'No stock yet. Receive some with a Stock Entry, or enter Opening Stock.'}
        offline="You're offline. The Stock Balance will load when you reconnect."
        failure="Couldn't load the Stock Balance. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
