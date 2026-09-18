import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { DeleteSupplierDialog } from '../../components/delete-supplier-dialog';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { useSuppliersQuery } from '../../features/suppliers/queries';
import type { Supplier } from '../../features/suppliers/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/**
 * The Suppliers section of the Products Setup screen. Suppliers are created from a product's Supplier
 * field; this is where one is removed.
 */
export function SuppliersSection({ merchantId }: { merchantId: string }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const suppliers = useSuppliersQuery({ merchantId });
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const rows = suppliers.data ?? [];

  const remove = (supplier: Supplier) => {
    if (wide) {
      setDeleting(supplier);
      return;
    }
    router.push({ pathname: '/sheets/delete-supplier', params: { merchantId, supplierId: supplier.id } });
  };

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text variant="headlineSmall">Suppliers</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          Created from a product&apos;s Supplier field
        </Text>
      </View>

      {suppliers.isPaused && !suppliers.data ? (
        <Text variant="bodyMedium">You&apos;re offline. Suppliers will load when you reconnect.</Text>
      ) : suppliers.isPending ? (
        <ActivityIndicator style={styles.start} />
      ) : suppliers.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">{failureMessage("Couldn't load suppliers. Try again.")}</Text>
          <Button onPress={() => suppliers.refetch()}>Try again</Button>
        </View>
      ) : rows.length === 0 ? (
        <Text variant="bodyMedium">No suppliers yet — create one from a product&apos;s Supplier field.</Text>
      ) : (
        <View style={[styles.group, { borderColor: colors.outlineVariant }]}>
          {rows.map((supplier, index) => (
            <View
              key={supplier.id}
              style={[styles.row, index > 0 && [styles.divided, { borderTopColor: colors.surfaceVariant }]]}
            >
              <View style={styles.fill}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {supplier.name}
                </Text>
                {supplier.contact ? (
                  <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.onSurfaceMuted }}>
                    {supplier.contact}
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="delete"
                size={18}
                iconColor={colors.error}
                onPress={() => remove(supplier)}
                accessibilityLabel={`Delete ${supplier.name}`}
              />
            </View>
          ))}
        </View>
      )}

      {deleting ? <DeleteSupplierDialog supplier={deleting} onDismiss={() => setDeleting(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: spacing.ms },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.ms, rowGap: spacing.xs },
  start: { alignSelf: 'flex-start' },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  group: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.ms, paddingRight: spacing.xs, minHeight: 56 },
  divided: { borderTopWidth: 1 },
});
