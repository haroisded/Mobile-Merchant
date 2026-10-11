import { router } from 'expo-router';

import { RecordIndex } from '../../components/record-index';
import type { IndexSection } from '../../components/record-index';

/** The pages under src/app/(app)/systems/[id]/stock/. */
type StockRoute = 'items' | 'item-prices';

// What is sold and what is on hand, grouped as .claude/erpnext-docs/POS-System-Added-Features.md groups it. A
// section appears once its first screen exists; the stock documents and reports arrive with their steps.
const SECTIONS: IndexSection<StockRoute>[] = [
  {
    title: 'Items & Pricing',
    hint: 'What is sold, and what it sells for',
    entries: [
      { label: 'Items', hint: 'Products and services: units, defaults, tax', doctype: 'Item', route: 'items' },
      { label: 'Item Prices', hint: 'The rate of an item in a price list', doctype: 'Item Price', route: 'item-prices' },
    ],
  },
];

/** Stock: the index of a system's items, prices and stock, a rail destination. */
export function StockIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  return (
    <RecordIndex
      merchantId={merchantId}
      kicker={merchantName}
      title="Stock"
      meta="The items you sell, and their prices"
      isOwner={isOwner}
      sections={SECTIONS}
      onOpen={(route) => router.push(`/systems/${merchantId}/stock/${route}`)}
      offline="You're offline. Stock will load when you reconnect."
      failure="Couldn't load Stock. Try again."
      empty="Your roles give you nothing to see here. Ask the owner if you need more."
    />
  );
}
