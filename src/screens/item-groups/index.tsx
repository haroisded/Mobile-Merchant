import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { TreeBrowser, useFolder } from '../../components/folder-nav';
import { PageHeader } from '../../components/page-header';
import { useItemGroupsQuery } from '../../features/item-groups/queries';
import type { ItemGroup } from '../../features/item-groups/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { spacing } from '../../themes';

// A long form with its Item Tax rows: a page of the Setup stack at every width, not a forms/ Dialog
// (.claude/instruction_mds/frontend.md §4.4).
const openGroup = (params: { id: string; groupId?: string; parentId?: string }) => router.push({ pathname: '/systems/[id]/setup/item-group', params });

const label = (group: ItemGroup) => group.item_group_name;

// "2 defaults · 1 item tax": what the group hands its items, at a glance.
const status = (group: ItemGroup) => {
  const defaults = [group.default_price_list, group.default_warehouse, group.income_account, group.expense_account].filter(Boolean).length;
  const taxes = group.item_group_taxes.length;
  return [defaults ? `${defaults} ${defaults === 1 ? 'default' : 'defaults'}` : null, taxes ? `${taxes} item ${taxes === 1 ? 'tax' : 'taxes'}` : null];
};

/**
 * Item Groups (docs.frappe.io/erpnext/item-group): how items are classified — All Item Groups at the top,
 * Products and Services under it, and any group the owner adds — browsed a folder at a time. A group hands its
 * items its defaults and Item Tax rows.
 */
export function ItemGroups({ merchant }: { merchant: Merchant }) {
  const groups = useItemGroupsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const { parent, open } = useFolder('/systems/[id]/setup/item-groups', merchant.id);
  const folder = groups.data?.find((group) => group.id === parent);
  // The page is read-only without write, so whoever may read a group may open it.
  const view = can(permissions, 'Item Group', 'read') ? (group: ItemGroup) => openGroup({ id: merchant.id, groupId: group.id }) : undefined;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={folder ? 'Item Groups' : 'Setup'}
        title={folder ? label(folder) : 'Item Groups'}
        meta={folder ? undefined : 'How items are classified, and the defaults they take'}
        onBack={() => router.back()}
        actions={
          folder ? (
            <View style={styles.actions}>
              {view ? (
                <Button mode="outlined" icon="edit" onPress={() => view(folder)}>
                  {can(permissions, 'Item Group', 'write') ? 'Edit Group' : 'View Group'}
                </Button>
              ) : null}
              {can(permissions, 'Item Group', 'create') ? (
                <Button mode="contained" icon="add" onPress={() => openGroup({ id: merchant.id, parentId: folder.id })}>
                  New Item Group
                </Button>
              ) : null}
            </View>
          ) : null
        }
      />
      <TreeBrowser
        query={groups}
        parent={parent}
        root="Item Groups"
        label={label}
        status={status}
        noun={['item group', 'item groups']}
        open={open}
        onEdit={view}
        offline="You're offline. Item groups will load when you reconnect."
        failure="Couldn't load Item Groups. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
