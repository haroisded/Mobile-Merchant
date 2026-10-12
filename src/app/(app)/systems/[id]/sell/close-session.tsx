import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { CloseSession } from '../../../../../screens/pos-closing-entries/close-session';

// Close a session: the reader's own without `docId`, or the one a manager picked in POS Opening Entries.
export default function CloseSessionRoute() {
  const { id, docId } = useLocalSearchParams<{ id: string; docId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <CloseSession merchant={merchant} docId={docId} /> : null;
}
