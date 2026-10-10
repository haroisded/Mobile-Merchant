import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { ItemGroups } from '../../../../../screens/item-groups';

// One route for every folder: `parent` is the open group, and each folder is a push of this route
// (src/components/folder-nav.tsx).
export default function ItemGroupsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <ItemGroups merchant={merchant} /> : null;
}
