import { StyleSheet } from 'react-native';

import { isUsedInBundle, useDeleteProductsMutation } from '../features/products/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { NoteCallout } from './note-callout';
import { Text } from './text';

type Props = {
  /** One product from its row or detail header, or the bulk selection. */
  products: { id: string; name: string }[];
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/delete-product.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
  /** After the delete lands — the detail screen leaves, the list clears its selection. */
  onDone: () => void;
};

/**
 * Delete permanently. Archive is not offered here: it is its own button now, it writes immediately and
 * the snackbar carries the Undo (src/components/archive-undo.tsx). One dialog, one irreversible action.
 *
 * The mockup blocks Delete once a product has order or recipe history. Orders do not exist yet, and a
 * product used as a bundle component is refused by the database (23503), so Delete is enabled and that
 * refusal is reported below rather than pre-checked.
 */
export function DeleteProductDialog({ products, inSheet, onDismiss, onDone }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const remove = useDeleteProductsMutation();

  const inFlight = remove.isPending && !remove.isPaused;
  const single = products.length === 1 ? products[0] : undefined;

  const notice = remove.isPaused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : remove.isError
      ? {
          type: 'error' as const,
          text: isUsedInBundle(remove.error)
            ? `${single ? 'This product is' : 'One of these products is'} a component of a bundle. Remove it from the bundle first, or archive it instead.`
            : failureMessage("Couldn't delete. Try again."),
        }
      : null;

  return (
    <AdaptiveDialog
      wide={wide}
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Delete permanently"
      kickerTone="error"
      title={single ? `Delete ${single.name}?` : `Delete ${products.length} products?`}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={() => remove.mutate(products.map((product) => product.id), { onSuccess: onDone })}
            loading={remove.isPending}
            disabled={remove.isPending}
            contentStyle={styles.action}
          >
            Delete
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">
        {single ? 'This removes it' : 'This removes them'} with every variant, rate and component.
        Archive instead to keep the details and hide {single ? 'it' : 'them'} from the register.
      </Text>
      <NoteCallout tone="error">This can&apos;t be undone.</NoteCallout>
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
