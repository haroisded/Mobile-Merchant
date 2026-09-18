import { router } from 'expo-router';
import { useState } from 'react';

import { CategoryDialog } from '../../components/category-dialog';
import { MenuSelect } from '../../components/menu-select';
import { childrenOf, topLevel, useCategoriesQuery } from '../../features/categories/queries';
import type { ResourceScope } from '../../features/products/resources';
import { useShellWide } from '../../lib/columns';
import { useSheetResult } from '../../Store/sheet-result';

type Props = {
  merchantId: string;
  /** Which screen's categories to offer, and which list a new one is created in. */
  scope: ResourceScope;
  /** Pick a subcategory of this category. Null picks a top-level category. */
  parentId: string | null;
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
  error?: boolean;
  /** A subcategory is optional, so its picker offers "None". */
  clearable?: boolean;
};

/**
 * The inline-create picker (instruction_mds/visual-language.md §5): a Select whose last row opens the create
 * dialog, and whatever is created comes back selected. The merchant never leaves the form to set up a
 * category first.
 *
 * Only this screen's categories are offered, and a new one is created in this screen's list — the
 * database refuses the other combination anyway.
 *
 * Wide, the dialog mounts here and hands the row back through `onCreated`. Narrow, it is a formSheet
 * route, so the row comes back through the sheet-result slot under this picker's key.
 */
export function CategoryPicker({ merchantId, scope, parentId, value, onChange, accessibilityLabel, error, clearable }: Props) {
  const wide = useShellWide();
  const categories = useCategoriesQuery({ merchantId, scope });
  const [creating, setCreating] = useState(false);
  const resultKey = parentId ? 'subcategory' : 'category';
  useSheetResult(resultKey, onChange);

  const all = categories.data ?? [];
  const parent = parentId ? (all.find((category) => category.id === parentId) ?? null) : null;
  const rows = parentId ? childrenOf(all, parentId) : topLevel(all);
  const options = rows.map((category) => ({ value: category.id, label: category.name }));

  const create = () => {
    if (wide) {
      setCreating(true);
      return;
    }
    router.push({
      pathname: '/sheets/category',
      params: { merchantId, scope, resultKey, parentId: parent?.id },
    });
  };

  return (
    <>
      <MenuSelect
        value={value}
        options={clearable ? [{ value: '', label: 'None' }, ...options] : options}
        onChange={onChange}
        placeholder={
          categories.isError
            ? "Couldn't load categories"
            : categories.isPending
              ? 'Loading…'
              : parentId
                ? 'Optional'
                : 'Select category'
        }
        accessibilityLabel={accessibilityLabel}
        error={error}
        // A subcategory needs its parent picked first.
        disabled={parentId !== null && !parent}
        createLabel={parentId ? 'New subcategory' : 'New category'}
        onCreate={create}
      />
      {creating ? (
        <CategoryDialog
          merchantId={merchantId}
          scope={scope}
          parent={parent}
          onDismiss={() => setCreating(false)}
          onCreated={(category) => onChange(category.id)}
        />
      ) : null}
    </>
  );
}
