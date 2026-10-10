import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/button';
import { PageHeader } from '../../components/page-header';
import { RecordList } from '../../components/record-list';
import type { Merchant } from '../../features/merchants/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { factorLabel, useUomConversionFactorsQuery } from '../../features/uom-conversion-factors/queries';
import type { UomConversionFactor } from '../../features/uom-conversion-factors/queries';
import { useUomsQuery } from '../../features/uoms/queries';

const openForm = (merchantId: string, factorId?: string) =>
  router.push({ pathname: '/forms/uom-conversion-factor', params: factorId ? { merchantId, factorId } : { merchantId } });

/**
 * UOM Conversion Factors (docs.frappe.io/erpnext/uom): how many of one unit make another — 1 Kg = 1000 Gram —
 * for the items that are bought or sold in more than one unit.
 */
export function UomConversionFactors({ merchant }: { merchant: Merchant }) {
  const factors = useUomConversionFactorsQuery({ merchantId: merchant.id });
  const uoms = useUomsQuery({ merchantId: merchant.id }).data;
  const permissions = usePermissions({ merchantId: merchant.id }).data;
  const editable = can(permissions, 'UOM Conversion Factor', 'write');

  const unit = (id: string) => uoms?.find((uom) => uom.id === id)?.uom_name ?? '…';
  const reads = (factor: UomConversionFactor) => factorLabel(factor, uoms);

  return (
    <View style={styles.fill}>
      <PageHeader
        kicker="Setup"
        title="UOM Conversion Factors"
        meta={factors.data ? `${factors.data.length} ${factors.data.length === 1 ? 'conversion' : 'conversions'}` : undefined}
        onBack={() => router.back()}
        actions={
          can(permissions, 'UOM Conversion Factor', 'create') ? (
            <Button mode="contained" icon="add" onPress={() => openForm(merchant.id)} contentStyle={styles.leading}>
              New Conversion
            </Button>
          ) : null
        }
      />
      <RecordList
        query={factors}
        keyOf={(factor) => factor.id}
        columns={[
          { label: 'From UOM', flex: 1, cell: (factor) => unit(factor.from_uom) },
          { label: 'To UOM', flex: 1, cell: (factor) => unit(factor.to_uom) },
          { label: 'Value', flex: 1, cell: (factor) => String(factor.value) },
        ]}
        title={reads}
        accessibilityLabel={reads}
        onPress={editable ? (factor) => openForm(merchant.id, factor.id) : undefined}
        empty="No conversions yet."
        offline="You're offline. Conversions will load when you reconnect."
        failure="Couldn't load conversions. Try again."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  leading: { justifyContent: 'flex-start' },
});
