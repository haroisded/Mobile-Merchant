import { router, useLocalSearchParams } from 'expo-router';

import { CategoryDialog } from '../../../components/category-dialog';
import { useCategoriesQuery } from '../../../features/categories/queries';
import { isResourceScope } from '../../../features/products/resources';
import { setSheetResult } from '../../../Store/sheet-result';

// Create or rename a category on a narrow container (instruction_mds/visual-language.md §5). The rows come from
// the query cache the picker or Setup already filled; while a row an id names is not there yet, the
// sheet waits rather than rendering a create where a rename was asked for.
export default function CategorySheet() {
  const { merchantId, scope, parentId, categoryId, resultKey } = useLocalSearchParams<{
    merchantId: string;
    scope: string;
    parentId?: string;
    categoryId?: string;
    resultKey?: string;
  }>();
  const parsedScope = isResourceScope(scope) ? scope : undefined;
  const categories = useCategoriesQuery({ merchantId, scope: parsedScope ?? 'products' });
  const all = categories.data ?? [];
  const parent = parentId ? all.find((row) => row.id === parentId) : null;
  const category = categoryId ? all.find((row) => row.id === categoryId) : undefined;

  if (!parsedScope || parent === undefined || (categoryId && !category)) return null;

  return (
    <CategoryDialog
      merchantId={merchantId}
      scope={parsedScope}
      parent={parent}
      category={category}
      inSheet
      onDismiss={() => router.back()}
      onCreated={(row) => {
        if (resultKey) setSheetResult(resultKey, row.id);
      }}
    />
  );
}
