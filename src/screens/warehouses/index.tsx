import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { TreeBrowser, useFolder } from '../../components/folder-nav';
import { PageHeader } from '../../components/page-header';
import { accountLabel, useAccountsQuery } from '../../features/accounts/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { inventoryAccount, useWarehousesQuery, warehouseLabel } from '../../features/warehouses/queries';
import type { Warehouse } from '../../features/warehouses/queries';
import { spacing } from '../../themes';

const openForm = (params: { merchantId: string; warehouseId?: string; parentId?: string }) => router.push({ pathname: '/forms/warehouse', params });

/**
 * Warehouses (docs.frappe.io/erpnext/warehouse): where stock is kept — All Warehouses at the top, Stores under
 * it, and any shop, room or shelf the owner adds — browsed a folder at a time. Each row says which Stock
 * ledger its stock value posts to, and where that comes from.
 */
export function Warehouses({ merchant }: { merchant: Merchant }) {
  const warehouses = useWarehousesQuery({ merchantId: merchant.id });
  // Account names for the inventory line. Every member may select accounts (All's Select on Account).
  const accounts = useAccountsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const { parent, open } = useFolder('/systems/[id]/setup/warehouses', merchant.id);
  const folder = warehouses.data?.find((warehouse) => warehouse.id === parent);
  const label = (warehouse: Warehouse) => warehouseLabel(warehouse);
  const edit = can(permissions, 'Warehouse', 'write')
    ? (warehouse: Warehouse) => openForm({ merchantId: merchant.id, warehouseId: warehouse.id })
    : undefined;

  // "Stock In Hand - CC (company default)", "… (from Kiosk - CC)", or nothing to post to.
  const inventory = (warehouse: Warehouse) => {
    const resolved = inventoryAccount(warehouses.data ?? [], warehouse.id, merchant.default_inventory_account);
    if (!resolved) return 'No inventory account';
    const found = accounts?.find((account) => account.id === resolved.account);
    const name = found ? accountLabel(found) : '…';
    if (!resolved.from) return `${name} (store default)`;
    return resolved.from.id === warehouse.id ? name : `${name} (from ${label(resolved.from)})`;
  };

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={folder ? 'Warehouses' : 'Setup'}
        title={folder ? label(folder) : 'Warehouses'}
        meta={folder ? inventory(folder) : 'Where stock is kept, and the account its value posts to'}
        onBack={() => router.back()}
        actions={
          folder ? (
            <View style={styles.actions}>
              {edit ? (
                <Button mode="outlined" icon="edit" onPress={() => edit(folder)}>
                  Edit Group
                </Button>
              ) : null}
              {can(permissions, 'Warehouse', 'create') ? (
                <Button mode="contained" icon="add" onPress={() => openForm({ merchantId: merchant.id, parentId: folder.id })}>
                  New Warehouse
                </Button>
              ) : null}
            </View>
          ) : null
        }
      />
      <TreeBrowser
        query={warehouses}
        parent={parent}
        root="Warehouses"
        label={label}
        status={(warehouse) => (warehouse.is_group ? [] : [inventory(warehouse)])}
        noun={['warehouse', 'warehouses']}
        open={open}
        onEdit={edit}
        offline="You're offline. Warehouses will load when you reconnect."
        failure="Couldn't load Warehouses. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
