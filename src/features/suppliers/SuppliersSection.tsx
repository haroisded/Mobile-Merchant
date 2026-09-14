import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Text } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { useDeleteSupplierMutation, useSuppliersQuery } from './queries';
import type { Supplier } from './queries';

type Notice = { type: 'error' | 'info'; text: string };

/**
 * The Suppliers section of the Products Setup screen. Suppliers are created from a product's Supplier
 * field; this is where one is removed.
 */
export function SuppliersSection({ merchantId }: { merchantId: string }) {
  const { colors } = useAppTheme();
  const suppliers = useSuppliersQuery({ merchantId });
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const rows = suppliers.data ?? [];

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
                icon="trash-2"
                size={18}
                iconColor={colors.error}
                onPress={() => setDeleting(supplier)}
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

function DeleteSupplierDialog({ supplier, onDismiss }: { supplier: Supplier; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const remove = useDeleteSupplierMutation();
  const inFlight = remove.isPending && !remove.isPaused;

  const notice: Notice | null = remove.isPaused
    ? { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : remove.isError
      ? { type: 'error', text: failureMessage("Couldn't delete this supplier. Try again.") }
      : null;

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Delete supplier"
      kickerTone="error"
      title={`Delete ${supplier.name}?`}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={() => remove.mutate(supplier.id, { onSuccess: onDismiss })}
            loading={remove.isPending}
            disabled={remove.isPending}
            contentStyle={styles.action}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">Products using it keep everything else and lose their supplier.</Text>
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: 10 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  start: { alignSelf: 'flex-start' },
  state: { gap: 12, alignItems: 'flex-start' },
  group: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 4, minHeight: 56 },
  divided: { borderTopWidth: 1 },
  action: { justifyContent: 'flex-start' },
});
