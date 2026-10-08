import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { CostCenters } from '../../../../../screens/cost-centers';

// One route for every folder: `parent` is the open group, and each folder is a push of this route
// (src/components/folder-nav.tsx).
export default function CostCentersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <CostCenters merchant={merchant} /> : null;
}
