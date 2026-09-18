import { router, useLocalSearchParams } from 'expo-router';

import { DeleteCategoryDialog } from '../../../components/delete-category-dialog';
import { childrenOf, useCategoriesQuery } from '../../../features/categories/queries';
import { isResourceScope } from '../../../features/products/resources';

// Delete a category on a narrow container (instruction_mds/visual-language.md §5). `scope` names which screen's
// list the category is in, so the cached rows this reads are the ones Setup was showing.
export default function DeleteCategorySheet() {
  const { merchantId, scope, categoryId } = useLocalSearchParams<{
    merchantId: string;
    scope: string;
    categoryId: string;
  }>();
  const parsedScope = isResourceScope(scope) ? scope : undefined;
  const categories = useCategoriesQuery({ merchantId, scope: parsedScope ?? 'products' });
  const all = categories.data ?? [];
  const category = all.find((row) => row.id === categoryId);

  if (!parsedScope || !category) return null;

  return (
    <DeleteCategoryDialog
      category={category}
      subcategories={childrenOf(all, category.id).length}
      inSheet
      onDismiss={() => router.back()}
    />
  );
}
