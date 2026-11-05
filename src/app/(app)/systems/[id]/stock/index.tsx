import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { StockIndex } from '../../../../../screens/stock';
import { useSession } from '../../../../../Store/StoreUser';

export default function StockRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);
  const userId = useSession()?.user.id;

  return <StockIndex merchantId={id} isOwner={merchant !== undefined && merchant.owner_id === userId} />;
}
