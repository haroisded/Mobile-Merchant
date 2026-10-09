import { useLocalSearchParams } from 'expo-router';

import { useMerchantsQuery } from '../../../../../features/merchants/queries';
import { ItemTaxTemplates } from '../../../../../screens/item-tax-templates';

export default function ItemTaxTemplatesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // The shell only renders this once the merchant is in the list, so this is a cache hit.
  const merchant = useMerchantsQuery().data?.find((candidate) => candidate.id === id);

  return merchant ? <ItemTaxTemplates merchant={merchant} /> : null;
}
