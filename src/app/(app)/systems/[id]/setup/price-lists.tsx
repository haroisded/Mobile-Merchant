import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PriceLists } from '../../../../../screens/price-lists';

export default function PriceListsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PriceLists merchant={merchant} /> : null;
}
