import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Text } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { taxClassLabel, useDeleteTaxClassMutation, useTaxClassesQuery } from './queries';
import type { TaxClass } from './queries';

type Notice = { type: 'error' | 'info'; text: string };

/**
 * The Tax classes section of the Products Setup screen. Tax classes are created from a product's Tax
 * class field; this is where one is removed.
 */
export function TaxClassesSection({ merchantId }: { merchantId: string }) {
  const { colors } = useAppTheme();
  const taxClasses = useTaxClassesQuery({ merchantId });
  const [deleting, setDeleting] = useState<TaxClass | null>(null);
  const rows = taxClasses.data ?? [];

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
                icon="trash-2"
                size={18}
                iconColor={colors.error}
                onPress={() => setDeleting(taxClass)}
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

function DeleteTaxClassDialog({ taxClass, onDismiss }: { taxClass: TaxClass; onDismiss: () => void }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const remove = useDeleteTaxClassMutation();
  const inFlight = remove.isPending && !remove.isPaused;

  const notice: Notice | null = remove.isPaused
    ? { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : remove.isError
      ? { type: 'error', text: failureMessage("Couldn't delete this tax class. Try again.") }
      : null;

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Delete tax class"
      kickerTone="error"
      title={`Delete ${taxClass.name}?`}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={() => remove.mutate(taxClass.id, { onSuccess: onDismiss })}
            loading={remove.isPending}
            disabled={remove.isPending}
            contentStyle={styles.action}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">Products using it keep everything else and lose their tax class.</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 4, minHeight: 48 },
  divided: { borderTopWidth: 1 },
  action: { justifyContent: 'flex-start' },
});
