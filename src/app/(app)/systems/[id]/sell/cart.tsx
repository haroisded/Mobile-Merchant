import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { Cart } from '../../../../../screens/register/cart';

// The Register's cart and its payment: a page of the Sell stack narrow; wide, the same form is the Register's right pane
// (src/screens/register/index.tsx), and this page is reached by a link alone (.claude/instruction_mds/frontend.md §4.4).
export default function CartRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <Cart merchant={merchant} /> : null;
}
