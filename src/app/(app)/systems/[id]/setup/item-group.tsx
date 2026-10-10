import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { ItemGroupPage } from '../../../../../screens/item-groups/item-group-form';

// One Item Group, new under `parentId` without `groupId`. A page of the Setup stack at every width: a long
// form with its defaults and Item Tax rows (.claude/instruction_mds/frontend.md §4.4).
export default function ItemGroupRoute() {
  const { id, groupId, parentId } = useLocalSearchParams<{ id: string; groupId?: string; parentId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <ItemGroupPage merchant={merchant} groupId={groupId} parentId={parentId} /> : null;
}
