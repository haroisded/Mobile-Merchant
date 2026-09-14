import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { useShellWide } from '../../lib/columns';
import { failureMessage, postgrestError } from '../../lib/errors';
import { useCreateCategoryMutation, useRenameCategoryMutation } from './queries';
import type { Category } from './queries';

type Props = {
  merchantId: string;
  /** Create under this category — a subcategory. Null creates a top-level category. */
  parent: Category | null;
  /** Rename this one instead of creating. */
  category?: Category;
  onDismiss: () => void;
  /** The created row, so an inline picker can select what was just made. */
  onCreated?: (category: Category) => void;
};

const NAME_MAX = 60;

/**
 * Create or rename a category. One field and one rule, so plain state rather than react-hook-form
 * (the same call RemoveSystemDialog makes). Mounted only while open, so the field starts fresh.
 */
export function CategoryDialog({ merchantId, parent, category, onDismiss, onCreated }: Props) {
  const wide = useShellWide();
  const create = useCreateCategoryMutation({ merchantId });
  const rename = useRenameCategoryMutation();
  const [name, setName] = useState(category?.name ?? '');
  const [submitted, setSubmitted] = useState(false);

  const trimmed = name.trim();
  const invalid = trimmed.length === 0 || trimmed.length > NAME_MAX;
  const pending = create.isPending || rename.isPending;
  const paused = create.isPaused || rename.isPaused;
  const inFlight = pending && !paused;
  const failure = create.error ?? rename.error;

  const notice = paused
    ? { type: 'info' as const, text: 'Waiting for a connection. This finishes on its own when you reconnect.' }
    : failure
      ? {
          type: 'error' as const,
          // product_categories_name_unique: names are unique among siblings, not across the tree.
          text:
            postgrestError(failure)?.code === '23505'
              ? `There is already a ${parent ? 'subcategory' : 'category'} with this name here.`
              : failureMessage("Couldn't save this category. Try again."),
        }
      : submitted && invalid
        ? { type: 'error' as const, text: `Enter a name of up to ${NAME_MAX} characters.` }
        : null;

  const save = () => {
    setSubmitted(true);
    if (invalid) return;
    if (category) {
      rename.mutate({ id: category.id, name: trimmed }, { onSuccess: onDismiss });
    } else {
      create.mutate(
        { name: trimmed, parentId: parent?.id ?? null },
        {
          onSuccess: (row) => {
            onCreated?.(row);
            onDismiss();
          },
        }
      );
    }
  };

  return (
    <AdaptiveDialog
      wide={wide}
      onDismiss={onDismiss}
      dismissable={!inFlight}
      kicker={parent ? `In ${parent.name}` : 'Categories'}
      title={category ? 'Rename category' : parent ? 'New subcategory' : 'New category'}
      actions={
        <>
          <Button mode="outlined" onPress={onDismiss} disabled={inFlight} contentStyle={styles.action}>
            Cancel
          </Button>
          <Button mode="contained" onPress={save} loading={pending} disabled={pending} contentStyle={styles.action}>
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <TextInput
        mode="outlined"
        dense
        autoFocus
        value={name}
        onChangeText={setName}
        onSubmitEditing={save}
        placeholder={parent ? 'e.g. Hot drinks' : 'e.g. Beverages'}
        accessibilityLabel="Name"
        error={notice?.type === 'error'}
        disabled={pending}
      />
      <HelperText type={notice?.type ?? 'error'} visible={notice !== null} padding="none">
        {notice?.text}
      </HelperText>
    </AdaptiveDialog>
  );
}

const styles = StyleSheet.create({
  // Full width in the narrow sheet, so the label sits at the left edge (docs/visual-language.md §5).
  action: { justifyContent: 'flex-start' },
});
