import { StyleSheet } from 'react-native';

import { useDeleteSupplierMutation } from '../features/suppliers/queries';
import type { Supplier } from '../features/suppliers/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';

type Props = {
  supplier: Supplier;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/delete-supplier.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
};

type Notice = { type: 'error' | 'info'; text: string };

/** Delete a supplier. Products using it lose the supplier (on delete set null). */
export function DeleteSupplierDialog({ supplier, inSheet, onDismiss }: Props) {
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
      inSheet={inSheet}
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
  action: { justifyContent: 'flex-start' },
});
