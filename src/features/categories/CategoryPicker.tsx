import { useState } from 'react';

import { MenuSelect } from '../../components/MenuSelect';
import { CategoryDialog } from './CategoryDialog';
import { childrenOf, topLevel, useCategoriesQuery } from './queries';

type Props = {
  merchantId: string;
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
 * The inline-create picker (docs/visual-language.md §5): a Select whose last row opens the create
 * dialog, and whatever is created comes back selected. The merchant never leaves the product form to
 * set up a category first.
 */
export function CategoryPicker({ merchantId, parentId, value, onChange, accessibilityLabel, error, clearable }: Props) {
  const categories = useCategoriesQuery({ merchantId });
  const [creating, setCreating] = useState(false);

  const all = categories.data ?? [];
  const parent = parentId ? (all.find((category) => category.id === parentId) ?? null) : null;
  const rows = parentId ? childrenOf(all, parentId) : topLevel(all);
  const options = rows.map((category) => ({ value: category.id, label: category.name }));

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
        onCreate={() => setCreating(true)}
      />
      {creating ? (
        <CategoryDialog
          merchantId={merchantId}
          parent={parent}
          onDismiss={() => setCreating(false)}
          onCreated={(category) => onChange(category.id)}
        />
      ) : null}
    </>
  );
}
