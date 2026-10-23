import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PosInvoicePage } from '../../../../../screens/pos-orders/pos-invoice';

// One POS Invoice — its receipt — by `docId`. ../stock/ and ../accounts/ re-export it, so a ledger row opens its
// sale without leaving the stack it was read in (src/components/ledger-filters.tsx, useVoucherRoutes). `after=sale`:
// opened by the sale just made, so Return to Register in place of the back arrow (PosInvoicePage).
export default function PosInvoiceRoute() {
  const { id, docId, after } = useLocalSearchParams<{ id: string; docId: string; after?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PosInvoicePage merchant={merchant} docId={docId} after={after === 'sale'} /> : null;
}
