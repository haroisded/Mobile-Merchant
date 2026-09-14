import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Text } from 'react-native-paper';

import { AdaptiveDialog } from '../../components/AdaptiveDialog';
import { useShellWide } from '../../lib/columns';
import { failureMessage, postgrestError } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { CategoryDialog } from './CategoryDialog';
import { childrenOf, topLevel, useCategoriesQuery, useDeleteCategoryMutation } from './queries';
import type { Category } from './queries';

type Notice = { type: 'error' | 'info'; text: string };

/**
 * The Categories section of the Products Setup screen: the category tree, two levels deep, with create,
 * rename and delete. The product form's picker creates inline; this is where a merchant tidies up.
 */
export function CategoriesSection({ merchantId }: { merchantId: string }) {
  const { colors } = useAppTheme();
  const categories = useCategoriesQuery({ merchantId });
  const [editing, setEditing] = useState<{ parent: Category | null; category?: Category } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const all = categories.data ?? [];
  const parents = topLevel(all);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text variant="headlineSmall" style={styles.fill}>
          Categories
        </Text>
        <Button compact mode="text" icon="plus" textColor={colors.accent} onPress={() => setEditing({ parent: null })}>
          New category
        </Button>
      </View>

      {categories.isPaused && !categories.data ? (
        <Text variant="bodyMedium">You&apos;re offline. Categories will load when you reconnect.</Text>
      ) : categories.isPending ? (
        <ActivityIndicator style={styles.start} />
      ) : categories.isError ? (
        <View style={styles.state}>
          <Text variant="bodyMedium">{failureMessage("Couldn't load categories. Try again.")}</Text>
          <Button onPress={() => categories.refetch()}>Try again</Button>
        </View>
      ) : parents.length === 0 ? (
        <Text variant="bodyMedium">No categories yet. Every product needs one.</Text>
      ) : (
        parents.map((parent) => (
          <View key={parent.id} style={[styles.group, { borderColor: colors.outlineVariant }]}>
            <CategoryRow
              category={parent}
              onAdd={() => setEditing({ parent })}
              onRename={() => setEditing({ parent: null, category: parent })}
              onDelete={() => setDeleting(parent)}
            />
            {childrenOf(all, parent.id).map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                nested
                onRename={() => setEditing({ parent, category: child })}
                onDelete={() => setDeleting(child)}
              />
            ))}
          </View>
        ))
      )}

      {editing ? (
        <CategoryDialog
          merchantId={merchantId}
          parent={editing.parent}
          category={editing.category}
          onDismiss={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteCategoryDialog
          category={deleting}
          subcategories={childrenOf(all, deleting.id).length}
          onDismiss={() => setDeleting(null)}
        />
      ) : null}
    </View>
  );
}

type RowProps = {
  category: Category;
  nested?: boolean;
  onAdd?: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function CategoryRow({ category, nested, onAdd, onRename, onDelete }: RowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.row, nested && [styles.nested, { borderTopColor: colors.surfaceVariant }]]}>
      <Text variant={nested ? 'bodyMedium' : 'titleMedium'} style={styles.fill} numberOfLines={1}>
        {category.name}
      </Text>
      {onAdd ? (
        <Button compact mode="text" icon="plus" textColor={colors.accent} onPress={onAdd}>
          Subcategory
        </Button>
      ) : null}
      <IconButton icon="edit-2" size={18} onPress={onRename} accessibilityLabel={`Rename ${category.name}`} />
      <IconButton icon="trash-2" size={18} iconColor={colors.error} onPress={onDelete} accessibilityLabel={`Delete ${category.name}`} />
    </View>
  );
}

function DeleteCategoryDialog({ category, subcategories, onDismiss }: { category: Category; subcategories: number; onDismiss: () => void }) {
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
  fill: { flex: 1 },
  section: { gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  start: { alignSelf: 'flex-start' },
  state: { gap: 12, alignItems: 'flex-start' },
  group: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 4, minHeight: 48 },
  nested: { paddingLeft: 32, borderTopWidth: 1 },
  action: { justifyContent: 'flex-start' },
});
