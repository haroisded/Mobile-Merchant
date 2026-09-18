import { StyleSheet } from 'react-native';

import { useDeleteCategoryMutation } from '../features/categories/queries';
import type { Category } from '../features/categories/queries';
import { useShellWide } from '../lib/columns';
import { failureMessage, postgrestError } from '../lib/errors';
import { useAppTheme } from '../lib/theme';
import { AdaptiveDialog } from './adaptive-dialog';
import { Button } from './button';
import { HelperText } from './helper-text';
import { Text } from './text';

type Props = {
  category: Category;
  subcategories: number;
  /** Rendered as the body of the narrow formSheet route (src/app/(app)/sheets/delete-category.tsx). */
  inSheet?: boolean;
  onDismiss: () => void;
};

type Notice = { type: 'error' | 'info'; text: string };

/** Delete a category and its subcategories, from the Setup screen. */
export function DeleteCategoryDialog({ category, subcategories, inSheet, onDismiss }: Props) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const remove = useDeleteCategoryMutation();
  const inFlight = remove.isPending && !remove.isPaused;

  const notice: Notice | null = remove.isPaused
    ? { type: 'info', text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : remove.isError
      ? {
          type: 'error',
          // products_category_fk and products_subcategory_fk have no cascade: a category in use stays.
          text:
            postgrestError(remove.error)?.code === '23503'
              ? `Products still use ${subcategories > 0 ? 'this category or one of its subcategories' : 'this category'}. Move them to another category first.`
              : failureMessage("Couldn't delete this category. Try again."),
        }
      : null;

  return (
    <AdaptiveDialog
      wide={wide}
      inSheet={inSheet}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker="Delete category"
      kickerTone="error"
      title={`Delete ${category.name}?`}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.error}
            textColor={colors.onError}
            onPress={() => remove.mutate(category.id, { onSuccess: onDismiss })}
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
        {subcategories > 0
          ? `Its ${subcategories} ${subcategories === 1 ? 'subcategory is' : 'subcategories are'} deleted with it. A category products still use can't be deleted.`
          : "A category products still use can't be deleted."}
      </Text>
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'flex-start' },
});
