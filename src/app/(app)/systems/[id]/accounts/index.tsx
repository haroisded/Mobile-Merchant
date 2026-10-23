import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { GeneralLedger } from '../../../../../screens/general-ledger';

// Accounts opens on the General Ledger itself, its one page (the human, 2026-10-23): no index card to tap first.
export default function AccountsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <GeneralLedger merchant={merchant} root /> : null;
}
