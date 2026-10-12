import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PosReturnPage } from '../../../../../screens/pos-orders/pos-return';

// The return of one POS Invoice, by the sale's `docId`. ../stock/ and ../accounts/ re-export it, as they do the
// sale's own page, so Return works from wherever the sale was opened (src/components/ledger-filters.tsx, useVoucherRoutes).
export default function PosReturnRoute() {
  const { id, docId } = useLocalSearchParams<{ id: string; docId: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PosReturnPage merchant={merchant} docId={docId} /> : null;
}
