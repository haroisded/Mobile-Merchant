import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { DeleteTaxClassDialog } from '../../components/delete-tax-class-dialog';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { taxClassLabel, useTaxClassesQuery } from '../../features/tax-classes/queries';
import type { TaxClass } from '../../features/tax-classes/queries';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/**
 * The Tax classes section of the Products Setup screen. Tax classes are created from a product's Tax
 * class field; this is where one is removed.
 */
export function TaxClassesSection({ merchantId }: { merchantId: string }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const taxClasses = useTaxClassesQuery({ merchantId });
  const [deleting, setDeleting] = useState<TaxClass | null>(null);
  const rows = taxClasses.data ?? [];

  const remove = (taxClass: TaxClass) => {
    if (wide) {
      setDeleting(taxClass);
      return;
    }
    router.push({ pathname: '/sheets/delete-tax-class', params: { merchantId, taxClassId: taxClass.id } });
  };

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text variant="headlineSmall">Tax classes</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceMuted }}>
          Created from a product&apos;s Tax class field
        </Text>
      </View>

      {taxClasses.isPaused && !taxClasses.data ? (
        <Text variant="bodyMedium">You&apos;re offline. Tax classes will load when you reconnect.</Text>
      ) : taxClasses.isPending ? (
        <ActivityIndicator style={styles.start} />
      ) : taxClasses.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">{failureMessage("Couldn't load tax classes. Try again.")}</Text>
          <Button onPress={() => taxClasses.refetch()}>Try again</Button>
        </View>
      ) : rows.length === 0 ? (
        <Text variant="bodyMedium">No tax classes yet — create one from a product&apos;s Tax class field.</Text>
      ) : (
        <View style={[styles.group, { borderColor: colors.outlineVariant }]}>
          {rows.map((taxClass, index) => (
            <View
              key={taxClass.id}
              style={[styles.row, index > 0 && [styles.divided, { borderTopColor: colors.surfaceVariant }]]}
            >
              <Text variant="bodyMedium" style={styles.fill} numberOfLines={1}>
                {taxClassLabel(taxClass)}
              </Text>
              <IconButton
                icon="delete"
                size={18}
                iconColor={colors.error}
                onPress={() => remove(taxClass)}
                accessibilityLabel={`Delete ${taxClass.name}`}
              />
            </View>
          ))}
        </View>
      )}

      {deleting ? <DeleteTaxClassDialog taxClass={deleting} onDismiss={() => setDeleting(null)} /> : null}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.ms, paddingRight: spacing.xs, minHeight: 48 },
  divided: { borderTopWidth: 1 },
});
