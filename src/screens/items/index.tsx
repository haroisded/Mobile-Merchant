import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import { TextInput } from '../../components/text-input';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import { useItemsQuery } from '../../features/items/queries';
import type { Item } from '../../features/items/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import { spacing } from '../../themes';

// A long form with its UOMs and Item Tax rows: a page of the Stock stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openItem = (merchantId: string, itemId?: string) =>
  router.push({ pathname: '/systems/[id]/stock/item', params: itemId ? { id: merchantId, itemId } : { id: merchantId } });

const status = (item: Item) => [item.is_stock_item ? null : 'Service', item.disabled ? 'Disabled' : null].filter((word) => word !== null);

/**
 * Items (docs.frappe.io/erpnext/item): the products and services a system sells, found by code or name.
 */
export function Items({ merchant }: { merchant: Merchant }) {
  const items = useItemsQuery({ merchantId: merchant.id });
  const groups = useItemGroupsQuery({ merchantId: merchant.id }).data;
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const [search, setSearch] = useState('');

  const group = (item: Item) => groups?.find((candidate) => candidate.id === item.item_group_id)?.item_group_name ?? '';
  const uom = (item: Item) => uoms?.find((candidate) => candidate.id === item.stock_uom)?.uom_name ?? '';
  const needle = search.trim().toLowerCase();
  const found = items.data?.filter((item) => [item.item_code, item.item_name].some((text) => text.toLowerCase().includes(needle)));

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Stock"
        title="Items"
        meta={items.data ? `${items.data.length} ${items.data.length === 1 ? 'item' : 'items'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'Item', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openItem(merchant.id)} contentStyle={styles.leading}>
              New Item
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
          placeholder="Search by code or name"
          accessibilityLabel="Search items"
          left={<TextInput.Icon icon="search" />}
        />
      </View>
      <RecordList
        query={{ ...items, data: found }}
        keyOf={(item) => item.id}
        columns={[
          { label: 'Item Code', flex: 2, cell: (item) => item.item_code },
          { label: 'Item Name', flex: 3, cell: (item) => item.item_name },
          { label: 'Item Group', flex: 2, cell: group },
          { label: 'UOM', flex: 1, cell: uom },
          { label: 'Status', flex: 1, cell: () => '', node: (item) => <StatusText words={status(item)} faint={item.disabled} /> },
        ]}
        title={(item) => item.item_name}
        subtitle={(item) => [item.item_code, group(item), uom(item)].filter(Boolean).join(' · ')}
        status={(item) => (status(item).length > 0 ? <StatusText words={status(item)} faint={item.disabled} /> : null)}
        accessibilityLabel={(item) => `Item ${item.item_code}`}
        onPress={can(permissions, 'Item', 'read') ? (item) => openItem(merchant.id, item.id) : undefined}
        empty={needle ? 'No item matches that search.' : 'No items yet.'}
        offline="You're offline. Items will load when you reconnect."
        failure="Couldn't load items. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
  search: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
});
