import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { TreeBrowser, useFolder } from '../../components/folder-nav';
import { PageHeader } from '../../components/page-header';
import { costCenterLabel, useCostCentersQuery } from '../../features/cost-centers/queries';
import type { CostCenter } from '../../features/cost-centers/queries';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { spacing } from '../../themes';

const openForm = (params: { merchantId: string; costCenterId?: string; parentId?: string }) => router.push({ pathname: '/forms/cost-center', params });

/**
 * Cost Centers (docs.frappe.io/erpnext/cost-center): the company at the top, Main under it, and whatever
 * branches, counters or shifts the owner wants income and expenses tagged by — browsed a folder at a time.
 */
export function CostCenters({ merchant }: { merchant: Merchant }) {
  const costCenters = useCostCentersQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const { parent, open } = useFolder('/systems/[id]/setup/cost-centers', merchant.id);
  const folder = costCenters.data?.find((costCenter) => costCenter.id === parent);
  const label = (costCenter: CostCenter) => costCenterLabel(costCenter, merchant.abbr);
  const edit = can(permissions, 'Cost Center', 'write')
    ? (costCenter: CostCenter) => openForm({ merchantId: merchant.id, costCenterId: costCenter.id })
    : undefined;

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker={folder ? 'Cost Centers' : 'Setup'}
        title={folder ? label(folder) : 'Cost Centers'}
        meta={folder ? undefined : 'What income and expenses are tagged by'}
        onBack={() => router.back()}
        actions={
          folder ? (
            <View style={styles.actions}>
              {edit ? (
                <Button mode="outlined" icon="edit" onPress={() => edit(folder)}>
                  Edit Group
                </Button>
              ) : null}
              {can(permissions, 'Cost Center', 'create') ? (
                <Button mode="contained" icon="add" onPress={() => openForm({ merchantId: merchant.id, parentId: folder.id })}>
                  New Cost Center
                </Button>
              ) : null}
            </View>
          ) : null
        }
      />
      <TreeBrowser
        query={costCenters}
        parent={parent}
        root="Cost Centers"
        label={label}
        status={() => []}
        noun={['cost center', 'cost centers']}
        open={open}
        onEdit={edit}
        offline="You're offline. Cost Centers will load when you reconnect."
        failure="Couldn't load Cost Centers. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
