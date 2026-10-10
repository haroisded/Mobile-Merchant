import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PrintFormats } from '../../../../../screens/print-formats';

export default function PrintFormatsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PrintFormats merchant={merchant} /> : null;
}
