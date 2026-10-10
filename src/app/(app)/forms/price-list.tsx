import { router, useLocalSearchParams } from 'expo-router';

import { PriceListForm } from '../../../screens/price-lists/price-list-form';

// Create or edit a price list — a full page on a phone, a Dialog over Price Lists on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function PriceListPage() {
  const { merchantId, priceListId } = useLocalSearchParams<{ merchantId: string; priceListId?: string }>();

  return <PriceListForm merchantId={merchantId} priceListId={priceListId} onDismiss={() => router.back()} />;
}
