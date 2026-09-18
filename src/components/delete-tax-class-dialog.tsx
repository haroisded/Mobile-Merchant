import { StyleSheet } from 'react-native';

import { useDeleteTaxClassMutation } from '../features/tax-classes/queries';
import type { TaxClass } from '../features/tax-classes/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';

type Props = {
  taxClass: TaxClass;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/delete-tax-class.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
};

type Notice = { type: 'error' | 'info'; text: string };

/** Delete a tax class, from the Setup screen. Products using it lose the class (on delete set null). */
export function DeleteTaxClassDialog({ taxClass, inSheet, onDismiss }: Props) {
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
      inSheet={inSheet}
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
  action: { justifyContent: 'flex-start' },
});
