import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList, StatusText } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useUomsQuery } from '../../features/uoms/queries';
import type { Uom } from '../../features/uoms/queries';

const openForm = (merchantId: string, uomId?: string) => router.push({ pathname: '/forms/uom', params: uomId ? { merchantId, uomId } : { merchantId } });

const quantity = (uom: Uom) => (uom.must_be_whole_number ? 'Whole numbers only' : 'Fractions allowed');

const status = (uom: Uom) => <StatusText words={[uom.enabled ? 'Enabled' : 'Disabled']} faint={!uom.enabled} />;

/**
 * UOMs (docs.frappe.io/erpnext/uom): the units items are counted and sold in, and whether a quantity in one
 * may be a fraction (docs "Managing Fractions in UOM").
 */
export function Uoms({ merchant }: { merchant: Merchant }) {
  const uoms = useUomsQuery({ merchantId: merchant.id });
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'UOM', 'write');

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="UOMs"
        meta={uoms.data ? `${uoms.data.length} ${uoms.data.length === 1 ? 'unit' : 'units'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'UOM', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New UOM
            </Button>
          ) : null
        }
      />
      <RecordList
        query={uoms}
        keyOf={(uom) => uom.id}
        columns={[
          { label: 'UOM', flex: 2, cell: (uom) => uom.uom_name },
          { label: 'Quantity', flex: 2, cell: quantity },
          { label: 'Status', flex: 1, cell: () => '', node: status },
        ]}
        title={(uom) => uom.uom_name}
        subtitle={quantity}
        status={status}
        accessibilityLabel={(uom) => `Unit ${uom.uom_name}`}
        onPress={editable ? (uom) => openForm(merchant.id, uom.id) : undefined}
        empty="No units yet."
        offline="You're offline. Units will load when you reconnect."
        failure="Couldn't load units. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
