import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityIndicator } from '../../components/activity-indicator';
import { Button } from '../../components/button';
import { CategoryDialog } from '../../components/category-dialog';
import { DeleteCategoryDialog } from '../../components/delete-category-dialog';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { childrenOf, topLevel, useCategoriesQuery } from '../../features/categories/queries';
import type { Category } from '../../features/categories/queries';
import type { ResourceScope } from '../../features/products/resources';
import { useShellWide } from '../../lib/columns';
import { failureMessage } from '../../lib/errors';
import { useAppTheme } from '../../lib/theme';
import { spacing } from '../../themes';

/**
 * The Categories section of a Setup screen: one screen's category tree, two levels deep, with create,
 * rename and delete. The form's picker creates inline; this is where a merchant tidies up.
 *
 * `scope` is which screen's list this is — Products, Rentables and Inventory each keep their own
 * (src/features/products/resources.ts).
 *
 * Each dialog mounts here on a wide shell and opens as a formSheet route on a narrow one
 * (instruction_mds/visual-language.md §5).
 */
export function CategoriesSection({ merchantId, scope }: { merchantId: string; scope: ResourceScope }) {
  const { colors } = useAppTheme();
  const wide = useShellWide();
  const categories = useCategoriesQuery({ merchantId, scope });
  const [editing, setEditing] = useState<{ parent: Category | null; category?: Category } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const all = categories.data ?? [];
  const parents = topLevel(all);

  const edit = (parent: Category | null, category?: Category) => {
    if (wide) {
      setEditing({ parent, category });
      return;
    }
    router.push({
      pathname: '/sheets/category',
      params: { merchantId, scope, parentId: parent?.id, categoryId: category?.id },
    });
  };

  const remove = (category: Category) => {
    if (wide) {
      setDeleting(category);
      return;
    }
    router.push({ pathname: '/sheets/delete-category', params: { merchantId, scope, categoryId: category.id } });
  };

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text variant="headlineSmall" style={styles.fill}>
          Categories
        </Text>
        <Button compact mode="text" icon="add" textColor={colors.accent} onPress={() => edit(null)}>
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
              onAdd={() => edit(parent)}
              onRename={() => edit(null, parent)}
              onDelete={() => remove(parent)}
            />
            {childrenOf(all, parent.id).map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                nested
                onRename={() => edit(parent, child)}
                onDelete={() => remove(child)}
              />
            ))}
          </View>
        ))
      )}

      {editing ? (
        <CategoryDialog
          merchantId={merchantId}
          scope={scope}
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
        <Button compact mode="text" icon="add" textColor={colors.accent} onPress={onAdd}>
          Subcategory
        </Button>
      ) : null}
      <IconButton icon="edit" size={18} onPress={onRename} accessibilityLabel={`Rename ${category.name}`} />
      <IconButton icon="delete" size={18} iconColor={colors.error} onPress={onDelete} accessibilityLabel={`Delete ${category.name}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: spacing.ms },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  start: { alignSelf: 'flex-start' },
  state: { gap: spacing.ms, alignItems: 'flex-start' },
  group: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.ms, paddingRight: spacing.xs, minHeight: 48 },
  nested: { paddingLeft: spacing.xl, borderTopWidth: 1 },
});
