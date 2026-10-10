import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { UomConversionFactors } from '../../../../../screens/uom-conversion-factors';

export default function UomConversionFactorsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <UomConversionFactors merchant={merchant} /> : null;
}
