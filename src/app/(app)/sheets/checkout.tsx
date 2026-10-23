import { router, useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../features/merchants/queries';
import { CheckoutDialog } from '../../../screens/register/cart';

// The Register's Complete order on a phone, as a native sheet over it (.claude/instruction_mds/frontend.md §4.4);
// wide, the same body is a Dialog the Register mounts. The cart is src/Store/cart.ts's, so the route needs only `id`.
export default function CheckoutSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Opened from a system's Register, so the merchant is in the list: a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <CheckoutDialog merchant={merchant} inSheet onDismiss={() => router.back()} /> : null;
}
