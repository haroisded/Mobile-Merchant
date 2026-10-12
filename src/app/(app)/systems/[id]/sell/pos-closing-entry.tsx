import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PosClosingEntryPage } from '../../../../../screens/pos-closing-entries/pos-closing-entry';

// One POS Closing Entry, by `docId`.
export default function PosClosingEntryRoute() {
  const { id, docId } = useLocalSearchParams<{ id: string; docId: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PosClosingEntryPage merchant={merchant} docId={docId} /> : null;
}
