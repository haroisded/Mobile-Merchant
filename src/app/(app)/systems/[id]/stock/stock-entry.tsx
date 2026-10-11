import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { StockEntryPage } from '../../../../../screens/stock-entries/stock-entry-form';

// One Stock Entry, new without `docId`. A page of the stack it was opened from at every width: a document with
// rows (.claude/instruction_mds/frontend.md §4.4). ../accounts/ re-exports it, so a General Ledger row opens
// its document without leaving Accounts (src/components/ledger-filters.tsx, useVoucherRoutes).
export default function StockEntryRoute() {
  const { id, docId } = useLocalSearchParams<{ id: string; docId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <StockEntryPage merchant={merchant} docId={docId} /> : null;
}
