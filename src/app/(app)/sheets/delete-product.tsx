import { router, useLocalSearchParams } from 'expo-router';
import * as z from 'zod';

import { DeleteProductDialog } from '../../../components/delete-product-dialog';
import { setSheetResult } from '../../../Store/sheet-result';

// A route param is a string anyone can put in a URL, so the list is parsed at this boundary rather
// than trusted.
const productsParam = z.array(z.object({ id: z.string(), name: z.string() })).min(1);

function parseProducts(raw: string | undefined) {
  try {
    return productsParam.safeParse(JSON.parse(raw ?? '')).data;
  } catch {
    return undefined;
  }
}

// Delete products on a narrow container (instruction_mds/visual-language.md §5). The outcome goes back to the
// screen that opened it: the list clears its selection, the detail leaves. Archive needs no sheet any
// more — it writes straight away and offers Undo (src/components/archive-undo.tsx).
export default function DeleteProductSheet() {
  const { products, resultKey } = useLocalSearchParams<{ products: string; resultKey?: string }>();
  const parsed = parseProducts(products);

  if (!parsed) return null;

  return (
    <DeleteProductDialog
      products={parsed}
      inSheet
      onDismiss={() => router.back()}
      onDone={() => {
        router.back();
        if (resultKey) setSheetResult(resultKey, 'deleted');
      }}
    />
  );
}
