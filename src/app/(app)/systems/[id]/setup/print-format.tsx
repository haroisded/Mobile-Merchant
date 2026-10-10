import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { PrintFormatPage } from '../../../../../screens/print-formats/print-format-form';

// One Print Format, new without `formatId`. A page of the Setup stack at every width: a form with a sample
// receipt under it (.claude/instruction_mds/frontend.md §4.4).
export default function PrintFormatRoute() {
  const { id, formatId } = useLocalSearchParams<{ id: string; formatId?: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <PrintFormatPage merchant={merchant} formatId={formatId} /> : null;
}
