import { StyleSheet } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { NoteCallout } from './form/fields';
import { isUsedInBundle, useDeleteProductsMutation, useSetProductStatusMutation } from './queries';

type Props = {
  /** One product from its row or detail header, or the bulk selection. */
  products: { id: string; name: string }[];
  onDismiss: () => void;
  /** After either action lands — the detail screen leaves, the list clears its selection. */
  onDone: (outcome: 'archived' | 'deleted') => void;
};

/**
 * Archive or delete. Archive is the default, contained action: it hides the product from the list and
 * the register and keeps the row. Delete is permanent.
 *
 * The mockup blocks "Delete permanently" once a product has order or recipe history. Orders do not exist
 * yet, and a product used as a bundle component is refused by the database (23503), so today Delete is
 * enabled and that refusal is the one block — reported below rather than pre-checked.
 */
export function ArchiveProductDialog({ products, onDismiss, onDone }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const archive = useSetProductStatusMutation();
  const remove = useDeleteProductsMutation();

  const ids = products.map((product) => product.id);
  const pending = archive.isPending || remove.isPending;
  const paused = archive.isPaused || remove.isPaused;
  const inFlight = pending && !paused;
  const single = products.length === 1 ? products[0] : undefined;

  const notice = paused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : remove.isError
      ? {
          type: 'error' as const,
          text: isUsedInBundle(remove.error)
            ? `${single ? 'This product is' : 'One of these products is'} a component of a bundle. Remove it from the bundle first, or archive it instead.`
            : failureMessage("Couldn't delete. Try again."),
        }
      : archive.isError
        ? { type: 'error' as const, text: failureMessage("Couldn't archive. Try again.") }
        : null;

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Delete product"
      kickerTone="error"
      title={single ? `Archive ${single.name}?` : `Archive ${products.length} products?`}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="text"
            textColor={colors.error}
            onPress={() => remove.mutate(ids, { onSuccess: () => onDone('deleted') })}
            loading={remove.isPending}
            disabled={pending}
            contentStyle={styles.action}
          >
            Delete permanently
          </Button>
          <Button
            mode="contained"
            onPress={() => archive.mutate({ ids, status: 'archived' }, { onSuccess: () => onDone('archived') })}
            loading={archive.isPending}
            disabled={pending}
            contentStyle={styles.action}
          >
            Archive
          </Button>
        </>
      }
    >
      <Text variant="bodyMedium">
        Archiving hides {single ? 'it' : 'them'} from this list and from the register, and keeps every
        detail. You can bring an archived product back from the Archived filter.
      </Text>
      <NoteCallout tone="error">Delete permanently removes {single ? 'this product' : 'these products'}, with variants, rates and components. It can&apos;t be undone.</NoteCallout>
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
