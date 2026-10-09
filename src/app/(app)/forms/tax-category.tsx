import { router, useLocalSearchParams } from 'expo-router';

import { TaxCategoryForm } from '../../../screens/tax-categories/tax-category-form';

// Create or edit a tax category — a full page on a phone, a Dialog over Tax Categories on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function TaxCategoryPage() {
  const { merchantId, categoryId } = useLocalSearchParams<{ merchantId: string; categoryId?: string }>();

  return <TaxCategoryForm merchantId={merchantId} categoryId={categoryId} onDismiss={() => router.back()} />;
}
