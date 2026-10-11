import { router, useLocalSearchParams } from 'expo-router';

import { ItemPriceForm } from '../../../screens/item-prices/item-price-form';

// Create or edit an item price — a full page on a phone, a Dialog over Item Prices on a tablet
// (.claude/instruction_mds/frontend.md §4.4; presentation in ../_layout.tsx).
export default function ItemPricePage() {
  const { merchantId, priceId } = useLocalSearchParams<{ merchantId: string; priceId?: string }>();

  return <ItemPriceForm merchantId={merchantId} priceId={priceId} onDismiss={() => router.back()} />;
}
