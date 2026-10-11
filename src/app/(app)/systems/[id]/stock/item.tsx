import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { ItemPage } from '../../../../../screens/items/item-form';

// One Item, new without `itemId`. A page of the Stock stack at every width: a long form with its UOMs and
// Item Tax rows (.claude/instruction_mds/frontend.md §4.4).
export default function ItemRoute() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <ItemPage merchant={merchant} itemId={itemId} /> : null;
}
